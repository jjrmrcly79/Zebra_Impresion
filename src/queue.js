import { config } from './config.js'
import { renderTemplate, renderRaw } from './render.js'
import { printCard } from './print.js'

// Modo COLA: el bridge consume vecino.print_jobs (los crea Vecinity al aprobar
// una solicitud de tarjeta). Polling con QUEUE_POLL=true en .env.
// Las RPCs print_take_jobs / print_mark_job solo las puede ejecutar service_role.

// La tarjeta de visita frecuente usa la misma plantilla peatonal
// (el payload trae rotulo='VISITA FRECUENTE' y su propio QR).
const TIPO_PLANTILLA = { vehicular: 'vehiculo', peatonal: 'peatonal', visita: 'peatonal' }

function headers(extra = {}) {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  }
  return {
    apikey: config.supabaseServiceKey,
    Authorization: `Bearer ${config.supabaseServiceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function rpc(fn, args = {}) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers({ 'Content-Profile': 'vecino' }), // RPC en schema vecino
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`RPC ${fn} → ${res.status}: ${await res.text()}`)
  return res.json()
}

// Frente compartido por colonia: 1º la imagen configurada en la colonia
// (tarjeta_frente_url), si no hay, FRONT_IMAGE local del .env. Cacheado.
const frenteCache = new Map()
async function frenteDeColonia(coloniaId) {
  if (frenteCache.has(coloniaId)) return frenteCache.get(coloniaId)

  let buf = null
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/colonias?id=eq.${coloniaId}&select=tarjeta_frente_url`,
    { headers: headers({ 'Accept-Profile': 'vecino' }) }
  )
  const [colonia] = res.ok ? await res.json() : []
  if (colonia?.tarjeta_frente_url) {
    const img = await fetch(colonia.tarjeta_frente_url)
    if (!img.ok) throw new Error(`No se pudo descargar el frente de la colonia (${img.status})`)
    buf = await renderRaw(Buffer.from(await img.arrayBuffer()))
  } else if (config.frontImagePath) {
    const { readFile } = await import('node:fs/promises')
    buf = await renderRaw(await readFile(config.frontImagePath))
  } else {
    throw new Error('Sin imagen de frente: configura tarjeta_frente_url en la colonia o FRONT_IMAGE en .env')
  }
  frenteCache.set(coloniaId, buf)
  return buf
}

async function procesarJob(job) {
  const plantilla = TIPO_PLANTILLA[job.tipo]
  if (!plantilla) throw new Error(`Tipo de tarjeta desconocido: ${job.tipo}`)

  const data = { ...job.payload }
  // El QR se arma aquí: el payload trae el id, el bridge la URL base.
  if (job.tipo === 'peatonal' && data.profileId) {
    data.qrUrl = `${config.defaultQrUrl}/r/${data.profileId}`   // residente
  } else if (job.tipo === 'visita' && data.cardId) {
    data.qrUrl = `${config.defaultQrUrl}/vf/${data.cardId}`     // visita frecuente
  }

  const front = await frenteDeColonia(job.colonia_id)
  const back = await renderTemplate(plantilla, data)
  return printCard({ front, back, copies: 1, jobId: `queue-${job.id.slice(0, 8)}` })
}

let enCurso = false
async function tick() {
  if (enCurso) return // no encimar ciclos si la impresión tarda más que el intervalo
  enCurso = true
  try {
    const jobs = await rpc('print_take_jobs', { p_limit: 3 })
    for (const job of jobs) {
      const etiqueta = job.payload?.placa || job.payload?.nombre || job.id
      try {
        const r = await procesarJob(job)
        await rpc('print_mark_job', { p_id: job.id, p_ok: true })
        console.log(`Cola: tarjeta ${job.tipo} "${etiqueta}" ${r.dryRun ? 'generada (DRY_RUN)' : 'impresa'}`)
      } catch (err) {
        // El fallo de UNA tarjeta no tumba el ciclo: se marca error y sigue.
        console.error(`Cola: error en "${etiqueta}": ${err.message}`)
        await rpc('print_mark_job', { p_id: job.id, p_ok: false, p_error: err.message })
          .catch((e) => console.error(`Cola: no se pudo marcar el error: ${e.message}`))
      }
    }
  } catch (err) {
    console.error(`Cola: ${err.message}`) // red caída, etc. — reintenta al siguiente tick
  } finally {
    enCurso = false
  }
}

export function startQueueWorker() {
  if (!config.queuePoll) return false
  setInterval(tick, config.queueIntervalMs)
  tick() // primer barrido inmediato al arrancar
  return true
}
