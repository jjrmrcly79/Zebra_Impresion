# AGENTS.md — nexia-print-bridge

## Qué es
Puente local de impresión de tarjetas PVC en **Zebra ZC300** para el ecosistema Nexia.
Corre en la Mac con la impresora (USB) y expone HTTP en `127.0.0.1`. Las apps del VPS
(Vecinity, nexia-tienda, etc.) le mandan JSON o un PNG y la tarjeta se imprime vía CUPS (`lp`).

## Estado del proyecto
- **v0.4 (2026-07-15) — CONSOLA DE OPERADOR NEXIA (`/cola.html`)**: las villas mandan sus
  tarjetas (comité aprueba en Vecinity → `vecino.print_jobs`) y el operador Nexia las trabaja
  desde `http://localhost:7777/cola.html` sin IA: cola agrupada por villa con selección
  (checkbox por tarjeta o villa completa), badge **BLANCA** (vehicular `personalizada=false`
  = se marca lista SIN imprimir, entregar del stock), reintento de errores en la misma
  selección, preview frente/reverso, historial con **reimprimir** (descuenta stock vía RPC),
  stock físico editable por villa, y toggle de **modo automático** en runtime (default:
  manual — el operador decide qué y cuándo). Endpoints nuevos token-gated: `GET /queue`,
  `POST /queue/print|reprint|auto|stock`, `GET /queue/preview/:id`.
  Migración Vecinity **071_print_operador.sql** (aplicada en prod): RPCs solo service_role
  `print_take_selected(uuid[])` (acepta pendiente Y error), `print_reprint(uuid)`,
  `print_set_stock(uuid,int)`.
  **LaunchAgent instalado**: `com.nexia.print-bridge` (autoarranque + relanzado en crash,
  logs en `logs/bridge.log`; reinstalar con `scripts/install-launchagent.sh`).
  QA E2E DRY_RUN verificado con jobs sintéticos (impresión selectiva, blanca, retry,
  reimpresión, stock) y limpiado. **E2E FÍSICO verificado** (2026-07-15): tarjeta real
  impresa vía consola → CUPS → Zebra en ~20s, estado y stock correctos en BD.
  ⚠️ **Pendiente**: NINGUNA colonia tiene `tarjeta_frente_url` — hoy imprime con el
  `FRONT_IMAGE` temporal del `.env` (frente-demo). Subir el diseño real de cada villa
  antes del primer lote de producción.
- **v0.3 (2026-07-06)** — MODO COLA: el bridge es ahora el agente de impresión del módulo
  **Credenciales de Vecinity**. Con `QUEUE_POLL=true` barre `vecino.print_jobs` cada 10s
  (RPCs `print_take_jobs`/`print_mark_job`, solo service_role), imprime y marca estados;
  el frente sale de `colonias.tarjeta_frente_url` o `FRONT_IMAGE` local; los QR se arman
  aquí (peatonal `DEFAULT_QR_URL/r/<profileId>` · visita frecuente `/vf/<cardId>`).
  Tipos de la cola: `vehicular`, `peatonal` y `visita` (visita frecuente = misma plantilla
  peatonal con `rotulo` del payload; siempre con costo). Mini-web queda como fallback/pruebas.
  E2E verificado (job → tarjeta DRY_RUN → estado impresa → stock descontado).
  ⏳ Activar poniendo `QUEUE_POLL=true` en `.env` (hoy está apagado).
