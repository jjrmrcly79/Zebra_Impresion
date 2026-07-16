#!/bin/bash
# Instala (o reinstala) el LaunchAgent de autoarranque del print-bridge.
# El bridge queda corriendo siempre: arranca al iniciar sesión y se relanza si muere.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || echo /usr/local/bin/node)"
PLIST="$HOME/Library/LaunchAgents/com.nexia.print-bridge.plist"

if [ ! -f "$DIR/.env" ]; then
  echo "⚠️  Falta $DIR/.env — el bridge no arrancará sin PRINT_TOKEN." >&2
  exit 1
fi

mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"
sed -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$NODE|g" \
  "$DIR/launchd/com.nexia.print-bridge.plist" > "$PLIST"

# Reinstalación limpia: bajar la versión previa si existía.
launchctl bootout "gui/$UID/com.nexia.print-bridge" 2>/dev/null || true

# Si hay un bridge manual corriendo (npm start), avisar: el LaunchAgent chocaría con el puerto.
if lsof -ti :7777 >/dev/null 2>&1; then
  echo "⚠️  Ya hay algo escuchando en el puerto 7777 (¿bridge manual?). Ciérralo y vuelve a correr este script." >&2
  exit 1
fi

launchctl bootstrap "gui/$UID" "$PLIST"
echo "✓ LaunchAgent instalado y arrancado."
echo "  Logs:      $DIR/logs/bridge.log"
echo "  Detener:   launchctl bootout gui/$UID/com.nexia.print-bridge"
echo "  Reiniciar: launchctl kickstart -k gui/$UID/com.nexia.print-bridge"
sleep 2
curl -s http://localhost:7777/health >/dev/null && echo "✓ Bridge respondiendo en http://localhost:7777" \
  || echo "⚠️  El bridge no responde aún — revisa $DIR/logs/bridge.log"
