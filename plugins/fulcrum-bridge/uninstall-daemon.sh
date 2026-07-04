#!/usr/bin/env bash
# Remove Fulcrum Bridge LaunchAgent and optionally the installed app bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.fulcrum.bridge"
INSTALL_APP="${FULCRUM_BRIDGE_APP:-$HOME/Applications/FulcrumBridge.app}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

PURGE_APP=0
for arg in "$@"; do
	case "$arg" in
		--purge-app) PURGE_APP=1 ;;
		-h | --help)
			echo "Usage: $(basename "$0") [--purge-app]"
			echo "  --purge-app  Also delete ${INSTALL_APP}"
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

echo "==> Stopping Fulcrum Bridge LaunchAgent..."
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
pkill -x FulcrumBridge 2>/dev/null || true

if [[ -f "$PLIST" ]]; then
	rm -f "$PLIST"
	echo "Removed $PLIST"
fi

if [[ "$PURGE_APP" -eq 1 && -d "$INSTALL_APP" ]]; then
	rm -rf "$INSTALL_APP"
	echo "Removed $INSTALL_APP"
fi

echo "Fulcrum Bridge daemon uninstalled."
echo "Re-install: $ROOT/install-daemon.sh"
