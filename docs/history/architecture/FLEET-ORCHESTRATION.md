# Fleet Orchestration

**Date:** 2026-07-20  
**Status:** OPERATIONS CENTER COMPLETE  
**Commit intent:** `feat(operations): introduce fleet orchestration and operations center`

## Goal

Fleet Scheduler chọn máy phù hợp theo strategy — **không** tạo queue/scheduler mới, **không** thay `claimNextJob`.

## Module

`server/modules/control-plane/fleet/scheduler.ts`

- `scoreFleetAgents(agents, req)`
- `scheduleFleetAgent(agents, req)`
- `suggestTargetAgentId(agents, req)` → gợi ý `payload.targetAgentId`

## Ranking inputs

| Factor | Behavior |
|--------|----------|
| Capabilities | Hard filter (`require`) |
| Tags | Hard (`requireTags`) + soft (`preferTags`) |
| Priority | Tăng trọng số load khi priority cao |
| Load | `jobs.running / executionSlots` |
| CPU | `cpuLoad1m` penalty |
| RAM | used % penalty · `minMemFreeMb` filter |
| Browser | `requireBrowserFree` · free profile bonus |
| Preference | preferred agentId / hostname boost |

## Integration

- `ControlPlane.scheduleFleetAgent(req, companyId)`
- `opsScheduleAgent(...)` trong operationsService
- Claim path sẵn có `targetAgentId` + capability filter — orchestration chỉ đề xuất affinity

## Workload view

Operations Metrics gắn completed-today theo `claimedBy` → machine rows (assigned / running / completed).
