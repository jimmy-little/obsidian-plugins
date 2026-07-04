#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
else
  echo "Fulcrum Bridge requires Xcode (not Command Line Tools alone)." >&2
  echo "Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi

swift build -c release "$@"

BIN=".build/release/FulcrumBridge"
APP=".build/FulcrumBridge.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/FulcrumBridge"
cp Sources/FulcrumBridge/Info.plist "$APP/Contents/Info.plist"
chmod +x "$APP/Contents/MacOS/FulcrumBridge"
codesign --force --sign - "$APP" 2>/dev/null || true

echo ""
echo "Built binary: $(pwd)/$BIN"
echo "Built app:    $(pwd)/$APP  (menu bar + HTTP server)"
echo ""
echo "First-time setup (Calendar permission):"
echo "  pkill -x FulcrumBridge 2>/dev/null || true"
echo "  open $APP"
echo ""
echo "Then verify:"
echo "  curl -s http://127.0.0.1:9247/health | python3 -m json.tool"
echo ""
echo "Run as login daemon (auto-start + restart on crash):"
echo "  ./install-daemon.sh"
