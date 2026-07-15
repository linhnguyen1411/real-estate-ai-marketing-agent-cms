# Mission 2.0 — Runtime Recovery After Prisma Regeneration

**Date:** 2026-07-15  
**Branch:** `feature/mission-workflow-engine`

## Statement

CMS và worker bị dừng có chủ đích trong quá trình regenerate Prisma. Sau khi regenerate hoàn tất, cả hai process đã được khởi động lại. Các lỗi task nền giữa phiên không phản ánh trạng thái cuối.

---

## 1. CMS health

| Check | Result |
|-------|--------|
| Process | PID **31128** (`npm run dev`) — alive |
| Home `http://localhost:3000/` | **200** |
| Admin `http://localhost:3000/admin` | **200** |
| Scheduler | Enabled — ticks every 60s; skips duplicates when active scan jobs exist |

## 2. Agent worker

| Check | Result |
|-------|--------|
| Process | PID **32520** — alive |
| workerId | `worker-LinhMSC-32784` |
| Mode | managed / headless |
| Heartbeat | BrowserSession `ready`, heartbeat ~20s |
| Claim loop | Active — continuously claiming `scan_source` |

## 3. Browser session

| Check | Result |
|-------|--------|
| Active session | `cmrlsg9sm000065kmcb586k1c` status **ready** |
| Worker | `worker-LinhMSC-32784` |
| URL | Facebook group feed (reuse) |
| Offline leftovers | Prior worker sessions marked offline after regen kill |

## 4. Jobs

| Status | Notes |
|--------|-------|
| Stale from old PIDs | **3 recovered → failed** (`scripts/recover-stale-agent-jobs.ts --apply`) |
| Live smoke | Job `cmrlu7cpd003lzzcmjheaqk7n` **queued→running→completed** |
| stopReason | Present in result payload |
| Contents | 99 inserted this pass (large group); dedupe also active |

## 5. Scheduler

- Source scheduler continues due enqueue with skipDup when jobs active.
- Mission scheduler helper present (`enqueueDueScheduledMissions`).
- No evidence of duplicate MissionRun spam after restart.

## 6. Prisma

| Check | Result |
|-------|--------|
| `migrate status` | Database schema is up to date (9 migrations) |
| Client generate | Success after intentional stop |
| Models | `AgentMissionRun`, `AgentWorkflowStepRun`, `AgentMissionSource` queryable |
| db push | **Not used** |

## 7. Outbox / sync

| Check | Result |
|-------|--------|
| Outbox | ~763 synced; flushes succeeding (batched) |
| Pending backlog | Not abnormal |
| Provenance fix | Sync enqueue now attaches `missionId` / `missionRunId` / `pipelineVersion` when StepRun/Finding has them |

## 8. Mission engine live proof (pre-fixture)

Existing MissionRun `cmrlsgfs0000azzcmstil5rvj` already executed StepRuns:

- spam / extract / classify completed  
- create_lead_intelligence skipped (seller / low_score / domain_needs_review) — engine controlling outcomes  

## 9. Fixture smoke (controlled)

`npx tsx scripts/smoke-mission-pipelines.ts` → **SMOKE GATES PASS**

| Gate | Result |
|------|--------|
| Buyer Finding | `cmrlu87qx000o5jx34oglgyp6` classification=buyer |
| Seller no Finding | true |
| Brand no Finding | 0 |
| Brand no Inventory | 0 |
| Brand no lead step | true |
| Retry idempotent | step count stable |
| Legacy source path Finding | true (no MissionRun) |

## 10. Final process status (end of this check)

- After smoke/docs, build needed a **second intentional stop** (EPERM on prisma generate while worker held query engine).
- Stopped CMS PID 31128 + worker PID 32520 deliberately → `prisma generate` + `npm run build` OK → restarted.
- Post-restart status recorded in follow-up section below.

## 11. Post-build restart (final)

| Process | PID | Status |
|---------|-----|--------|
| CMS `npm run dev` | **31712** | listening :3000 |
| Agent worker | **5916** | managed/headless — claim loop |

WorkerId after restart: see worker log (`worker-LinhMSC-*`).

Home/admin should return 200. Do not treat intentional build stops as app failures.
