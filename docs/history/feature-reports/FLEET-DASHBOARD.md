# Fleet Dashboard (Telegram)

**Date:** 2026-07-20  
**Status:** FLEET AWARENESS COMPLETE  
**Commit intent:** `feat(fleet): introduce fleet registry and awareness`

## Goal

Telegram (và Web ops surface dùng cùng formatters) đọc fleet qua Control Plane — **không** poll agent, **không** mở Browser trực tiếp.

## Commands

### `/fleet`

Fleet overview:

- Machines (agentId / displayName / hostname)
- Status + activity
- CPU / RAM (when snapshot present)
- Jobs running
- Browser busy count
- Mission short label

Source: `opsGetFleet` → `formatFleetDashboardLines`.

### `/agent` · `/agent <id|hostname>`

Without arg: short list of agents + hint to pick one.

With arg: machine detail —

- Hostname / machineId
- Status + activity
- Current job / owners
- Current mission
- Current browser / URL
- Heartbeat age + uptime
- CPU · RAM · RSS · Heap when available

Source: `opsGetFleetAgent` → `formatFleetAgentDetailLines`.

### `/browser`

Fleet browser table:

- Machine (hostname)
- Profile
- Facebook account (if known)
- Busy
- Current URL

Source: `listFleetBrowsers` / fleet `browsers` → `formatFleetBrowserLines`.

### `/jobs`

Job list with ownership: claimed by, machine, started at, duration (fleet-aware join).

### Reports

| Command | Content |
|---------|---------|
| `/report fleet` | Same dashboard projection as `/fleet` |
| `/report runtime` | Runtime / agent telemetry summary |
| `/report browser` | Browser fleet view |

Parse kinds include `fleet` and `runtime` in command engine / report engine.

## Architecture note

```
Telegram command
  → Command Engine (operationsCommands)
  → operationsService (opsGetFleet*)
  → Fleet Registry + Runtime Snapshot
  → formatTelegram adapters
  → reply lines
```

Web dashboards should call the same Control Plane / ops helpers — one projection, multiple adapters.

## Help

Ops help text lists:

- `/fleet`
- `/agent` · `/agent <id|hostname>` · `/agent restart <id>`
- `/browser …`
- `/report today|week|fleet|runtime|publish|scan|failed|agent|browser`

## Tests

```bash
npm run test:fleet-registry
```

Expect: `Fleet Dashboard PASS` · `Machine Detail PASS` · `Browser PASS` · `Telegram PASS`
