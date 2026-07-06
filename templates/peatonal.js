import QRCode from 'qrcode'
import { loadImage } from '@napi-rs/canvas'
import { config } from '../src/config.js'

/**
 * Plantilla "peatonal" — REVERSO (B/N, panel K). Una tarjeta por residente
 * para control de acceso peatonal.
 *
 * data = {
 *   nombre:   'Juan Garcés',
 *   casa:     '188',
 *   calle:    'Av. Catania',        // opcional
 *   rol:      'Residente',          // opcional: Residente / Comité
 *   telefono: '4611807955',         // opcional, chico abajo
 *   placas:   ['ABC-123', 'XYZ-9'], // opcional: vehículos de la casa
 *   qrUrl:    'https://.../r/<id>', // opcional: QR único del residente
 * }
 * Si no se pasa `qrUrl`, el QR codifica DEFAULT_QR_URL del .env.
 */
export async function peatonal({ ctx, card, data = {} }) {
  const W = card.widthPx
  const H = card.heightPx
  const pad = Math.round(W * 0.06)

  // QR abajo-derecha (único por residente). Las líneas de texto que conviven
  // verticalmente con él se limitan a la columna izquierda.
  const qrSize = Math.round(H * 0.4)
  const qx = W - pad - qrSize
  const qy = H - Math.round(H * 0.08) - qrSize
  const colW = qx - pad - Math.round(W * 0.03)

  const qrPng = await QRCode.toBuffer(data.qrUrl || config.defaultQrUrl, {
    type: 'png', width: qrSize, margin: 1,
    errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
  })
  ctx.drawImage(await loadImage(qrPng), qx, qy, qrSize, qrSize)

  // Rótulo arriba-izquierda ('ACCESO PEATONAL' o 'VISITA FRECUENTE')
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `${Math.round(H * 0.06)}px Arial`
  ctx.fillStyle = '#444444'
  ctx.fillText(String(data.rotulo || 'ACCESO PEATONAL'), pad, Math.round(H * 0.1))

  // "Casa N" arriba-derecha
  if (data.casa) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#000000'
    ctx.font = `bold ${Math.round(H * 0.075)}px Arial`
    ctx.fillText(`Casa ${data.casa}`, W - pad, Math.round(H * 0.09))
  }

  // Nombre grande (ajusta el tamaño si es muy largo para que quepa)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'
  const nombre = String(data.nombre || '—')
  const ajustar = (texto, basePx, maxW, minPx = 26) => {
    let px = basePx
    ctx.font = `bold ${px}px Arial`
    while (ctx.measureText(texto).width > maxW && px > minPx) {
      px -= 3
      ctx.font = `bold ${px}px Arial`
    }
    return px
  }
  ajustar(nombre, Math.round(H * 0.13), W - pad * 2)
  ctx.fillText(nombre, pad, Math.round(H * 0.36))

  // Columna izquierda (junto al QR): rol · calle, placas, teléfono
  ctx.textBaseline = 'top'
  let ty = Math.round(H * 0.5)

  const linea = [data.rol, data.calle].filter(Boolean).join(' · ')
  if (linea) {
    ctx.fillStyle = '#000000'
    ctx.font = `${Math.round(H * 0.06)}px Arial`
    ctx.fillText(linea, pad, ty, colW)
    ty += Math.round(H * 0.1)
  }

  const placas = Array.isArray(data.placas) ? data.placas.filter(Boolean) : []
  if (placas.length) {
    ctx.fillStyle = '#444444'
    ctx.font = `${Math.round(H * 0.045)}px Arial`
    ctx.fillText(placas.length === 1 ? 'PLACA' : 'PLACAS', pad, ty)
    ty += Math.round(H * 0.06)
    ctx.fillStyle = '#000000'
    // Hasta 2 renglones de placas; se encoge si no caben
    const texto = placas.join(' · ')
    let px = Math.round(H * 0.055)
    ctx.font = `bold ${px}px Arial`
    while (ctx.measureText(texto).width > colW && px > 22) {
      px -= 2
      ctx.font = `bold ${px}px Arial`
    }
    if (ctx.measureText(texto).width > colW) {
      const mitad = Math.ceil(placas.length / 2)
      ctx.fillText(placas.slice(0, mitad).join(' · '), pad, ty, colW)
      ty += px + 6
      ctx.fillText(placas.slice(mitad).join(' · '), pad, ty, colW)
      ty += px + 8
    } else {
      ctx.fillText(texto, pad, ty)
      ty += px + 10
    }
  }

  if (data.telefono) {
    ctx.fillStyle = '#666666'
    ctx.font = `${Math.round(H * 0.045)}px Arial`
    ctx.fillText(String(data.telefono), pad, Math.round(H * 0.86), colW)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
