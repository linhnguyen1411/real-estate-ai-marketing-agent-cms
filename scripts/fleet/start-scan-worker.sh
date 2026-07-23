#!/usr/bin/env bash
# Start local scan/publish worker attached to CDP Chrome on this workstation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

HOSTNAME_SAFE="$(hostname | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
export AGENT_WORKER_ID="${AGENT_WORKER_ID:-worker-${HOSTNAME_SAFE}}"
export AGENT_MACHINE_ID="${AGENT_MACHINE_ID:-$(hostname)}"
export AGENT_DISPLAY_NAME="${AGENT_DISPLAY_NAME:-$(hostname)}"
export AGENT_BROWSER_PROFILE_DIR="${AGENT_BROWSER_PROFILE_DIR:-$ROOT/runtime/agent-browser-profile}"
export AGENT_CDP_ENDPOINT="${AGENT_CDP_ENDPOINT:-http://127.0.0.1:${AGENT_CDP_PORT:-9222}}"
export AGENT_SCHEDULER_ENABLED="${AGENT_SCHEDULER_ENABLED:-true}"
# Do not inherit VPS runtime / automation-agent profile.
unset AGENT_RUNTIME_API_BASE_URL || true

mkdir -p "$AGENT_BROWSER_PROFILE_DIR"

echo "[fleet] Scan worker"
echo "  workerId:   $AGENT_WORKER_ID"
echo "  machineId:  $AGENT_MACHINE_ID"
echo "  cdp:        $AGENT_CDP_ENDPOINT"
echo "  managed:    $AGENT_BROWSER_PROFILE_DIR"
echo "  scheduler:  $AGENT_SCHEDULER_ENABLED"

# Fail fast if CDP is down (Facebook sources need it).
if ! curl -fsS --max-time 3 "${AGENT_CDP_ENDPOINT}/json/version" >/dev/null; then
  echo "[fleet] CDP unreachable at $AGENT_CDP_ENDPOINT" >&2
  echo "  Run: bash scripts/fleet/start-cdp-chrome.sh" >&2
  exit 1
fi

exec npm run agent:worker
