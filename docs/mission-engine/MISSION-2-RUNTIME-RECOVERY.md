# Mission 2.0 — Runtime Recovery After Prisma Regeneration

**Date:** 2026-07-15  
**Branch:** `feature/mission-workflow-engine`  
**Final check:** 2026-07-15 ~09:10 UTC+7

## Statement (trạng thái cuối)

**Các process cũ được dừng có chủ đích để regenerate Prisma và build. Instance mới đã được khởi động thành công: CMS PID 31712, home 200; worker PID 5916, worker-LinhMSC-28556, tiếp tục claim và complete job. Các cảnh báo task nền trước đó không phản ánh trạng thái cuối.**

Hai task nền cũ (`npm run dev`, `agent:worker`) bị kill **có chủ đích** trong lúc `prisma generate` / `npm run build` (EPERM khi worker giữ query engine). Đây **không phải** lỗi ứng dụng.

---

## 1. CMS health

| Check | Result |
|-------|--------|
| Process | PID **31712** (`npm run dev`) — alive |
| Home `http://localhost:3000/` | **200** |
| Admin `http://localhost:3000/admin` | **200** |
| Scheduler | Enabled — tick 60s; `skippedDup` khi source đã có active scan job |

## 2. Agent worker

| Check | Result |
|-------|--------|
| Process | PID **5916** — alive |
| workerId | **`worker-LinhMSC-28556`** |
| Mode | managed / headless |
| Heartbeat | BrowserSession **ready**, heartbeat ~20–30s |
| Claim loop | Active — claim → running → completed liên tục |

## 3. Browser session

| Check | Result |
|-------|--------|
| Active session | `cmrlubcal00002avnr9c4qn33` status **ready** |
| Worker | `worker-LinhMSC-28556` |
| URL | Facebook group feed (reuse) |
| Offline leftovers | Session worker cũ `-32784` offline sau regen |

## 4. Jobs (ổn định sau orphan recovery)

| Check | Result |
|-------|--------|
| Stale by age (>20m) | **0** |
| Orphan (dead worker claim) | **1 recovered** → `failed` (`cmrlu7cpl003pzzcmow050cka`, worker `-32784`) |
| Active duplicate per source | **0** |
| Recent lifecycle (30m) | 8+ completed, 1 failed (orphan), queue drain bình thường |
| Worker hiện tại | Claim job mới bằng `-28556`, không kẹt |

Scripts:

- `npx tsx scripts/mission-runtime-check.ts`
- `npx tsx scripts/inspect-enqueued-jobs.ts`
- `npx tsx scripts/recover-orphan-agent-jobs.ts [--apply]`
- `npx tsx scripts/recover-stale-agent-jobs.ts [--apply]` (stale age + orphan report)

## 5. Scheduler

- Source scheduler: enqueue due sources; **skipDup** khi `hasActiveScanJob`.
- Mission scheduler: `enqueueDueScheduledMissions` — không duplicate open MissionRun.
- Mission settlement: `settleOpenMissionRuns` trên mỗi tick (đóng run khi jobs xong, không còn step pending).

## 6. Prisma

| Check | Result |
|-------|--------|
| `migrate status` | Database schema is up to date |
| Client generate | Success sau intentional stop |
| Models | `AgentMissionRun`, `AgentWorkflowStepRun`, `AgentMissionSource` queryable |

## 7. Outbox / sync

| Check | Result |
|-------|--------|
| Outbox synced | ~1053+ |
| Pending / failed / dead_letter | **0** (không bất thường) |
| Provenance | Sync enqueue gắn `missionId` / `missionRunId` / `pipelineVersion` / `jobId` khi có |

## 8. Mission engine

| Check | Result |
|-------|--------|
| MissionRuns completed | 3+ (fixture smoke) |
| StepRuns | 44 (25 completed, 19 skipped) |
| Open MissionRuns | **0** |
| Smoke gates | `smoke-mission-pipelines.ts` **PASS** (Buyer Finding, Brand 0 Finding, legacy path, idempotent retry) |

## 9. Known non-blockers (local)

- AI keys invalid → fallback analysis; engine vẫn chạy
- `properties`/`listings` tables missing → matching query errors trong log (local DB)
- EPERM prisma generate khi worker giữ engine → fix bằng intentional stop

## 10. Ops note — không restart trừ blocker

Trong phiên này **không** restart lại CMS/worker. Orphan job được xử lý qua script DB (`recover-orphan-agent-jobs --apply`) mà không cần kill process.
