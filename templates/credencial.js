/**
 * Plantilla "credencial" — gafete con foto para residentes / clientes / empleados.
 * Genérica: los textos vienen en `data`. Pensada para el FRENTE (color).
 *
 * data = {
 *   titulo:      'NEXIA CONDOMINIOS',     // barra superior
 *   nombre:      'Juan Garcés',
 *   subtitulo:   'Residente · Torre A-301',
 *   lineas:      ['Vigencia: 2027', 'ID: RES-00123'], // extra
 *   foto:        dataURL | URL | base64,
 *   logo:        dataURL | URL | base64,  // opcional, esquina sup. der.
 *   colorMarca:  '#1f6feb',
 * }
 */
export async function credencial({ ctx, data, card, loadAnyImage }) {
  const W = card.widthPx
  const H = card.heightPx
  const marca = data.colorMarca || '#1f6feb'

  // Barra superior de marca
  const barH = Math.round(H * 0.18)
  ctx.fillStyle = marca
  ctx.fillRect(0, 0, W, barH)

  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(barH * 0.42)}px Arial`
  ctx.textBaseline = 'middle'
  ctx.fillText(data.titulo || 'NEXIA', 28, barH / 2)

  // Logo opcional (derecha de la barra)
  if (data.logo) {
    try {
      const logo = await loadAnyImage(data.logo)
      if (logo) {
        const lh = Math.round(barH * 0.72)
        const lw = (logo.width / logo.height) * lh
        ctx.drawImage(logo, W - lw - 24, (barH - lh) / 2, lw, lh)
      }
    } catch { /* logo opcional: ignorar si falla */ }
  }

  // Foto (cuadro izquierdo)
  const pad = 36
  const photoY = barH + pad
  const photoSize = Math.round(H * 0.5)
  if (data.foto) {
    try {
      const foto = await loadAnyImage(data.foto)
      if (foto) {
        // cover dentro del cuadro
        const scale = Math.max(photoSize / foto.width, photoSize / foto.height)
        const fw = foto.width * scale
        const fh = foto.height * scale
        ctx.save()
        ctx.beginPath()
        ctx.rect(pad, photoY, photoSize, photoSize)
        ctx.clip()
        ctx.drawImage(foto, pad - (fw - photoSize) / 2, photoY - (fh - photoSize) / 2, fw, fh)
        ctx.restore()
      }
    } catch { /* foto opcional */ }
    ctx.strokeStyle = '#d0d7de'
    ctx.lineWidth = 2
    ctx.strokeRect(pad, photoY, photoSize, photoSize)
  }

  // Textos (a la derecha de la foto)
  const tx = data.foto ? pad + photoSize + 28 : pad
  let ty = photoY + 8
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#1a1a1a'

  ctx.font = `bold ${Math.round(H * 0.085)}px Arial`
  ty = wrapText(ctx, data.nombre || '', tx, ty, W - tx - pad, Math.round(H * 0.095))

  if (data.subtitulo) {
    ty += 6
    ctx.fillStyle = marca
    ctx.font = `${Math.round(H * 0.052)}px Arial`
    ty = wrapText(ctx, data.subtitulo, tx, ty, W - tx - pad, Math.round(H * 0.062))
  }

  if (Array.isArray(data.lineas)) {
    ty += 10
    ctx.fillStyle = '#555'
    ctx.font = `${Math.round(H * 0.045)}px Arial`
    for (const linea of data.lineas) {
      ctx.fillText(String(linea), tx, ty)
      ty += Math.round(H * 0.058)
    }
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/)
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = word
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, x, y)
    y += lineHeight
  }
  return y
}
