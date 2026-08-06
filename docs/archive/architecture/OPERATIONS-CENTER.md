# Operations Center

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER COMPLETE  
**Commit intent:** `feat(operations): introduce fleet orchestration and operations center`

## Goal

Biến Control Plane (VPS) thành **Operations Center** quản lý Automation Fleet realtime qua **Metrics Snapshot** — không poll agent, không query Browser Runtime trực tiếp.

## Architecture

```
Execution Agent
      ↓
Metrics Collector  (5m · event · manual)
      ↓
Runtime Snapshot
      ↓
Fleet Registry
      ↓
Operations Center
      ↓
Control Plane
      ↓
Telegram / Admin Runtime · Reports
```

## What Control Plane knows

- Số Agent · online/offline
- Agent đang làm gì (activity)
- Job / Mission / Browser ownership theo máy
- Tiến độ hệ thống (scanner · publisher · mission · workload)

## Surfaces

| Surface | Path / Command |
|---------|----------------|
| Admin Runtime | `/admin/agents/runtime` |
| Admin Reports | `/admin/agents/reports` |
| API | `GET /api/agent/runtime?refresh=1` · `/api/agent/operations` · `/api/agent/fleet` |
| Telegram | `/dashboard` · `/runtime` · `/report …` · `/fleet` |

## Refresh policy

Không polling liên tục. Metrics cập nhật khi:

- Interval 5 phút (`startMetricsCollector`)
- Job / Mission / Publish complete (Event Bus)
- Heartbeat (throttled 60s)
- Manual refresh (UI / Telegram / `?refresh=1`)

## Principles

Single Source of Truth · Snapshot-based · Event-driven · DRY · SOLID · Registry · Adapter · Strategy

Không duplicate Scheduler queue · Runtime · Queue cores.

## Non-goals

Không sửa Scanner · Publisher · Mission Runtime · Browser Runtime · rewrite Execution Agent.

## Tests

```bash
npm run test:operations-center
npm run test:fleet-registry
npm run lint
```
