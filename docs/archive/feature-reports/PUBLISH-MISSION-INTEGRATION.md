# Publish Mission Integration (Phase C2)

**Date:** 2026-07-16  
**Scope:** Route all publish execution through Mission Engine without changing API, scanner, or browser runtime.

## Unified Flow

`Draft`  
→ `SocialPublishJob`  
→ `startPublishMissionRun()`  
→ `MissionRun`  
→ `AgentJob (publish_social, missionRunId required)`  
→ `executePublishWorkflow()`  
→ `BrowserDestinationAdapter`

## Code Changes

- Scheduler/queue path now creates mission runs for publish jobs:
  - `server/modules/social-publishing/jobService.ts`
  - `enqueueAgentJobForPublishJob()` now delegates to `startPublishMissionRun()`
- Immediate publish path (`publishNow` / due-now schedule) now starts mission run directly:
  - `server/modules/social-publishing/draftService.ts`
- Worker publish handler no longer publishes directly via `SocialPublisher` hot path:
  - `server/modules/social-publishing/worker/publishSocialHandler.ts`
  - Handler now:
    - claims job + safety checks
    - executes `executePublishWorkflow()`
    - finalizes publish status via existing job lifecycle services

## What Was Removed from Hot Path

Removed execution path:

`SocialPublishJob` → `SocialPublisher`

Replaced by:

`SocialPublishJob` → `MissionRun` → `AgentJob` → `executePublishWorkflow`

## Compatibility

- No API contract change.
- No scanner path change.
- No browser runtime change.
- No DOM/Playwright implementation added.
- Existing status/attempt timeline remains available through existing tables/services.

## Verification

- [x] Publish creates MissionRun (`startPublishMissionRun` is scheduler/API enqueue path)
- [x] AgentJob contains missionRunId (`scripts/test-social-publishing.ts` assertion `P7. AgentJob has missionRunId`)
- [x] Timeline remains populated (status + attempt lifecycle still written by `jobService` + `attemptService` in worker flow)
- [x] Existing mission tests pass (`npm run test:mission-engine`)
- [x] Publishing tests pass (`npm run test:social-publishing`)
- [x] Lint passes (`npm run lint`)
- [ ] Build passes when environment allows

### Build Note

`npm run build` is currently blocked by local environment lock on Prisma engine DLL:

`EPERM: operation not permitted, rename ...query_engine-windows.dll.node`
