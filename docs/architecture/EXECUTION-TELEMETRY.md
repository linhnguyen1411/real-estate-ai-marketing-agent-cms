# Execution Agent Telemetry

## Goal

Make each **Local Execution Agent** a monitorable Runtime Node. Telegram (and future clients) see per-machine state — not only VPS health.

## Pipeline

```
Execution Agent
      ↓
Telemetry Layer (agent builder)
      ↓
Runtime API (heartbeat / register)
      ↓
Telemetry Collector (Control Plane)
      ↓
Command Engine / Event Bus
      ↓
Telegram Copilot / Ops Center
```

## Principles

- **DRY** — one normalize path → `ExecutionAgentRuntimeSnapshot`
- **SOLID** — collector, remote control, formatters are separate adapters
- **Registry** — Telegram commands stay in Command Registry
- **Event-driven** — snapshots on heartbeat; discrete events for lifecycle
- **No duplicate heartbeat events** — ingest stores last snapshot only
- **No SSH** — remote control via heartbeat OPS queue
- **No DB / Browser from Telegram** — Control Plane only
- **Extensible** — Fleet / Web / Discord / Slack read the same snapshot API

## Heartbeat fields

Each heartbeat includes (via metadata):

| Field | Source |
|-------|--------|
| Agent | `agentId` |
| Hostname | OS / metadata |
| Version | registry metadata |
| Platform | `os.platform()/arch` |
| Uptime | process uptime |
| Heartbeat Time | `lastHeartbeatAt` |

## Snapshot blocks

- Host: CPU load, RAM, disk
- Process: RSS, heap
- Browser: profiles, chrome count, busy/locked, URL, action
- Jobs: running / waiting / step / progress / ETA
- Mission / Scanner / Publish summaries

## Runtime events (push)

`MISSION_*`, `BROWSER_*`, `AGENT_RESTART`, `QUEUE_BLOCKED`, `PUBLISH_STARTED`, `PUBLISH_FINISHED`, `OPS_REQUEST`

Heartbeat itself does **not** emit a new event per pulse.

## Remote control

Queued on Control Plane → drained on next heartbeat response (`opsCommands`):

- `release_browser` / `restart_browser` / `refresh_runtime` / `restart_agent`
- Job retry/pause/resume/cancel via existing Mission Control Plane commands

## Modules

| Path | Role |
|------|------|
| `server/automation-agent/telemetryCollector.ts` | Agent-side metadata builder |
| `server/modules/control-plane/telemetry/` | Normalize, collector, remote OPS, Telegram formatters |
| `server/modules/control-plane/runtimeAgentService.ts` | Ingest + return `opsCommands` |

## Out of scope

Mission / Scanner / Publisher / Browser Runtime business logic — unchanged.
