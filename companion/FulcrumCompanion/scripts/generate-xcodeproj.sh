#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Installing XcodeGen via Homebrew…"
  brew install xcodegen
fi
xcodegen generate
echo "Open FulcrumCompanion.xcodeproj in Xcode."
