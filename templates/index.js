import { credencial } from './credencial.js'
import { qr } from './qr.js'
import { vehiculo } from './vehiculo.js'

// Registro de plantillas disponibles. Agregar nuevas aquí.
// Cada plantilla es async ({ ctx, canvas, data, card, loadAnyImage }) => void
export const templates = {
  credencial,
  residente: credencial, // alias semántico para Vecinity
  cliente: credencial,   // alias para nexia-tienda (tarjeta de lealtad)
  qr,                    // reverso con código QR (B/N)
  vehiculo,              // reverso por vehículo: placa + casa + modelo (B/N)
}
