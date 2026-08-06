# Fleet Awareness

**Date:** 2026-07-20  
**Status:** FLEET AWARENESS COMPLETE  
**Commit intent:** `feat(fleet): introduce fleet registry and awareness`

## Goal

Control Plane phải biết toàn fleet:

- bao nhiêu Execution Agent
- máy online / offline
- busy / idle
- đang scan / publish / campaign
- đang giữ browser
- đang lỗi

Đọc **Runtime Snapshot**, không poll agent, không query Browser trực tiếp.

## Data flow

```
Execution Agent
      ↓
Fleet Registry
      ↓
Runtime Snapshot
      ↓
Fleet Manager (aggregateFleetState)
      ↓
Control Plane (opsGetFleet / opsGetFleetAgent)
      ↓
Telegram / Web / Reports
```

## Fleet State

`aggregateFleetState` tổng hợp:

| Bucket | Meaning |
|--------|---------|
| Online / Offline | heartbeat + status |
| Busy / Idle | running jobs vs none |
| Scanning / Publishing / Campaign | activity from snapshot |
| Browser hold | leased/busy profiles |
| Error | degraded / needs_login / lastError |
| Running Jobs / Missions / Browsers | counts |
| Health | 0–100 score from online vs error/offline mix |

Activity enum (`FleetActivity`):

`idle` · `busy` · `scanning` · `publishing` · `campaign` · `browser_hold` · `error` · `offline`

## Runtime Snapshot (attached per agent)

Snapshot (telemetry) lưu:

- CPU (`loadAvg1m`)
- RAM (`memTotalMb` / `memFreeMb`)
- RSS / Heap
- Execution slots
- Browser profiles
- Current jobs
- Mission
- Scanner
- Publisher

Prefer last in-memory snapshot from telemetry collector; fallback `normalizeRuntimeSnapshot(session.metadata)`.

## Job ownership

Mỗi job surface biết:

- Claimed By (`claimedBy` / owner)
- Machine (`machineId` / hostname)
- Started At
- Duration

Exposed via operations service job list join with fleet identity.

## Principles

- **DRY / SOLID** — registry + adapter formatters; state aggregation isolated
- **Snapshot-based** — no live Browser Pool queries from Telegram
- **Single Source of Truth** — heartbeat + snapshot only once
- **Adapter** — Telegram formatters consume `FleetState` / `FleetAgent`, not raw Prisma

## Boundaries

| May touch | Must not touch |
|-----------|----------------|
| Fleet Registry / Manager | Scanner core |
| Runtime Snapshot attachment | Publisher core |
| Control Plane ops + commands | Mission engine rewrite |
| Telegram reports | Browser Runtime rewrite |
| Agent identity metadata | Full Execution Agent rewrite |

## Tests

Expect PASS: Fleet Dashboard · Runtime Snapshot · Machine Detail · Browser · Mission · Telegram · Lint
