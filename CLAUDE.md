# CLAUDE.md — nexia-print-bridge

Proyecto del ecosistema Nexia. Lee primero `~/dev/nexia-tools/NEXIA-OS.md` y luego este archivo.

## Naturaleza
Servicio **local** (no VPS) que imprime tarjetas PVC en la Zebra ZC300 vía CUPS.
Es una **excepción de stack** justificada (como nexia-facturacion): corre en una Mac física
con la impresora por USB. Sin Supabase, sin React. Node + `lp`.

## Reglas específicas
- Escuchar **solo en `127.0.0.1`** — nunca exponer a la red.
- `/print` siempre exige `x-print-token`.
- Nunca hardcodear el token ni el nombre de impresora: van en `.env` (no se commitea).
- Tamaño de tarjeta y ribbon salen del PPD real (CR80 · 300 DPI · YMCKOK). No inventar medidas.
- Para probar sin gastar tarjetas/ribbon: `DRY_RUN=true` (genera PDF en `tmp/`, no imprime).
- Imágenes a 300 DPI: CR80 = **1011×638 px**. CR80 en puntos PDF = **241.5×153.6**.

## Cómo otra app lo usa
La app (Vecinity, nexia-tienda) arma el JSON con datos + foto y hace
`POST http://localhost:7777/print`. El navegador del operador corre en la **misma Mac** que la
impresora (modelo localhost-bridge). Si más adelante se requiere impresión remota, migrar a
una cola en Supabase Realtime (el bridge la escucha) — el contrato JSON ya está pensado para eso.

## Archivos clave
- `server.js` — endpoints HTTP.
- `src/render.js` — render plantilla y normalización de PNG directo (`@napi-rs/canvas`).
- `src/print.js` — arma PDF (1–2 páginas) y manda a CUPS (`lp`).
- `templates/` — plantillas de tarjeta (registro en `templates/index.js`).
- `public/index.html` — web local para subir PNG / usar plantilla.
