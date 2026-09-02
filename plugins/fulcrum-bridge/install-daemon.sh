#!/usr/bin/env bash
# Install Fulcrum Bridge as a per-user LaunchAgent (login start + auto-restart).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.fulcrum.bridge"
INSTALL_APP="${FULCRUM_BRIDGE_APP:-$HOME/Applications/FulcrumBridge.app}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/FulcrumBridge"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

usage() {
	cat <<EOF
Usage: $(basename "$0") [--no-build]

Builds FulcrumBridge.app (unless --no-build), installs to:
  ${INSTALL_APP}

Registers a LaunchAgent that:
  - starts at login
  - restarts if the process exits or crashes (KeepAlive)

Logs:
  ${LOG_DIR}/stdout.log
  ${LOG_DIR}/stderr.log

Override install path:
  FULCRUM_BRIDGE_APP=/path/to/FulcrumBridge.app $(basename "$0")
EOF
}

NO_BUILD=0
for arg in "$@"; do
	case "$arg" in
		--no-build) NO_BUILD=1 ;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			usage >&2
			exit 1
			;;
	esac
done

if [[ "$NO_BUILD" -eq 0 ]]; then
	echo "==> Building Fulcrum Bridge..."
	"$ROOT/build.sh"
fi

SRC_APP="$ROOT/.build/FulcrumBridge.app"
if [[ ! -d "$SRC_APP" ]]; then
	echo "Missing $SRC_APP — run ./build.sh first." >&2
	exit 1
fi

echo "==> Stopping any running Fulcrum Bridge..."
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
pkill -x FulcrumBridge 2>/dev/null || true
sleep 1

echo "==> Installing app to ${INSTALL_APP}..."
mkdir -p "$(dirname "$INSTALL_APP")"
rm -rf "$INSTALL_APP"
ditto "$SRC_APP" "$INSTALL_APP"
codesign --force --sign - "$INSTALL_APP" 2>/dev/null || true

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
EXEC="$INSTALL_APP/Contents/MacOS/FulcrumBridge"
WATCHDOG="$LOG_DIR/launch-fulcrum-bridge.sh"

# Launch via `open` so macOS TCC (Calendar/Reminders) attaches to the .app bundle.
# Running the Mach-O directly from launchd often leaves authorization as notDetermined.
mkdir -p "$LOG_DIR"
cat >"$WATCHDOG" <<'WATCH'
#!/bin/bash
APP=__APP__
if ! pgrep -xq FulcrumBridge; then
	/usr/bin/open -ga "$APP"
	sleep 2
fi
# Stay alive while the app runs so launchd KeepAlive can restart us if it exits.
while pgrep -xq FulcrumBridge; do
	sleep 5
done
exit 0
WATCH
# shellcheck disable=SC2016
sed -i '' "s|__APP__|${INSTALL_APP}|g" "$WATCHDOG"
chmod +x "$WATCHDOG"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${WATCHDOG}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>LimitLoadToSessionType</key>
	<string>Aqua</string>
	<key>StandardOutPath</key>
	<string>${LOG_DIR}/stdout.log</string>
	<key>StandardErrorPath</key>
	<string>${LOG_DIR}/stderr.log</string>
</dict>
</plist>
EOF

echo "==> Loading LaunchAgent ${LABEL}..."
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "${DOMAIN}/${LABEL}"
launchctl kickstart -k "${DOMAIN}/${LABEL}"

echo "==> Waiting for Fulcrum Bridge..."
for _ in 1 2 3 4 5; do
	if curl -sf "http://127.0.0.1:9247/health" >/dev/null; then
		echo "==> Fulcrum Bridge is running."
		curl -s "http://127.0.0.1:9247/health" | python3 -m json.tool 2>/dev/null || curl -s "http://127.0.0.1:9247/health"
		echo ""
		echo "Installed. Starts automatically at login and restarts on crash."
		echo "Stop daemon:    $ROOT/uninstall-daemon.sh"
		echo "Restart daemon: launchctl kickstart -k ${DOMAIN}/${LABEL}"
		exit 0
	fi
	sleep 1
done

echo "==> LaunchAgent loaded but /health did not respond yet." >&2
	echo "    Check logs: ${LOG_DIR}/stderr.log" >&2
	echo "    Status: launchctl print ${DOMAIN}/${LABEL}" >&2
exit 1
