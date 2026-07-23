# Fleet workstation bootstrap (Chrome CDP + scan worker)

One physical machine = one fleet entry. Use a stable `AGENT_MACHINE_ID` (defaults to hostname).

## Windows

```powershell
# 1) Chrome CDP (login Facebook, keep window open)
.\scripts\fleet\start-cdp-chrome.ps1

# 2) Local worker (new terminal)
.\scripts\fleet\start-scan-worker.ps1
```

## Linux / macOS

```bash
chmod +x scripts/fleet/*.sh
bash scripts/fleet/start-cdp-chrome.sh   # terminal 1 — keep open
bash scripts/fleet/start-scan-worker.sh  # terminal 2
```

## Env overrides

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_CDP_PROFILE_DIR` | `runtime/agent-cdp-profile` | Chrome user-data for Facebook |
| `AGENT_CDP_PORT` | `9222` | Remote debugging port (localhost only) |
| `AGENT_CDP_ENDPOINT` | `http://127.0.0.1:9222` | Worker attach URL |
| `AGENT_BROWSER_PROFILE_DIR` | `runtime/agent-browser-profile` | Managed Chrome for non-FB |
| `AGENT_WORKER_ID` | `worker-<hostname>` | Stable worker id (no PID) |
| `AGENT_MACHINE_ID` | hostname | Fleet dedupe key — **same on all agents of this PC** |
| `AGENT_DISPLAY_NAME` | hostname | Name shown in `/runtime` Fleet |
| `AGENT_SCHEDULER_ENABLED` | `true` | Auto enqueue scan jobs |

## Check session

```bash
npm run agent:check-facebook-session
```

Expect `detectedState: "logged_in"`.

## Do not mix

- Do **not** point CDP at `runtime/agent-vps-heartbeat-profile` / automation-agent profile on the same port.
- Do **not** force Facebook sources to `browserMode: managed`.
- Do **not** expose port `9222` beyond localhost.
