import { createCanvas, loadImage } from '@napi-rs/canvas'
import { CARD } from './config.js'
import { templates } from '../templates/index.js'

/**
 * Carga una imagen desde: data URL (base64), URL http(s), o Buffer.
 * @param {string|Buffer} src
 */
export async function loadAnyImage(src) {
  if (!src) return null
  if (Buffer.isBuffer(src)) return loadImage(src)
  if (typeof src === 'string') {
    if (src.startsWith('data:')) {
      const b64 = src.split(',')[1] || ''
      return loadImage(Buffer.from(b64, 'base64'))
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`No se pudo descargar la imagen: ${res.status}`)
      return loadImage(Buffer.from(await res.arrayBuffer()))
    }
    // base64 crudo
    return loadImage(Buffer.from(src, 'base64'))
  }
  return null
}

/**
 * MODO PLANTILLA: renderiza una tarjeta diseñada a partir de datos.
 * @param {string} templateName
 * @param {Object} data
 * @returns {Promise<Buffer>} PNG
 */
export async function renderTemplate(templateName, data = {}) {
  const tpl = templates[templateName]
  if (!tpl) {
    throw new Error(`Plantilla desconocida: "${templateName}". Disponibles: ${Object.keys(templates).join(', ')}`)
  }
  const canvas = createCanvas(CARD.widthPx, CARD.heightPx)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD.widthPx, CARD.heightPx)
  await tpl({ ctx, canvas, data, card: CARD, loadAnyImage })
  return canvas.toBuffer('image/png')
}

/**
 * MODO DIRECTO (sencillo): toma un PNG ya hecho y lo ajusta al tamaño de
 * tarjeta sin deformarlo (contain, centrado sobre fondo blanco).
 * @param {string|Buffer} src
 * @returns {Promise<Buffer>} PNG a 1011x638
 */
export async function renderRaw(src) {
  const img = await loadAnyImage(src)
  if (!img) throw new Error('Imagen inválida o vacía')

  const canvas = createCanvas(CARD.widthPx, CARD.heightPx)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CARD.widthPx, CARD.heightPx)

  // Si ya viene al tamaño exacto, la dibujamos tal cual.
  if (img.width === CARD.widthPx && img.height === CARD.heightPx) {
    ctx.drawImage(img, 0, 0)
    return canvas.toBuffer('image/png')
  }

  // contain centrado
  const scale = Math.min(CARD.widthPx / img.width, CARD.heightPx / img.height)
  const w = img.width * scale
  const h = img.height * scale
  const x = (CARD.widthPx - w) / 2
  const y = (CARD.heightPx - h) / 2
  ctx.drawImage(img, x, y, w, h)
  return canvas.toBuffer('image/png')
}
