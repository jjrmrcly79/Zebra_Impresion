# AGENTS.md — nexia-print-bridge

## Qué es
Puente local de impresión de tarjetas PVC en **Zebra ZC300** para el ecosistema Nexia.
Corre en la Mac con la impresora (USB) y expone HTTP en `127.0.0.1`. Las apps del VPS
(Vecinity, nexia-tienda, etc.) le mandan JSON o un PNG y la tarjeta se imprime vía CUPS (`lp`).

## Estado del proyecto
- **v0.1 funcional (2026-06-25)** — probado en DRY_RUN, falta primera impresión física real.
- ✅ Endpoints `/health`, `/preview`, `/print` (token).
- ✅ Dos modos: plantilla (render con `@napi-rs/canvas`) y directo (sube PNG).
- ✅ Dos caras (YMCKOK): frente + reverso = PDF de 2 páginas a CR80 (241.5×153.6 pt).
- ✅ **Reverso con QR** (plantilla `qr`): codifica una URL (default `DEFAULT_QR_URL`), B/N para panel K.
- ✅ Mini web local en `/` (subir PNG o usar plantilla, previsualizar frente/reverso e imprimir).
- ✅ `/preview?side=back` para previsualizar el reverso.
- ✅ **Impresión por LOTE desde Supabase (schema `vecino`)**: frente = 1 imagen compartida +
  reverso por vehículo (plantilla `vehiculo`: placa + casa + marca/modelo + color). Pestaña "Lote".
  Endpoints `/colonias`, `/vehicles?colonia=ID`, `/print-batch`. Villa Catania = 116 casas / 285 vehículos.
  Modelo elegido: **una tarjeta por vehículo**. Campo "primeras N" + confirm para probar antes del lote completo.
- ⬜ **Pendiente: imprimir una tarjeta física real** (poner `DRY_RUN=false` y probar con Juan).
- ⬜ Integrar el primer consumidor (Vecinity: botón "imprimir credencial" en ficha de residente).
- ⬜ Validar orientación frente/reverso real del ribbon y márgenes de sangrado.

## Stack activo
- Node 24 + Express 4 + Multer + `@napi-rs/canvas` (render sin deps de sistema) + pdfkit.
- Salida a CUPS con `lp -d Zebra_Technologies_ZTC_ZC300 -o PageSize=CR80 -o RibbonName=1YMCKOK`.
- Sin Supabase, sin frontend framework. Excepción de stack justificada (hardware local).

## Datos del hardware (esta Mac — MacBook Pro de Juan)
- Cola CUPS: `Zebra_Technologies_ZTC_ZC300` (USB directo, default del sistema).
- PPD: `/private/etc/cups/ppd/Zebra_Technologies_ZTC_ZC300.ppd`.
- PageSize: CR80 (default), CR81, CR82 · 300 DPI · RGB.
- Ribbon: YMCKO / **YMCKOK** (frente color + reverso negro) / otros.

## Comandos rápidos
```bash
npm install
cp .env.example .env          # ajustar PRINT_TOKEN; DRY_RUN=true para pruebas
npm start                     # http://localhost:7777
curl http://localhost:7777/health
```

## Contrato JSON (para apps consumidoras)
`POST /print` (header `x-print-token`):
- Plantilla: `{ "template":"credencial", "data":{...}, "copies":1 }`
- Directo:   multipart `png=@archivo.png` (+ `backPng` opcional)
- Reverso plantilla: `backTemplate` + `backData`
`POST /preview` = igual pero devuelve el PNG del frente sin imprimir.

## Notas / deuda
- Multer 1.x marca deprecación (vuln conocida); localhost-only mitiga. Evaluar subir a 2.x.
- La plantilla `credencial` es genérica; crear variantes por app en `templates/`.
- Modelo de conexión actual: **localhost-bridge** (el operador imprime desde la Mac de la
  impresora). Si se necesita imprimir remoto → migrar a cola en Supabase Realtime (ya previsto).
- El bridge consulta Supabase con SERVICE_ROLE_KEY **server-side** (src/supabase.js) — nunca
  llega al navegador. Header `Accept-Profile: vecino` obligatorio. Es pragmático para tener el
  lote ya; a futuro esta lectura puede vivir en Vecinity y el bridge solo recibir los renglones.
