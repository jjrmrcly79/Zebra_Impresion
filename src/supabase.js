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
 * @param {string} coloniaId
 * @returns {Promise<Array<{id,nombre,casa,calle,rol,telefono}>>}
 */
export async function listResidentes(coloniaId) {
  const select = 'id,nombre,role,telefono,houses(numero,street)'
  const filtros = `colonia_id=eq.${coloniaId}&is_active=eq.true&approval_status=eq.aprobado&role=in.(residente,comite)`
  const rows = await get(`profiles?select=${select}&${filtros}&order=nombre`)
  return rows.map((p) => ({
    id: p.id,
    nombre: p.nombre || '',
    casa: p.houses?.numero || '',
    calle: p.houses?.street || '',
    rol: ROL_LEGIBLE[p.role] || p.role || '',
    telefono: p.telefono || '',
  }))
}
