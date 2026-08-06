# Mission 2.0 — Implementation Report

**Branch:** `feature/mission-workflow-engine`  
**Updated:** 2026-07-16 (dual-host production verification)

## Verdict: **MISSION 2.0 COMPLETE**

Dual-host Local PC → HTTPS/HMAC → remote VPS proven (session `m2dh_1784165884719`): Buyer Finding, Supply External Inventory, Brand **0 Finding**, provenance continue, network idempotency.

Details: `MISSION-2-DUAL-HOST-VERIFICATION.md`, `MISSION-2-DUAL-HOST-PREFLIGHT.md`.

---

## 1. Runtime final status

**Các process cũ được dừng có chủ đích để regenerate Prisma và build. Instance mới đã được khởi động thành công: CMS PID 31712, home 200; worker PID 5916, worker-LinhMSC-28556, tiếp tục claim và complete job. Các cảnh báo task nền trước đó không phản ánh trạng thái cuối.**

| Component | Value |
|-----------|-------|
| Branch | `feature/mission-workflow-engine` |
| Local CMS | PID **31712** — home **200** (not restarted for VPS deploy) |
| Local Worker | PID **5916**, `worker-LinhMSC-28556` |
| VPS PM2 | `real-estate-ai-cms` PID **1240500**, online |
| VPS migration | `20260715150000_mission_workflow_engine` applied |
| Dual-host Buyer Finding | `cmrmuc80x003mle0hig5nygka` |
| Dual-host Supply Inventory | `cmrmucbpi004fle0hrcsajr20` |
| Dual-host Brand Findings | **0** |
| stale / orphan / outbox pending | **0** |
| `test:mission-engine` | 12/12 PASS |
| `test:mission-provenance-e2e` | 10/10 PASS |

## 2. Provenance E2E (Local → VPS path)

Flow proven in-process (same DB simulates local enqueue → HMAC ingest → VPS continuation):

1. Envelope `scanned_content_upsert` carries `missionId`, `missionRunId`, `pipelineVersion`, `pipelineHash`, `missionVersion`, `jobId`, `completedLocalSteps`, `missionWorkflow.pipelineSnapshot`.
2. `ingestEventEnvelope` maps provenance (previously dropped).
3. `continueMissionWorkflow` upserts content, `ensureMissionRunFromProvenance`, syncs completed local steps, runs `executeContentWorkflow({ runtimeTarget: 'vps' })`.
4. Retry same idempotency key → `duplicate`; no resource explosion.
5. Missing mission → warning `mission_workflow_continue_failed` (safe).
6. Secrets/cookies stripped via `sanitizeSourceConfig`.

Files: `server/agentSync/enqueue.ts`, `missionProvenance.ts`, `server/agentIngest/ingestService.ts`, `missionProvenanceIngest.ts`.

## 3. Execution ownership

| Step class | Target |
|------------|--------|
| collect / local spam gate | `local_worker` / `either` |
| extract, classify, enrich, finding, inventory, match, notify | `vps` |

`executeContentWorkflow` filters by `runtimeTarget` (`shouldExecuteStepOnRuntime`). MVP: ingest continues on VPS only; local worker skips pure-vps steps when `MISSION_WORKFLOW_RUNTIME=local_worker`.

## 4. Buyer Hunter

E2E fixture Finding created with `missionId` + `missionRunId` + classification `buyer`.  
Timeline: spam → extract → classify → enrich → finding → …

## 5. Supply Hunter

External Inventory candidate created; **no Buyer Finding** on supply MissionRun.

## 6. Brand Monitoring gate

**Finding count = 0**, Inventory = 0. Pipeline has no `create_lead_intelligence`. Regression covered in provenance E2E.

## 7. Idempotency

Key: `missionRunId:contentKey:stepId:v{pipelineVersion}`.  
Retry workflow: step count stable. Duplicate ingest: status duplicate, findings ≤ 1.

## 8. Recovery

`recoverStaleMissionRuns` dry-run: 0 stale on healthy steps.  
Scripts: `mission:recover-stale-runs`, `mission:recover-orphan-jobs`.

## 9. Timeline API / UI

API:

- `GET /api/agent/mission-runs/:runId` → detail + metrics + stepSummary
- `GET /api/agent/mission-runs/:runId/steps`
- `POST .../retry-failed`, `POST .../cancel`

UI (`MissionsPage`): View runs drawer, step timeline badges, retry/cancel, scheduler fields on list.

## 10. Scheduler UX

Mission list shows: schedule cadence, lastRunAt, nextRunAt, lastRunStatus, runningCount, sourceCount, pipelineStepCount, skip reason (`paused` / not active).  
Actions: Run now, Pause/Activate, View runs.  
`computeNextRunAt` exported + tested (every_4h → +4h).

## 11. Metrics

MissionRun.metrics merged from step handlers (stepsCompleted/Skipped/Failed, findingsCreated, …). Detail API returns live counts + durationMs.

## 12. Compatibility

Legacy `processFindingForContent` without Mission still creates Finding. Mission payloads: Finding only via pipeline step.

## 13. Tests

| Command | Result |
|---------|--------|
| `test:mission-engine` | PASS |
| `test:mission-provenance-e2e` | **10 PASS** (Buyer, Supply, Brand, provenance, dup, missing, legacy, retry, recovery, nextRunAt) |
| Prior: smoke pipelines / ingestion / sync | still green from earlier session |

## 14. Commits (this phase)

Expect:

1. `refactor(sync): preserve mission workflow provenance`
2. `test(missions): add Buyer Supply and Monitoring E2E`
3. `feat(missions): expose run timeline APIs and scheduler UX`
4. `feat(ui): add Mission run timeline and actions`
5. `docs(missions): close Mission 2.0 implementation report`

## 15. Limitations

- Offline VPS outage simulation skipped (production kept online).
- Telegram delivery audit table missing on VPS; buyer telegram StepRun completed, brand skipped.
- Timeline UI browser QA not screenshot-captured (API/DB timelines confirmed).
- AI keys invalid locally → fallback analysis.
- Finding uniqueness still per content+type (not per Mission).

## 16. Verdict

**MISSION 2.0 COMPLETE** — dual-host Local→VPS provenance, Buyer Finding, Supply Inventory, Brand 0 Finding, HMAC security, and network idempotency verified.
