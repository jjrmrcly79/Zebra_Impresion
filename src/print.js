import { execFile } from 'node:child_process'
import { writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { config } from './config.js'

const execFileP = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TMP_DIR = path.join(__dirname, '..', 'tmp')

// Tamaño de página CR80 en PUNTOS, tal como lo declara el PPD de la ZC300:
// *PageSize CR80: [241.5 153.6]
const PAGE_PT = { CR80: [241.5, 153.6], CR81: [245.8, 153.6], CR82: [245.8, 155.5] }

/**
 * Arma un PDF (1 o 2 páginas) con las imágenes de la tarjeta a tamaño CR80.
 * Página 1 = frente, página 2 = reverso (si existe).
 * @param {Buffer[]} sideBuffers - 1 o 2 buffers PNG.
 * @returns {Promise<string>} ruta del PDF generado.
 */
async function buildPdf(sideBuffers, jobId) {
  await mkdir(TMP_DIR, { recursive: true })
  const size = PAGE_PT[config.pageSize] || PAGE_PT.CR80
  const pdfPath = path.join(TMP_DIR, `${jobId}.pdf`)

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => writeFile(pdfPath, Buffer.concat(chunks)).then(resolve, reject))
    doc.on('error', reject)

    for (const buf of sideBuffers) {
      if (!buf) continue
      doc.addPage({ size, margin: 0 })
      doc.image(buf, 0, 0, { width: size[0], height: size[1] })
    }
    doc.end()
  })

  return pdfPath
}

/**
 * Imprime una o dos caras en la ZC300 vía CUPS.
 * @param {Object} opts
 * @param {Buffer} opts.front - PNG del frente (obligatorio).
 * @param {Buffer} [opts.back] - PNG del reverso (opcional).
 * @param {number} [opts.copies=1]
 * @param {string} opts.jobId
 * @returns {Promise<{jobId:string, pdfPath:string, dryRun:boolean, stdout?:string}>}
 */
export async function printCard({ front, back, copies = 1, jobId }) {
  if (!front) throw new Error('Falta la imagen del frente')
  const sides = back ? [front, back] : [front]
  const pdfPath = await buildPdf(sides, jobId)

  if (config.dryRun) {
    return { jobId, pdfPath, dryRun: true }
  }

  const args = [
    '-d', config.printerName,
    '-o', `PageSize=${config.pageSize}`,
    '-o', `RibbonName=${config.ribbon}`,
    '-n', String(Math.max(1, Math.min(50, Number(copies) || 1))),
    pdfPath,
  ]

  const { stdout } = await execFileP('lp', args)
  // lp ya copió el archivo a la cola CUPS: el PDF local sobra (1+ MB por tarjeta).
  await unlink(pdfPath).catch(() => {})
  return { jobId, dryRun: false, stdout: stdout.trim() }
}

/** Borra PDFs de jobs viejos en tmp/ (los DRY_RUN se conservan unos días para revisarlos). */
export async function purgeTmp(maxAgeDays = 7) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  let removed = 0
  try {
    for (const name of await readdir(TMP_DIR)) {
      if (!/^job-.*\.pdf$/.test(name)) continue
      const full = path.join(TMP_DIR, name)
      const info = await stat(full)
      if (info.mtimeMs < cutoff) {
        await unlink(full).catch(() => {})
        removed++
      }
    }
  } catch {
    // tmp/ aún no existe — nada que limpiar
  }
  return removed
}

/** Verifica que la cola CUPS exista y esté disponible. */
export async function printerStatus() {
  try {
    const { stdout } = await execFileP('lpstat', ['-p', config.printerName])
    return { ok: true, detail: stdout.trim() }
  } catch (err) {
    return { ok: false, detail: err.stderr?.trim() || err.message }
  }
}
