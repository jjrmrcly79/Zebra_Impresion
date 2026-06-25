import QRCode from 'qrcode'
import { loadImage } from '@napi-rs/canvas'
import { config } from '../src/config.js'

/**
 * Plantilla "qr" — pensada para el REVERSO (B/N, panel K del ribbon).
 * Dibuja un QR con título, leyenda y, opcionalmente, un TEXTO destacado
 * (ej. el número de casa). Negro sobre blanco.
 *
 * data = {
 *   url:      'https://vecinovigilante.nexiasoluciones.com.mx',  // qué codifica el QR
 *   titulo:   'NEXIA CONDOMINIOS',     // texto arriba (opcional)
 *   leyenda:  'Escanea para acceder',  // texto bajo el QR (opcional)
 *   numero:   '42',                    // texto destacado, ej. número de casa (opcional)
 *   etiqueta: 'CASA',                  // rótulo arriba del número (default 'CASA')
 * }
 * Si no se pasa `url`, usa DEFAULT_QR_URL del .env.
 * Si hay `numero` -> layout de 2 columnas (número a la izq, QR a la der).
 * Si no -> QR centrado.
 */
export async function qr({ ctx, card, data = {} }) {
  const W = card.widthPx
  const H = card.heightPx
  const url = data.url || config.defaultQrUrl
  const tieneNumero = data.numero !== undefined && String(data.numero).trim() !== ''

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  // Título arriba (opcional)
  if (data.titulo) {
    ctx.font = `bold ${Math.round(H * 0.058)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText(data.titulo, W / 2, Math.round(H * 0.06))
  }
  const topOffset = data.titulo ? Math.round(H * 0.1) : 0

  // Generar el QR como imagen
  const qrSize = Math.round(H * (tieneNumero ? 0.58 : 0.62))
  const qrPng = await QRCode.toBuffer(url, {
    type: 'png', width: qrSize, margin: 1,
    errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
  })
  const qrImg = await loadImage(qrPng)

  if (tieneNumero) {
    // --- Layout 2 columnas: número (izq) + QR (der) ---
    const qx = W - qrSize - Math.round(W * 0.05)
    const qy = (H - qrSize) / 2 + topOffset / 2
    ctx.drawImage(qrImg, qx, qy, qrSize, qrSize)

    // Bloque del número a la izquierda, centrado en su columna
    const colCx = qx / 2
    const cy = H / 2 + topOffset / 2
    ctx.textAlign = 'center'

    ctx.fillStyle = '#000000'
    ctx.font = `${Math.round(H * 0.07)}px Arial`
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(data.etiqueta || 'CASA'), colCx, cy - Math.round(H * 0.02))

    ctx.font = `bold ${Math.round(H * 0.26)}px Arial`
    ctx.textBaseline = 'top'
    ctx.fillText(String(data.numero), colCx, cy - Math.round(H * 0.01))

    // Leyenda / URL debajo del QR
    ctx.fillStyle = '#444444'
    ctx.font = `${Math.round(H * 0.032)}px Arial`
    ctx.textBaseline = 'top'
    ctx.fillText(url.replace(/^https?:\/\//, ''), qx + qrSize / 2, qy + qrSize + 8)
  } else {
    // --- Layout centrado (sin número) ---
    const qx = (W - qrSize) / 2
    const qy = (H - qrSize) / 2 + topOffset / 2
    ctx.drawImage(qrImg, qx, qy, qrSize, qrSize)

    ctx.textAlign = 'center'
    let ty = qy + qrSize + 12
    if (data.leyenda) {
      ctx.fillStyle = '#000000'
      ctx.font = `${Math.round(H * 0.045)}px Arial`
      ctx.fillText(data.leyenda, W / 2, ty)
      ty += Math.round(H * 0.055)
    }
    ctx.fillStyle = '#444444'
    ctx.font = `${Math.round(H * 0.035)}px Arial`
    ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, ty)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
