# Mission 2.0 — Implementation Report

**Branch:** `feature/mission-workflow-engine`  
**Date:** 2026-07-15  

## Verdict: **MISSION 2.0 PARTIAL**

Runtime executes configurable pipelines (MissionRun + StepRun + step handlers reusing Spam/Finding/Inventory/Telegram). UI remains list-first with template/pipeline metadata (no full drag builder / full run timeline page). End-to-end smoke with Facebook browser not fully verified in this session.

---

## 1. Current state (audit)

See `docs/mission-engine/MISSION-2-CURRENT-STATE-AUDIT.md`.

## 2. Mission semantics

Mission = durable workflow config (pipeline + sources + schedule).  
MissionRun = one execution with immutable pipeline snapshot.  
StepRun = one step per content (or job) with status/output/idempotency.

## 3–8. Domain / pipeline / execution

| Area | Location |
|------|----------|
| Types | `server/modules/mission-engine/domain/workflowTypes.ts` |
| Validation | `workflowValidation.ts` |
| Graph | `workflowGraph.ts` |
| Policies | `workflowPolicies.ts` |
| Templates | `missionTemplates.ts` |
| Run service | `application/missionRunService.ts` |
| Execution | `application/workflowExecutionService.ts` |
| Recovery | `application/workflowRecoveryService.ts` |
| Post-collect | `application/processContentAfterCollect.ts` |

## 9. Service adapters

Steps call existing Spam / `processFindingForContent` (deferred notify/match) / External Inventory / matching / notify / Telegram.

## 10–11. Idempotency & recovery

Idempotency key: `missionRunId:contentOrJob:stepId:v{version}`.  
`npm run mission:recover-stale-runs` (dry-run default; `--apply` to mutate).

## 12. Scheduler

Source scheduler unchanged. Also `enqueueDueScheduledMissions` for active missions with non-manual cadence.

## 13–14. Local→VPS / Ingest

Jobs carry `missionRunId` + pipeline hash.  
Ingest with `missionRunId` → content-only + continue workflow only if no completed steps yet. Legacy payloads unchanged.

## 15–16. UI / Templates

Missions page shows Workflow templates (v2), step count, MissionRun id on run.  
Templates: Buyer Hunter, Supply Hunter, Brand Monitoring, Content Research, Lead Watch HP.

## 17. Reports

Metrics accumulated on MissionRun.metrics from step results (no fabricated dashboard yet).

## 18. Migration

`prisma/migrations/20260715150000_mission_workflow_engine` — MissionSource, MissionRun, WorkflowStepRun, pipeline columns, backfill.

## 19. Tests

`npm run test:mission-engine` — domain validation + condition DSL + templates (pass).

## 20. Manual smoke

Not fully run (browser). Local migrate + domain tests OK.

## 21. Commits (planned)

1. docs audit  
2. domain + migration + engine + adapters + API + UI + ingest + tests + report  

## 22. Limitations

- Full run timeline UI page deferred  
- Brand Telegram summary mode skips without generic send  
- Concurrent multi-mission same source: serialize by skipping enqueue if active scan job  
- Finding still unique per content+type (not per mission)  
- AI-heavy extract/classify before finding are recorded steps; lead creation reuses full finding engine  

## 23. Verdict

**MISSION 2.0 PARTIAL** — engine executes; UI/reports/smoke incomplete for COMPLETE.
