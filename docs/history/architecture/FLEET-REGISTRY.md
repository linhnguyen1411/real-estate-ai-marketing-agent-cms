# Fleet Registry

**Date:** 2026-07-20  
**Status:** FLEET AWARENESS COMPLETE  
**Commit intent:** `feat(fleet): introduce fleet registry and awareness`

## Goal

Đăng ký và định danh nhiều Execution Agent mà **không hardcode** machine list. Mỗi agent tự khai báo identity + capabilities qua heartbeat metadata.

**Không** sửa Scanner · Publisher · Mission · Browser Runtime. **Không** rewrite Execution Agent — chỉ mở rộng metadata + Control Plane fleet layer.

## Architecture

```
Execution Agent (heartbeat + runtime metadata)
        │
        ▼
Agent Registry (BrowserSession + agentId / machineId / tags)
        │
        ▼
Fleet Registry (enrich → FleetAgent)
        │
        ▼
Fleet Manager / Control Plane / Telegram · Web
```

## Registration fields

Mỗi agent đăng ký (qua heartbeat / session metadata):

| Field | Source |
|-------|--------|
| `agentId` | heartbeat `agentId` / `workerId` |
| `displayName` | `AGENT_DISPLAY_NAME` or metadata |
| `hostname` | `host.hostname` |
| `machineId` | `AGENT_MACHINE_ID` or metadata |
| `platform` | `host.platform` |
| `version` | agent version string |
| `tags` | `AGENT_TAGS` (comma/space) or metadata array |
| `capabilities` | declared caps (`scan`, `publish`, `browser`, …) |
| `status` | derived online/offline/degraded |
| `lastHeartbeat` | session `lastHeartbeatAt` |
| `uptime` | `host.uptimeSec` / process uptime |

## Module layout

```
server/modules/control-plane/fleet/
  types.ts          FleetAgent, FleetState, ownership rows
  registry.ts       enrich AgentNode + Runtime Snapshot
  state.ts          aggregateFleetState / getFleetState
  formatTelegram.ts Telegram / Web text adapters
  index.ts          public exports
```

## Single Source of Truth

- Identity + liveness: **Agent Registry** (session + heartbeat).
- Workload / resources: **Runtime Snapshot** (in-memory telemetry preferred; else normalize metadata).
- Fleet Registry **does not** poll agents or query Browser Runtime directly.
- **No duplicate heartbeat store** — reuses existing ingest path.

## Env (optional identity)

- `AGENT_MACHINE_ID`
- `AGENT_DISPLAY_NAME`
- `AGENT_TAGS`

## Tests

```bash
npm run test:fleet-registry
```

Expect: `Fleet Registry PASS`
