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
  -H "x-print-token: nexia-local-dev" \
  -F "png=@credencial.png" \
  -F "copies=1"
```

### 2) Plantilla — el bridge diseña la tarjeta
Mandas datos y el bridge renderiza la credencial.
```bash
curl -X POST http://localhost:7777/print \
  -H "Content-Type: application/json" -H "x-print-token: nexia-local-dev" \
  -d '{"template":"credencial","data":{"titulo":"NEXIA CONDOMINIOS","nombre":"Juan Garcés","subtitulo":"Residente · Torre A-301","colorMarca":"#1f6feb"},"copies":1}'
```

### Dos caras (YMCKOK: frente color, reverso B/N)
Agrega `backPng` (modo directo) o `backTemplate`+`backData` (plantilla). El reverso es la página 2 del trabajo.

### Reverso con QR / número de casa
Plantilla `qr` (codifica una URL editable por tarjeta + número de casa opcional). La URL default
sale de `DEFAULT_QR_URL` en `.env`.

## Impresión por lote (desde Supabase, schema `vecino`)
Para muchas tarjetas con el **mismo frente** y un reverso distinto por registro.
Modelo actual: **una tarjeta por vehículo** (placa + casa + marca/modelo + color, plantilla `vehiculo`).

Pestaña **"Lote"** en la web local:
1. Subes la imagen del frente (1 sola, compartida).
2. Eliges la colonia (se cargan de Supabase) → "Cargar vehículos".
3. "Ver primera tarjeta" para validar el diseño.
4. Campo **"primeras N"** para probar con 1 antes del lote completo → "Imprimir lote".

Endpoints: `GET /colonias`, `GET /vehicles?colonia=ID`, `POST /print-batch` (frente `png` + `rows` JSON).
El bridge lee Supabase con `SUPABASE_SERVICE_ROLE_KEY` **server-side** (nunca al navegador),
con header `Accept-Profile: vecino`.

## Plantillas disponibles
`templates/index.js` registra: `credencial` (gafete con foto), `residente`/`cliente` (alias),
`qr` (reverso con QR + número), `vehiculo` (reverso por vehículo). Agregar nuevas ahí.

## Endpoints
| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/health` | Estado del bridge y de la impresora |
| POST | `/preview` | Devuelve el PNG del frente **sin imprimir** (para mostrar en la app) |
| POST | `/print` | Imprime (requiere header `x-print-token`) |
| GET | `/` | Página web local: subir PNG o usar plantilla |

## Cómo lo consume otra app (Vecinity / nexia-tienda)
La app arma el JSON (datos del residente/cliente + foto) y hace `POST http://localhost:7777/print`.
El navegador del operador debe estar en la **misma Mac** que la impresora (modelo localhost-bridge).

## Seguridad
- Escucha **solo en `127.0.0.1`** — no se expone a la red.
- `/print` exige `x-print-token` (en `.env`, no se commitea).
