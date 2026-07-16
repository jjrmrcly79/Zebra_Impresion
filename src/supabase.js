import { config } from './config.js'

// Acceso server-side a Supabase self-hosted (schema vecino) vía PostgREST.
// La SERVICE_ROLE_KEY vive solo aquí (proceso local) — nunca se manda al navegador.

function headers() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  }
  return {
    apikey: config.supabaseServiceKey,
    Authorization: `Bearer ${config.supabaseServiceKey}`,
    'Accept-Profile': 'vecino', // OBLIGATORIO para leer del schema vecino
  }
}

async function get(pathQuery) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${pathQuery}`, { headers: headers() })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.json()
}

/** Lista las colonias (id + nombre + conteo de casas). */
export async function listColonias() {
  return get('colonias?select=id,nombre&order=nombre')
}

// --- Consola de operador: cola vecino.print_jobs de TODAS las villas ---

const JOB_COLS = 'id,colonia_id,card_request_id,tipo,payload,estado,attempts,error,created_at,taken_at,printed_at'

/** Cola activa + historial reciente + colonias con su stock físico. */
export async function listQueueData() {
  const [activos, historial, colonias] = await Promise.all([
    get(`print_jobs?select=${JOB_COLS}&estado=in.(pendiente,imprimiendo,error)&order=created_at`),
    get(`print_jobs?select=${JOB_COLS}&estado=eq.impresa&order=printed_at.desc&limit=300`),
    get('colonias?select=id,nombre,stock_tarjetas&order=nombre'),
  ])
  return { activos, historial, colonias }
}

/** Un job por id (para reimprimir / previsualizar). */
export async function getPrintJob(id) {
  const [job] = await get(`print_jobs?select=${JOB_COLS}&id=eq.${encodeURIComponent(id)}`)
  return job || null
}

/**
 * Lista los vehículos de una colonia, ya aplanados para imprimir.
 * @param {string} coloniaId
 * @returns {Promise<Array<{id,placa,color,marca,modelo,casa,propietario}>>}
 */
export async function listVehicles(coloniaId) {
  const select = 'id,placa,color,houses(numero,propietario),vehicle_brands(nombre),vehicle_models(nombre)'
  const rows = await get(`vehicles?select=${select}&colonia_id=eq.${coloniaId}&estado=eq.aprobado&order=placa`)
  return rows.map((v) => ({
    id: v.id,
    placa: v.placa || '',
    color: v.color || '',
    marca: v.vehicle_brands?.nombre || '',
    modelo: v.vehicle_models?.nombre || '',
    casa: v.houses?.numero || '',
    propietario: v.houses?.propietario || '',
  }))
}

const ROL_LEGIBLE = { residente: 'Residente', comite: 'Comité', guardia: 'Guardia' }

/**
 * Lista los residentes de una colonia para credenciales PEATONALES
 * (perfiles activos y aprobados, ya aplanados para imprimir).
 * Incluye las placas de los vehículos aprobados de su casa y la URL
 * que codifica el QR de la tarjeta (única por residente).
 * @param {string} coloniaId
 * @returns {Promise<Array<{id,nombre,casa,calle,rol,telefono,placas,qrUrl}>>}
 */
export async function listResidentes(coloniaId) {
  const select = 'id,nombre,role,telefono,house_id,houses(numero,street)'
  const filtros = `colonia_id=eq.${coloniaId}&is_active=eq.true&approval_status=eq.aprobado&role=in.(residente,comite)`
  const [rows, vehiculos] = await Promise.all([
    get(`profiles?select=${select}&${filtros}&order=nombre`),
    get(`vehicles?select=house_id,placa&colonia_id=eq.${coloniaId}&estado=eq.aprobado&order=placa`),
  ])
  const placasPorCasa = {}
  for (const v of vehiculos) {
    if (!v.house_id || !v.placa) continue
    ;(placasPorCasa[v.house_id] ||= []).push(v.placa)
  }
  return rows.map((p) => ({
    id: p.id,
    nombre: p.nombre || '',
    casa: p.houses?.numero || '',
    calle: p.houses?.street || '',
    rol: ROL_LEGIBLE[p.role] || p.role || '',
    telefono: p.telefono || '',
    placas: placasPorCasa[p.house_id] || [],
    // Única por residente. El escáner de caseta (Vecinity) debe aprender a
    // resolver /r/<profile_id> — hoy solo entiende /visita/<token> (Ola 3).
    qrUrl: `${config.defaultQrUrl}/r/${p.id}`,
  }))
}
