# Local Scheduler (Execution Agent)

**Date:** 2026-07-18  
**Status:** Documented (existing behavior — no new scheduler module)  
**Related:** Telegram Control Plane · Execution Agent · Runtime API

## Principle

**Không lấy lịch từ RAM làm nguồn sự thật.**  
Production Queue (CMS / DB / Runtime API) là source of truth.  
Execution Agent **poll → claim → schedule locally → execute → report**.

## Flow

```
Control Plane / CMS Scheduler
    ↓ enqueue AgentJob / SocialPublishJob bridge
Production Queue (DB)
    ↓
Execution Agent poll (Runtime API claim OR local jobClaimer)
    ↓ claim
Local execution (WorkerLoop + ExecutionPool + BrowserPool)
    ↓ due / immediate
publish / scan handler
    ↓
complete / fail → Runtime API report
```

Telegram `/publish now` and `/publish queue` only touch Control Plane / Mission / queue listing — never Browser.

## Claim & rebuild on restart

| Step | Where |
|------|--------|
| Claim next job | `claimNextJob` / `POST /api/agent/runtime/jobs/claim` |
| Orphan reclaim | `reclaimOrphanedAgentJobs` / `POST /api/agent/runtime/jobs/reclaim` |
| Loop | `WorkerLoop` (`server/agent-worker/workerLoop.ts`) |
| Local worker | `npm run agent:worker` |
| Remote agent | `npm run automation-agent` (HTTP JobQueuePort) |

On agent restart:

1. Reclaim stale `claimed|running` jobs for this worker (or requeue orphans).  
2. Rebuild in-process slot/browser pools.  
3. Resume polling — **no** durable in-memory schedule required beyond claimed job set in DB.

## CMS due enqueue (not Local Scheduler)

`server/agent/agentScheduler.ts` ticks on Control Plane host:

- due scans  
- due missions  
- `enqueueDueSocialPublishJobs`

This feeds Production Queue; agents consume it.

## Non-goals

- New Queue module  
- New Scheduler module  
- Telegram-owned timers for publish  
- RAM-only calendars as source of truth  

## Verdict

Local scheduling is **WorkerLoop + claim/reclaim + pools**.  
Telegram Control Plane documents and uses this path; it does not replace it.
