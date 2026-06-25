/**
 * Plantilla "vehiculo" — REVERSO (B/N, panel K). Una tarjeta por vehículo.
 * Placa grande + casa + marca/modelo + color.
 *
 * data = {
 *   placa:       'DNV-026-H',
 *   casa:        '100',
 *   marca:       'Volkswagen',
 *   modelo:      'Jetta',
 *   color:       'Blanco',
 *   propietario: 'Tony Beltran',   // opcional, va chico abajo
 * }
 */
export async function vehiculo({ ctx, card, data = {} }) {
  const W = card.widthPx
  const H = card.heightPx
  const pad = Math.round(W * 0.06)
  ctx.fillStyle = '#000000'

  // Rótulo "PLACA" arriba-izquierda
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `${Math.round(H * 0.06)}px Arial`
  ctx.fillStyle = '#444444'
  ctx.fillText('PLACA', pad, Math.round(H * 0.12))

  // "Casa N" arriba-derecha
  if (data.casa) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.font = `bold ${Math.round(H * 0.075)}px Arial`
    ctx.fillText(`Casa ${data.casa}`, W - pad, Math.round(H * 0.11))
  }

  // Placa grande (ajusta el tamaño si es muy larga para que quepa)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'
  const placa = String(data.placa || '—').toUpperCase()
  let fontPx = Math.round(H * 0.2)
  const maxW = W - pad * 2
  ctx.font = `bold ${fontPx}px Arial`
  while (ctx.measureText(placa).width > maxW && fontPx > 30) {
    fontPx -= 4
    ctx.font = `bold ${fontPx}px Arial`
  }
  ctx.fillText(placa, pad, Math.round(H * 0.46))

  // Marca + modelo · color
  const linea = [[data.marca, data.modelo].filter(Boolean).join(' '), data.color]
    .filter(Boolean).join(' · ')
  if (linea) {
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#000000'
    ctx.font = `${Math.round(H * 0.065)}px Arial`
    ctx.fillText(linea, pad, Math.round(H * 0.66))
  }

  // Propietario chico abajo
  if (data.propietario) {
    ctx.fillStyle = '#666666'
    ctx.font = `${Math.round(H * 0.045)}px Arial`
    ctx.fillText(String(data.propietario), pad, Math.round(H * 0.82))
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
