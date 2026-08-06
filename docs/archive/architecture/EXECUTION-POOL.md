# Execution Pool + Browser Pool

**Date:** 2026-07-18  
**Status:** EXECUTION POOL COMPLETE  
**Commit intent:** `refactor(runtime): introduce execution pool and browser pool`

## Goal

Resolve Scan vs Publish resource contention **without** new workers, schedulers, queues, APIs, or UI.

Worker remains a process. **Execution Pool** owns slots. **Browser Pool** owns browser leases.

## Architecture

```
Scheduler (unchanged)
  → enqueue AgentJob only

Worker process (unchanged entry: npm run agent:worker)
  → claimNextJob (existing queue)
  → Execution Pool.acquire(slot)
  → Browser Pool.lease(purpose)
  → Mission / existing handlers (scan_source, publish_social, …)
  → release browser + slot
```

Execution Pool holds **no** Scan / Publish / Messaging business logic. Handlers and Mission Engine are unchanged in behavior.

## Slots

| Slot | Default max | Job types |
|------|-------------|-----------|
| `scan` | 1 | `scan_source`, `source_scan`, `visit_url` |
| `publish` | 1 | `publish_social` |
| `messaging` | 0 (disabled) | reserved |
| `comment` | 0 (disabled) | reserved |

Env overrides:

- `AGENT_SLOT_SCAN_MAX`
- `AGENT_SLOT_PUBLISH_MAX`
- `AGENT_SLOT_MESSAGING_MAX`
- `AGENT_SLOT_COMMENT_MAX`

Each slot tracks: `maxConcurrency`, `runningJobs`, waiters, `status`, `heartbeat`.

**Scan + Publish can run at the same time** (different slots).

## Browser Pool

Replaces the mental model of a singleton “busy browser” with **purpose-scoped leases**:

| Field | Meaning |
|-------|---------|
| `browserId` | Logical handle id |
| `profile` | Managed profile path |
| `purpose` | `scan` \| `publish` \| `messaging` \| `comment` |
| `state` | `idle` \| `leased` \| `stopping` \| `crashed` |
| `ownerJob` / `ownerMission` | Lease owners |
| `heartbeat` | Last tick |

Underlying connections still live in `BrowserManager` (managed + CDP, separate scan/publish tabs).  
CDP locks are **purpose-scoped** and **reentrant per job** (ALS), so scan does not block publish.

Browsers are **lease / release** only — not held forever across jobs.

## Stop / Cancel (do not stop Worker)

| Action | Effect |
|--------|--------|
| Stop Slot | `executionPool.stopSlot(kind)` — refuse new work on that slot; worker process stays up |
| Stop Job | Release slot + browser for `jobId`; requeue job |
| Stop MissionRun | `releaseMission(missionRunId)` on both pools |
| Stop Worker | Only on process shutdown (SIGINT/SIGTERM) |

## Recovery

On browser crash / worker crash / mission cancel:

1. Release browser lease(s)
2. Release slot lease(s)
3. Requeue / reclaim AgentJob via existing `jobClaimer` (`SLOT_BUSY` / `BROWSER_BUSY` / `CDP_BUSY` defer without burning attempts; orphan reclaim on boot)

## Files

| Path | Role |
|------|------|
| `server/agent-worker/runtime/executionPool.ts` | Slot acquire / stop / release |
| `server/agent-worker/runtime/browserPool.ts` | Browser lease / release |
| `server/agent-worker/runtime/jobSlotMap.ts` | Job type → slot |
| `server/agent-worker/runtime/als.ts` | Per-job runtime context |
| `server/agent-worker/workerLoop.ts` | Concurrent dispatch through pools |
| `server/agent-worker/browserManager.ts` | Purpose-scoped CDP locks |
| `scripts/test-execution-pool.ts` | Unit tests |

## Tests

```bash
npx tsx scripts/test-execution-pool.ts
```

Covered:

- Scan + Publish concurrent slots
- Stop Publish does not stop Scan
- Browser leak = 0
- Slot leak = 0
- Recovery release PASS
- Stop Job PASS

## Non-goals (unchanged)

- No new worker process
- No new scheduler
- No new queue table
- No API / UI / business-logic changes
- Mission Engine remains the workflow owner