- **v0.2 (2026-07-06)** — Ola 1 del upgrade: seguridad + tipos de credencial. En producción local (`DRY_RUN=false`).
- ✅ Endpoints `/health`, `/preview`, `/print` (token).
- ✅ Dos modos: plantilla (render con `@napi-rs/canvas`) y directo (sube PNG).
- ✅ Dos caras (YMCKOK): frente + reverso = PDF de 2 páginas a CR80 (241.5×153.6 pt).
- ✅ **Reverso con QR** (plantilla `qr`): codifica una URL (default `DEFAULT_QR_URL`), B/N para panel K.
- ✅ Mini web local en `/` (subir PNG o usar plantilla, previsualizar frente/reverso e imprimir).
- ✅ `/preview?side=back` para previsualizar el reverso.
- ✅ **Impresión por LOTE desde Supabase (schema `vecino`)** con **tipos de credencial**:
  - `vehicular` → una tarjeta por vehículo (plantilla `vehiculo`: placa + casa + marca/modelo + color).
  - `peatonal` → una tarjeta por residente (plantilla `peatonal`: nombre + casa + rol + teléfono +
    **placas de los vehículos aprobados de su casa** + **QR único** que codifica
    `DEFAULT_QR_URL/r/<profile_id>`), fuente `vecino.profiles` (activos + aprobados, roles
    residente/comite) vía `GET /residentes?colonia=ID`.
  - El lote vehicular y las placas del reverso peatonal solo incluyen vehículos `estado=aprobado`.
  - Pestaña "Lote" con selector de tipo. Villa Catania = 116 casas / 285 vehículos / 76 residentes.
  - Campo "primeras N" + confirm para probar antes del lote completo. `POST /print-batch` con campo `tipo`.
- ✅ **Seguridad (Ola 1, 2026-07-06)**: token rotado (ya no es el default publicado); `PRINT_TOKEN` sin
  fallback en código (si falta en `.env`, nada responde); token exigido TAMBIÉN en `/preview`, `/colonias`,
  `/vehicles` y `/residentes` (exponen datos de residentes); la web local ya no trae el token precargado
  (se captura una vez y se guarda en localStorage del navegador).
- ✅ **Higiene tmp/**: el PDF del job se borra tras mandarse a CUPS (lp ya copió el archivo); al arrancar
  se purgan PDFs `job-*.pdf` con más de 7 días (los DRY_RUN se conservan ese periodo para revisión).
- ✅ Multer 1.x → **2.2** (cierra deprecación/vulnerabilidad conocida). `npm audit`: 0 vulnerabilidades.
- ⬜ **Ola 2 (aprobada, pendiente)**: lote asíncrono con progreso + cancelar; marcar impresos en BD
  (`vecino`) para filtro "solo pendientes" y auditoría de credenciales emitidas.
- ⬜ **Ola 3 (parcial)**: ~~LaunchAgent de autoarranque~~ ✅ v0.4; falta: el escáner de caseta
  (vigilancia/page.tsx) debe aprender a resolver `/r/<profile_id>` — hoy solo entiende
  `/visita/<token>` (el QR de las tarjetas peatonales ya lo codifica, listo para esto).
- ⬜ **Foto del residente en la credencial** — GATEADO por dato: `vecino.profiles.avatar` guarda
  INICIALES ("JO"), no fotos. Requiere que Vecinity capture foto de perfil primero. La plantilla
  `credencial` (frente con foto) ya lo soporta cuando exista el dato.
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
- ~~Multer 1.x deprecado~~ → resuelto 2026-07-06 (Multer 2.2).
- La plantilla `credencial` es genérica; crear variantes por app en `templates/`.
- Dependencias con major nuevo disponibles (no urgente, evaluar en Ola 2/3):
  express 4→5, @napi-rs/canvas 0.1→1.0, pdfkit 0.15→0.19, dotenv 16→17.
- Modelo de conexión actual: **localhost-bridge** (el operador imprime desde la Mac de la
  impresora). Si se necesita imprimir remoto → migrar a cola en Supabase Realtime (ya previsto).
- El bridge consulta Supabase con SERVICE_ROLE_KEY **server-side** (src/supabase.js) — nunca
  llega al navegador. Header `Accept-Profile: vecino` obligatorio. Es pragmático para tener el
  lote ya; a futuro esta lectura puede vivir en Vecinity y el bridge solo recibir los renglones.
