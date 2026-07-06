import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './src/config.js'
import { renderTemplate, renderRaw } from './src/render.js'
import { printCard, printerStatus, purgeTmp } from './src/print.js'
import { templates } from './templates/index.js'
import { listColonias, listVehicles, listResidentes } from './src/supabase.js'
import { startQueueWorker } from './src/queue.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '25mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

let jobCounter = 0
const nextJobId = () => `job-${Date.now()}-${++jobCounter}`

/** Todos los endpoints (menos /health y la web) exigen el token: también los de
 *  datos, porque /vehicles y /residentes exponen información de residentes. */
function requireToken(req, res, next) {
  if (!config.printToken) {
    return res.status(500).json({ ok: false, error: 'PRINT_TOKEN no configurado en .env' })
  }
  const token = req.get('x-print-token') || req.body?.token || req.query?.token
  if (token !== config.printToken) {
    return res.status(401).json({ ok: false, error: 'Token inválido' })
  }
  next()
}

// Tipos de credencial imprimibles por lote. Cada tipo define la plantilla del
// reverso y cómo etiquetar cada tarjeta en los resultados.
const BATCH_TYPES = {
  vehicular: { backTemplate: 'vehiculo', label: (row) => `${row.placa || '?'} · Casa ${row.casa || '?'}` },
  peatonal: { backTemplate: 'peatonal', label: (row) => `${row.nombre || '?'} · Casa ${row.casa || '?'}` },
}

/** Resuelve el PNG de una cara desde plantilla o imagen directa. */
async function resolveSide({ template, data, png, file }) {
  if (file) return renderRaw(file.buffer)        // archivo subido (multipart)
  if (png) return renderRaw(png)                 // dataURL/base64 (JSON)
  if (template) return renderTemplate(template, data || {})
  return null
}

/** Normaliza el body (JSON o multipart) a { front, back, copies }. */
async function buildSides(req, { requireFront = true } = {}) {
  const isMultipart = !!req.files
  const body = req.body || {}
  const data = typeof body.data === 'string' ? JSON.parse(body.data || '{}') : body.data
  const backData = typeof body.backData === 'string' ? JSON.parse(body.backData || '{}') : body.backData

  const files = isMultipart
    ? { png: (req.files.png || [])[0], backPng: (req.files.backPng || [])[0] }
    : {}

  const front = await resolveSide({ template: body.template, data, png: body.png, file: files.png })
  const back = await resolveSide({ template: body.backTemplate, data: backData, png: body.backPng, file: files.backPng })

  if (requireFront && !front) throw new Error('Falta el frente: manda "template"+"data", o "png", o sube un archivo.')
  return { front, back, copies: Number(body.copies) || 1 }
}

const uploadFields = upload.fields([{ name: 'png', maxCount: 1 }, { name: 'backPng', maxCount: 1 }])

// --- Rutas ---

app.get('/health', async (_req, res) => {
  const printer = await printerStatus()
  res.json({
    ok: true,
    service: 'nexia-print-bridge',
    printer: config.printerName,
    pageSize: config.pageSize,
    ribbon: config.ribbon,
    dryRun: config.dryRun,
    queue: config.queuePoll,
    templates: Object.keys(templates),
    printerStatus: printer,
  })
})

// Previsualizar SIN imprimir: devuelve el PNG del frente (para que la app lo muestre).
app.post('/preview', uploadFields, requireToken, async (req, res) => {
  try {
    const { front, back } = await buildSides(req, { requireFront: false })
    const img = req.query.side === 'back' ? back : front
    if (!img) return res.status(400).json({ ok: false, error: 'Esa cara no tiene contenido' })
    res.type('image/png').send(img)
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

// Imprimir (token requerido).
app.post('/print', uploadFields, requireToken, async (req, res) => {
  try {
    const { front, back, copies } = await buildSides(req)
    const result = await printCard({ front, back, copies, jobId: nextJobId() })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// --- Lote desde Supabase (schema vecino) ---

app.get('/colonias', requireToken, async (_req, res) => {
  try {
    res.json({ ok: true, colonias: await listColonias() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/vehicles', requireToken, async (req, res) => {
  try {
    if (!req.query.colonia) return res.status(400).json({ ok: false, error: 'Falta ?colonia=ID' })
    res.json({ ok: true, vehicles: await listVehicles(req.query.colonia) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/residentes', requireToken, async (req, res) => {
  try {
    if (!req.query.colonia) return res.status(400).json({ ok: false, error: 'Falta ?colonia=ID' })
    res.json({ ok: true, residentes: await listResidentes(req.query.colonia) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Imprime un lote: MISMO frente (imagen) + un reverso por renglón según el tipo
// de credencial ("vehicular" = plantilla vehiculo, "peatonal" = plantilla peatonal).
app.post('/print-batch', upload.fields([{ name: 'png', maxCount: 1 }]), requireToken, async (req, res) => {
  try {
    const frontFile = (req.files?.png || [])[0]
    if (!frontFile) return res.status(400).json({ ok: false, error: 'Falta la imagen del frente (png)' })
    const tipo = BATCH_TYPES[req.body.tipo || 'vehicular']
    if (!tipo) return res.status(400).json({ ok: false, error: `Tipo de credencial desconocido: "${req.body.tipo}". Válidos: ${Object.keys(BATCH_TYPES).join(', ')}` })
    const rows = JSON.parse(req.body.rows || '[]')
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ ok: false, error: 'No hay renglones para imprimir' })
    if (rows.length > 400) return res.status(400).json({ ok: false, error: `Demasiados (${rows.length}). Máximo 400 por lote.` })

    const front = await renderRaw(frontFile.buffer)        // frente compartido, se renderiza 1 vez
    const copies = Number(req.body.copies) || 1
    const results = []
    for (const row of rows) {
      try {
        const back = await renderTemplate(tipo.backTemplate, row)
        const r = await printCard({ front, back, copies, jobId: nextJobId() })
        results.push({ tarjeta: tipo.label(row), ok: true, jobId: r.jobId })
      } catch (err) {
        results.push({ tarjeta: tipo.label(row), ok: false, error: err.message })
      }
    }
    const okCount = results.filter((r) => r.ok).length
    console.log(`Lote ${req.body.tipo || 'vehicular'}: ${okCount}/${rows.length} tarjetas${config.dryRun ? ' (DRY_RUN)' : ' enviadas a impresión'}`)
    res.json({ ok: true, total: rows.length, impresas: okCount, dryRun: config.dryRun, results })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.use(express.static(path.join(__dirname, 'public')))

app.listen(config.port, '127.0.0.1', async () => {
  console.log(`nexia-print-bridge escuchando en http://localhost:${config.port}`)
  console.log(`Impresora: ${config.printerName} · ${config.pageSize} · ribbon ${config.ribbon}${config.dryRun ? ' · DRY_RUN' : ''}`)
  const purged = await purgeTmp()
  if (purged) console.log(`tmp/: ${purged} PDF(s) de jobs viejos eliminados`)
  if (startQueueWorker()) {
    console.log(`Cola Vecinity activa: barrido cada ${config.queueIntervalMs / 1000}s (vecino.print_jobs)`)
  }
})
