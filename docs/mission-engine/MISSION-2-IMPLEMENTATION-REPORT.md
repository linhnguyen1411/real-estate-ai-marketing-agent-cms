# Mission 2.0 — Implementation Report

**Branch:** `feature/mission-workflow-engine`  
**Updated:** 2026-07-15 (runtime recovery + smoke)

## Verdict: **MISSION 2.0 PARTIAL**

Runtime executes configurable pipelines with MissionRun/StepRun, Buyer/Brand gates proven by fixture smoke, legacy Source Run still works. UI builder/timeline and full Telegram brand summary remain incomplete → not COMPLETE.

---

## Phase checklist

| Phase | Status | Files | Tests | Next |
|-------|--------|-------|-------|------|
| A. domain/validation | **Completed** | `domain/*` | `test:mission-engine` | — |
| B. persistence | **Completed** | migration + repos | migrate deploy | — |
| C. workflow execution | **Completed** | `workflowExecutionService` | smoke pipes | — |
| D. step handlers | **Completed** | `steps/*` | smoke + domain | polish AI enrichment |
| E. ingestion/local→VPS | **Partial** | ingest gate + sync provenance | ingestion tests | end-to-end VPS verify |
| F. scheduler | **Partial** | source + mission due + settle | tick logs | mission nextRunAt UX |
| G. UI | **Partial** | MissionsPage templates/meta | — | run timeline page |
| H. tests | **Partial** | domain + smoke script | green domain/smoke | more integration |

---

## 1. Runtime recovery after Prisma regeneration

See `MISSION-2-RUNTIME-RECOVERY.md`.

**Các process cũ được dừng có chủ đích để regenerate Prisma và build. Instance mới đã được khởi động thành công: CMS PID 31712, home 200; worker PID 5916, worker-LinhMSC-28556, tiếp tục claim và complete job. Các cảnh báo task nền trước đó không phản ánh trạng thái cuối.**

## 2. CMS/worker final status (2026-07-15)

| Component | Value |
|-----------|-------|
| CMS PID | **31712** — home/admin **200** |
| Worker PID | **5916** |
| workerId | **`worker-LinhMSC-28556`** |
| BrowserSession | `cmrlubcal00002avnr9c4qn33` **ready**, heartbeat fresh |
| Stale jobs (age) | **0** |
| Orphan jobs recovered | **1** (worker `-32784` → failed, không block queue) |
| Outbox pending/failed | **0** |
| Open MissionRuns | **0** |
| Scheduler | skipDup active; mission due + settle on tick |

## 3. Source job smoke

Job `cmrlu7cpd003lzzcmjheaqk7n`: completed; Facebook scan metrics present; outbox flush OK.

## 4–5. MissionRun / StepRun persistence

Models live; indexes/uniques applied; queried in production path and fixture smoke.

## 6. Buyer pipeline runtime proof

Fixture MissionRun `cmrlu86nh000c5jx3xglwd7dx`:

Timeline: spam → extract → classify → finding(**completed**) → notify_cms(skipped score gate)

Finding ID: **`cmrlu87qx000o5jx34oglgyp6`** (buyer)

Seller content: Finding skipped (no Finding)

Retry: no duplicate StepRuns / findingsCreated=0

## 7. Brand Monitoring no-Finding proof

MissionRun `cmrlu86nj000e5jx38zfuejh3`:

spam → topic → summarize → notify_cms  
**Finding count = 0**, inventory = 0, no create_lead step

## 8. Legacy Source Run compatibility

`processFindingForContent` without MissionRun created Finding (`filterStage: created_finding`). Independent of MissionRun DB.

## 9. Local→VPS provenance

- Job payload: missionId / missionRunId / pipelineVersion / hash (Mission path)
- Ingest: missionRunId → content-only + continue workflow if no steps yet; legacy unchanged
- Sync enqueue: now includes missionId / missionRunId / pipelineVersion / jobId when available

## 10. Recovery / idempotency

- Stale agent jobs (age): **0**
- Orphan agent jobs: **1** recovered (`recover-orphan-agent-jobs --apply`) — worker cũ `-32784`
- Scheduler: `settleOpenMissionRuns` đóng MissionRun khi scan jobs xong, không step pending
- `mission:recover-stale-runs` dry-run: 0 stale steps
- Fixture retry idempotent

## 11. Tests

| Command | Result |
|---------|--------|
| `test:mission-engine` | pass (prior) |
| `smoke:mission-pipelines` | **PASS** |
| lint/build | pass (prior session); re-run after sync patch |

## 12. Remaining phases

- Mission Run timeline UI
- Richer reports dashboard
- Full VPS dual-host verify of provenance
- Brand Telegram summary send path
- Stronger integration suite beyond fixture script

## 13. Limitations

- AI keys invalid locally → keyword/fallback analysis (does not block engine)
- Finding uniqueness still per content+type (not per Mission)
- Concurrent multi-mission same source: serialize via skip active scan job

## 14. Verdict

**MISSION 2.0 PARTIAL** — runtime + gates pass; UI/reports/VPS dual verify incomplete for COMPLETE.
