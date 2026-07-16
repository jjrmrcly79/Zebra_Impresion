import { config } from './config.js'
import { renderTemplate, renderRaw } from './render.js'
import { printCard } from './print.js'

// Modo COLA: el bridge consume vecino.print_jobs (los crea Vecinity al aprobar
// una solicitud de tarjeta). Dos formas de consumir:
//   · Manual (consola /cola.html): el operador selecciona jobs → print_take_selected.
//   · Automática (toggle o QUEUE_POLL=true): barrido cada N seg → print_take_jobs.
// Las RPCs de la cola solo las puede ejecutar service_role.

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

export async function rpc(fn, args = {}) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers({ 'Content-Profile': 'vecino' }), // RPC en schema vecino
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const txt = await res.text()
    let msg = txt
    try { msg = JSON.parse(txt).message || txt } catch { /* texto plano */ }
    throw new Error(`RPC ${fn}: ${msg}`)
  }
  return res.json()
}

// Frente compartido por colonia Y por tipo: visita tiene su propio diseño
// (tarjeta_frente_visita_url) y cae al general (tarjeta_frente_url) si no hay.
// Fallback final: FRONT_IMAGE local del .env. Cacheado por colonia+tipo.
const frenteCache = new Map()
export async function frenteDeColonia(coloniaId, tipo = '') {
  const esVisita = tipo === 'visita'
  const cacheKey = `${coloniaId}:${esVisita ? 'visita' : 'std'}`
  if (frenteCache.has(cacheKey)) return frenteCache.get(cacheKey)

  let buf = null
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/colonias?id=eq.${coloniaId}&select=tarjeta_frente_url,tarjeta_frente_visita_url`,
    { headers: headers({ 'Accept-Profile': 'vecino' }) }
  )
  const [colonia] = res.ok ? await res.json() : []
  const url = (esVisita && colonia?.tarjeta_frente_visita_url) || colonia?.tarjeta_frente_url
  if (url) {
    const img = await fetch(url)
    if (!img.ok) throw new Error(`No se pudo descargar el frente de la colonia (${img.status})`)
    buf = await renderRaw(Buffer.from(await img.arrayBuffer()))
  } else if (config.frontImagePath) {
    const { readFile } = await import('node:fs/promises')
    buf = await renderRaw(await readFile(config.frontImagePath))
  } else {
    throw new Error('Sin imagen de frente: configura tarjeta_frente_url en la colonia o FRONT_IMAGE en .env')
  }
  frenteCache.set(cacheKey, buf)
  return buf
}

/** ¿El job es tarjeta BLANCA? (vehicular sin personalizar: se entrega el RFID
 *  tal cual, sin pasar por la impresora — no gasta ribbon). */
export function esBlanca(job) {
  return job.tipo === 'vehicular' && job.payload?.personalizada === false
}

/** Datos de plantilla del job con el QR ya armado (el payload trae el id,
 *  el bridge pone la URL base). */
export function datosDelJob(job) {
  const data = { ...job.payload }
  if (job.tipo === 'peatonal' && data.profileId) {
    data.qrUrl = `${config.defaultQrUrl}/r/${data.profileId}`   // residente
  } else if (job.tipo === 'visita' && data.cardId) {
    data.qrUrl = `${config.defaultQrUrl}/vf/${data.cardId}`     // visita frecuente
  }
  return data
}

/** Reverso del job como PNG, SIN imprimir (preview de la consola). */
export async function renderReversoJob(job) {
  if (esBlanca(job)) throw new Error('Tarjeta blanca: se entrega sin imprimir, no hay diseño que previsualizar.')
  const plantilla = TIPO_PLANTILLA[job.tipo]
  if (!plantilla) throw new Error(`Tipo de tarjeta desconocido: ${job.tipo}`)
  return renderTemplate(plantilla, datosDelJob(job))
}

export async function procesarJob(job, { jobIdPrefix = 'queue' } = {}) {
  if (esBlanca(job)) {
    // Nada que imprimir: el operador entrega una tarjeta blanca del stock.
    return { blanca: true, dryRun: config.dryRun }
  }
  const plantilla = TIPO_PLANTILLA[job.tipo]
  if (!plantilla) throw new Error(`Tipo de tarjeta desconocido: ${job.tipo}`)

  const front = await frenteDeColonia(job.colonia_id, job.tipo)
  const back = await renderTemplate(plantilla, datosDelJob(job))
  return printCard({ front, back, copies: 1, jobId: `${jobIdPrefix}-${job.id.slice(0, 8)}` })
}

export const etiquetaDelJob = (job) => job.payload?.placa || job.payload?.nombre || job.id

/** Imprime UN job ya tomado (estado=imprimiendo) y lo marca. Compartido por el
 *  barrido automático y por la impresión por selección de la consola. */
export async function imprimirYMarcar(job, { jobIdPrefix = 'queue' } = {}) {
  const etiqueta = etiquetaDelJob(job)
  try {
    const r = await procesarJob(job, { jobIdPrefix })
    const marca = await rpc('print_mark_job', { p_id: job.id, p_ok: true })
    const serial = marca?.serial || null
    const modo = r.blanca ? 'BLANCA (entregar sin imprimir)' : r.dryRun ? 'generada (DRY_RUN)' : 'impresa'
    console.log(`Cola: tarjeta ${job.tipo} "${etiqueta}" ${modo}${serial ? ` · S/N ${serial}` : ''}`)
    return { id: job.id, tarjeta: etiqueta, tipo: job.tipo, ok: true, blanca: !!r.blanca, dryRun: !!r.dryRun, serial }
  } catch (err) {
    // El fallo de UNA tarjeta no tumba el ciclo: se marca error y sigue.
    console.error(`Cola: error en "${etiqueta}": ${err.message}`)
    await rpc('print_mark_job', { p_id: job.id, p_ok: false, p_error: err.message })
      .catch((e) => console.error(`Cola: no se pudo marcar el error: ${e.message}`))
    return { id: job.id, tarjeta: etiqueta, tipo: job.tipo, ok: false, error: err.message }
  }
}

/** Modo manual (consola): toma SOLO los jobs seleccionados y los imprime. */
export async function imprimirSeleccion(ids) {
  const jobs = await rpc('print_take_selected', { p_ids: ids })
  const results = []
  for (const job of jobs) results.push(await imprimirYMarcar(job, { jobIdPrefix: 'sel' }))
  return { tomadas: jobs.length, results }
}

let enCurso = false
async function tick() {
  if (enCurso) return // no encimar ciclos si la impresión tarda más que el intervalo
  enCurso = true
  try {
    const jobs = await rpc('print_take_jobs', { p_limit: 3 })
    for (const job of jobs) await imprimirYMarcar(job)
  } catch (err) {
    console.error(`Cola: ${err.message}`) // red caída, etc. — reintenta al siguiente tick
  } finally {
    enCurso = false
  }
}

// --- Modo automático: prendible/apagable en runtime desde la consola ---
let timer = null
export const queueAutoOn = () => !!timer

export function setQueueAuto(on) {
  if (on && !timer) {
    timer = setInterval(tick, config.queueIntervalMs)
    tick() // primer barrido inmediato
    console.log(`Cola: modo automático ACTIVADO (barrido cada ${config.queueIntervalMs / 1000}s)`)
  } else if (!on && timer) {
    clearInterval(timer)
    timer = null
    console.log('Cola: modo automático apagado (consumo manual desde la consola)')
  }
  return queueAutoOn()
}

export function startQueueWorker() {
  if (!config.queuePoll) return false
  return setQueueAuto(true)
}
