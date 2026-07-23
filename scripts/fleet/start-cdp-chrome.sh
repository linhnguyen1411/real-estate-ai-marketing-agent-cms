#!/usr/bin/env bash
# Start Chrome with remote debugging for Facebook CDP scan (one workstation).
# Profile is dedicated — never use the default Chrome User Data dir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_DIR="${AGENT_CDP_PROFILE_DIR:-$ROOT/runtime/agent-cdp-profile}"
CDP_PORT="${AGENT_CDP_PORT:-9222}"
START_URL="${AGENT_LOGIN_START_URL:-https://www.facebook.com/}"

mkdir -p "$PROFILE_DIR"

# Prefer google-chrome / chromium on Linux; Google Chrome.app on macOS.
if command -v google-chrome >/dev/null 2>&1; then
  CHROME=(google-chrome)
elif command -v google-chrome-stable >/dev/null 2>&1; then
  CHROME=(google-chrome-stable)
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROME=(chromium-browser)
elif command -v chromium >/dev/null 2>&1; then
  CHROME=(chromium)
elif [[ "$(uname -s)" == "Darwin" ]] && [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  CHROME=("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
else
  echo "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH." >&2
  exit 1
fi

if [[ -n "${CHROME_PATH:-}" ]]; then
  CHROME=("$CHROME_PATH")
fi

echo "[fleet] CDP Chrome"
echo "  profile: $PROFILE_DIR"
echo "  port:    $CDP_PORT"
echo "  url:     $START_URL"
echo "Log in to Facebook in this window and keep it open."

exec "${CHROME[@]}" \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "$START_URL"
