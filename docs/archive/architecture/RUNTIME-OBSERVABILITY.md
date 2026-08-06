# Automation Runtime Observability

**Date:** 2026-07-18  
**Status:** AUTOMATION OBSERVABILITY COMPLETE  
**Commit intent:** `feat(runtime): add automation observability dashboard`

## Goal

Hoàn thiện **Runtime Dashboard** — tăng khả năng quan sát và vận hành.

- Không thêm business logic
- Không thêm workflow
- Không thêm destination
- Chỉ **đọc** dữ liệu runtime

## Architecture

```
Worker process
  → ExecutionPool.snapshot() + BrowserPool.snapshot() + process mem
  → HeartbeatService → BrowserSession.metadata (JSON)

CMS API (read-only)
  GET /api/agent/runtime
  → buildAutomationRuntimeSnapshot()
  → join sessions.metadata + AgentJob + MissionRun + CampaignRun counts

UI (lazy)
  /admin/agents/runtime
  → RuntimeMonitorPage (poll ~8s)
```

`App.tsx` không thêm logic — mount vẫn qua Agent Platform routes hiện có.

## Surfaces

| Panel | Source |
|-------|--------|
| Workers | `BrowserSession` + heartbeat age |
| Execution Pool | `metadata.executionPool` |
| Browser Pool | `metadata.browserPool` (+ worker RSS proxy) |
| Mission Runtime | `AgentMissionRun` groupBy + timeline |
| Campaign Runtime | `SocialCampaignRun.progress` + ETA estimate |
| Queue / Running Jobs | `AgentJob` status counts + active list |
| Health | Worker / Browser / Queue / Mission / Scheduler scores |
| Metrics | publish/hour, scan/hour, success/retry rate, util % |

## Browser Pool columns

Browser ID · Purpose · State · Current Mission · Current Job · Lease time · Memory · CPU · Last heartbeat

**Note:** Memory = worker process RSS (proxy). Chrome OS CPU không đo trong MVP (`cpuPercent: null`).

## Execution Pool columns

Slot · Type (status) · Running jobs · Queue (waiters) · Busy % · Avg runtime · Failures (since boot)

## Mission Runtime

Waiting · Running · Retry · Completed · Failed · Cancelled + realtime timeline (latest runs).

## Campaign Runtime

Progress % · Targets · Success · Failed · Partial Success · ETA (rate from startedAt).

## Queue

Waiting · Claimed · Running · Retry · Dead Letter (+ active job table).

## Health Score

Average of:

- Worker (online heartbeat ≤ 45s)
- Browser (idle/leased handles present)
- Queue (dead-letter / backlog thresholds)
- Mission (failed vs completed)
- Scheduler (always soft-ok if counts readable)

## API

```
GET /api/agent/runtime
→ { status: 'success', data: AutomationRuntimeSnapshot }
```

Không thay đổi API cũ. Endpoint mới, read-only.

## UI

- Lazy: `src/features/agent/runtime-monitor/pages/RuntimeMonitorPage.tsx`
- Nav: Agent Platform → **Runtime** (`/admin/agents/runtime`)
- Poll 8s; manual refresh

## Constraints honored

| Rule | How |
|------|-----|
| Read-only | Aggregator never mutates jobs/missions |
| No business logic | No publish/scan/campaign behavior changes |
| No new workflow/destination | Observability only |
| Existing APIs unchanged | Only additive `GET /api/agent/runtime` |
| App.tsx clean | No new App logic |

## Tests

- `npm run test:runtime-observability`
- `npm run test:execution-pool`
- `npm run test:mission-engine`
- `npm run test:social-publishing`
- `npm run lint`
