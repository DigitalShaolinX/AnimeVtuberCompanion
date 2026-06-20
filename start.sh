#!/usr/bin/env bash
# ============================================================
#  Live2D Companion - one-click launcher (macOS / Linux)
#  Installs anything missing, then starts the app.
# ============================================================
set -e
cd "$(dirname "$0")"

echo
echo "=================================================="
echo "  Live2D Companion - starting up"
echo "=================================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js (>= 20.11) is required but was not found."
  echo "Install it from https://nodejs.org/ or your package manager, then re-run."
  exit 1
fi

exec node scripts/setup.mjs --start
