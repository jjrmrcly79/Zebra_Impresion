/**
 * Plantilla "peatonal" — REVERSO (B/N, panel K). Una tarjeta por residente
 * para control de acceso peatonal.
 *
 * data = {
 *   nombre:   'Juan Garcés',
 *   casa:     '188',
 *   calle:    'Av. Catania',   // opcional, va bajo el nombre
 *   rol:      'Residente',     // opcional: Residente / Comité
 *   telefono: '4611807955',    // opcional, chico abajo
 * }
 */
export async function peatonal({ ctx, card, data = {} }) {
  const W = card.widthPx
  const H = card.heightPx
  const pad = Math.round(W * 0.06)

  // Rótulo "ACCESO PEATONAL" arriba-izquierda
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `${Math.round(H * 0.06)}px Arial`
  ctx.fillStyle = '#444444'
  ctx.fillText('ACCESO PEATONAL', pad, Math.round(H * 0.12))

  // "Casa N" arriba-derecha
  if (data.casa) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.font = `bold ${Math.round(H * 0.075)}px Arial`
    ctx.fillText(`Casa ${data.casa}`, W - pad, Math.round(H * 0.11))
  }

  // Nombre grande (ajusta el tamaño si es muy largo para que quepa)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'
  const nombre = String(data.nombre || '—')
  let fontPx = Math.round(H * 0.14)
  const maxW = W - pad * 2
  ctx.font = `bold ${fontPx}px Arial`
  while (ctx.measureText(nombre).width > maxW && fontPx > 30) {
    fontPx -= 4
    ctx.font = `bold ${fontPx}px Arial`
  }
  ctx.fillText(nombre, pad, Math.round(H * 0.46))

  // Rol · calle
  const linea = [data.rol, data.calle].filter(Boolean).join(' · ')
  if (linea) {
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#000000'
    ctx.font = `${Math.round(H * 0.065)}px Arial`
    ctx.fillText(linea, pad, Math.round(H * 0.62))
  }

  // Teléfono chico abajo
  if (data.telefono) {
    ctx.fillStyle = '#666666'
    ctx.font = `${Math.round(H * 0.045)}px Arial`
    ctx.fillText(String(data.telefono), pad, Math.round(H * 0.82))
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
