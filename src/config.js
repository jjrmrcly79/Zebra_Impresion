import 'dotenv/config'

// Tarjeta CR80 estándar a 300 DPI (lo que expone el PPD de la ZC300).
// 85.6 x 54 mm en horizontal => 1011 x 638 px.
export const CARD = {
  dpi: 300,
  widthPx: 1011,
  heightPx: 638,
}

export const config = {
  port: Number(process.env.PORT) || 7777,
  printerName: process.env.PRINTER_NAME || 'Zebra_Technologies_ZTC_ZC300',
  pageSize: process.env.PAGE_SIZE || 'CR80',
  ribbon: process.env.RIBBON || '1YMCKOK',
  printToken: process.env.PRINT_TOKEN || '', // sin default: si falta, nada imprime

  dryRun: String(process.env.DRY_RUN).toLowerCase() === 'true',
  // URL que codifica el QR del reverso si la app no manda una propia.
  defaultQrUrl: process.env.DEFAULT_QR_URL || 'https://vecinovigilante.nexiasoluciones.com.mx',
  // Supabase (impresión por lote desde schema vecino). Server-side, nunca al navegador.
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  // Modo COLA: consumir vecino.print_jobs (creados por Vecinity al aprobar tarjetas).
  queuePoll: String(process.env.QUEUE_POLL).toLowerCase() === 'true',
  queueIntervalMs: Number(process.env.QUEUE_INTERVAL_MS) || 10000,
  // Imagen local del frente cuando la colonia no tiene tarjeta_frente_url.
  frontImagePath: process.env.FRONT_IMAGE || '',
}
