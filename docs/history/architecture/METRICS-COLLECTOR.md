# Metrics Collector

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER COMPLETE  
**Commit intent:** `feat(operations): introduce fleet orchestration and operations center`

## Goal

Thu thập **OperationsMetricsSnapshot** làm SSOT cho dashboard / reports / Telegram.

## Module

`server/modules/control-plane/operations/metricsCollector.ts`

## Snapshot contents

**Runtime / machine**

- CPU · RAM · RSS · Heap · Chrome · Browser profiles · Execution slots · Heartbeat

**Work blocks**

- Fleet (online/busy/idle · CPU/RAM avg · browser busy/idle)
- Scanner (sources · assigned · running · completed · findings · posts)
- Publisher (draft · queue · publishing · published today · retry)
- Mission (running · waiting · completed · failed)
- Workload totals (waiting/retry/failed jobs · campaigns)

## Triggers

| Trigger | Reason |
|---------|--------|
| 5 minute timer | `interval_5m` |
| Startup | `startup` |
| Dashboard / Telegram / Report | `dashboard` / `telegram` / `report` |
| Manual UI refresh | `manual` |
| JOB_COMPLETED | `job_complete` |
| MISSION_COMPLETED | `mission_complete` |
| PUBLISH_FINISHED | `publish_complete` |
| Heartbeat (throttled 60s) | `heartbeat` |

## Start / stop

Wired in `server.ts` when `AGENT_ENABLED` + DB ready:

```ts
startMetricsCollector() // default 5 minutes
stopMetricsCollector()  // on SIGINT/SIGTERM
```

## Reads

- `getLastOperationsMetrics(companyId)`
- `refreshOperationsMetrics({ reason })`
- `notifyMetricsEvent({ reason })`

Dashboard **chỉ đọc** snapshot — không query Browser / Agent realtime.
