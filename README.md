# nexia-print-bridge

Puente **local** de impresión de tarjetas PVC en la **Zebra ZC300** para el ecosistema Nexia.
Corre en la Mac que tiene la impresora conectada por USB y expone HTTP en `localhost`.
Cualquier app (Vecinity, nexia-tienda, etc.) le manda un JSON y la tarjeta sale impresa.

> Excepción de stack justificada: vive en una máquina física con la impresora, no en el VPS.
> Sin Supabase, sin framework de frontend. Node + CUPS (`lp`).

## Por qué así
La ZC300 está por **USB** en una Mac. Las apps están en el **VPS (nube)**, que no puede ver una
impresora USB. Este bridge corre **en la Mac de la impresora** y hace de intermediario.

## Requisitos
- macOS con el **driver Zebra ZC300 ya instalado** y la impresora en *Ajustes → Impresoras*.
  Verifica: `lpstat -p` debe listar `Zebra_Technologies_ZTC_ZC300`.
- Node 24+.

## Setup
```bash
cd ~/dev/nexia-print-bridge
cp .env.example .env        # ajusta PRINT_TOKEN y, si hace falta, PRINTER_NAME
npm install
npm start                   # http://localhost:7777
```
Para probar SIN gastar tarjetas: pon `DRY_RUN=true` en `.env` (genera el PDF en `tmp/`, no imprime).

## Dos modos de impresión

### 1) Directo (sencillo) — ya tienes el PNG
Subes un PNG listo y se imprime tal cual (ajustado a tamaño CR80 sin deformar).
Desde la web local o por API:
```bash
curl -X POST http://localhost:7777/print \
  -H "x-print-token: $PRINT_TOKEN" \
  -F "png=@credencial.png" \
  -F "copies=1"
```

### 2) Plantilla — el bridge diseña la tarjeta
Mandas datos y el bridge renderiza la credencial.
```bash
curl -X POST http://localhost:7777/print \
  -H "Content-Type: application/json" -H "x-print-token: $PRINT_TOKEN" \
  -d '{"template":"credencial","data":{"titulo":"NEXIA CONDOMINIOS","nombre":"Juan Garcés","subtitulo":"Residente · Torre A-301","colorMarca":"#1f6feb"},"copies":1}'
```

### Dos caras (YMCKOK: frente color, reverso B/N)
Agrega `backPng` (modo directo) o `backTemplate`+`backData` (plantilla). El reverso es la página 2 del trabajo.

### Reverso con QR / número de casa
Plantilla `qr` (codifica una URL editable por tarjeta + número de casa opcional). La URL default
sale de `DEFAULT_QR_URL` en `.env`.

## Impresión por lote (desde Supabase, schema `vecino`)
Para muchas tarjetas con el **mismo frente** y un reverso distinto por registro.
Hay **dos tipos de credencial**:

| Tipo | Una tarjeta por | Reverso (plantilla) | Fuente |
|------|----------------|---------------------|--------|
| `vehicular` | vehículo | `vehiculo`: placa + casa + marca/modelo + color | `vecino.vehicles` |
| `peatonal` | residente | `peatonal`: nombre + casa + rol + teléfono + **placas de la casa** + **QR único** (`/r/<profile_id>`) | `vecino.profiles` (activos y aprobados) |

Pestaña **"Lote"** en la web local:
1. Eliges el **tipo de credencial** (vehicular / peatonal).
2. Subes la imagen del frente (1 sola, compartida).
3. Eliges la colonia (se cargan de Supabase) → "Cargar registros".
4. "Ver primera tarjeta" para validar el diseño.
5. Campo **"primeras N"** para probar con 1 antes del lote completo → "Imprimir lote".

Endpoints: `GET /colonias`, `GET /vehicles?colonia=ID`, `GET /residentes?colonia=ID`,
`POST /print-batch` (frente `png` + `tipo` + `rows` JSON). **Todos exigen `x-print-token`.**
El bridge lee Supabase con `SUPABASE_SERVICE_ROLE_KEY` **server-side** (nunca al navegador),
con header `Accept-Profile: vecino`.

## Plantillas disponibles
`templates/index.js` registra: `credencial` (gafete con foto), `residente`/`cliente` (alias),
`qr` (reverso con QR + número), `vehiculo` (reverso por vehículo), `peatonal` (reverso por
residente, acceso peatonal). Agregar nuevas ahí.

## Endpoints
| Método | Ruta | Token | Qué hace |
|--------|------|:-----:|----------|
| GET | `/health` | — | Estado del bridge y de la impresora |
| POST | `/preview` | ✓ | Devuelve el PNG de una cara **sin imprimir** (`?side=back` para el reverso) |
| POST | `/print` | ✓ | Imprime una tarjeta (1 o 2 caras) |
| GET | `/colonias` | ✓ | Colonias disponibles (Supabase) |
| GET | `/vehicles?colonia=ID` | ✓ | Vehículos para lote vehicular |
| GET | `/residentes?colonia=ID` | ✓ | Residentes para lote peatonal |
| POST | `/print-batch` | ✓ | Lote: frente compartido + reverso por registro según `tipo` |
| GET | `/` | — | Página web local (el token se captura ahí y se recuerda en el navegador) |

## Cómo lo consume otra app

### Modo COLA (recomendado — módulo Credenciales de Vecinity)
Vecinity inserta trabajos en `vecino.print_jobs` (al aprobar el comité una solicitud de
tarjeta) y el bridge los consume solo. Activar con `QUEUE_POLL=true` en `.env`:
el bridge barre la cola cada 10s (`QUEUE_INTERVAL_MS`), imprime y marca
`imprimiendo → impresa / error` (con reintento desde la UI del comité).
- Frente de la tarjeta: `colonias.tarjeta_frente_url` (imagen compartida) o `FRONT_IMAGE` local.
- El QR peatonal se arma aquí: `DEFAULT_QR_URL/r/<profileId>`.
- Se puede imprimir "desde el celular": el comité aprueba en Vecinity y la tarjeta
  sale en esta Mac cuando esté encendida con el bridge activo.

### Modo directo (fallback / pruebas)
La app arma el JSON (datos del residente/cliente + foto) y hace `POST http://localhost:7777/print`.
El navegador del operador debe estar en la **misma Mac** que la impresora (modelo localhost-bridge).

## Seguridad
- Escucha **solo en `127.0.0.1`** — no se expone a la red.
- `/print` exige `x-print-token` (en `.env`, no se commitea).
