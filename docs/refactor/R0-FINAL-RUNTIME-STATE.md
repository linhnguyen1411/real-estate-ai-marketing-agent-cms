# R0 Final Runtime State

**Captured:** 2026-07-14 ~10:47 ICT (UTC 03:42–03:47)
**Branch:** `feature/refactor`
**Commit (pre close):** `93a8025` (+ local R0 final verification changes)

## Snapshot after restart + full build

| Item | Value |
|------|-------|
| current branch | `feature/refactor` |
| current commit | `93a8025` (docs/commit pending for gate close) |
| git status (pre-commit) | modified stress harness / scan diagnostics / stress doc; new final reports |
| CMS process PID | **32960** (node child of tsx `server.ts`); wrapper **28860** |
| agent worker PID | **1776** (node child of tsx worker); wrapper **3928** / npm **13320** |
| Chrome process count | **47** |
| worker heartbeat | `worker-LinhMSC-1776`, lastHeartbeatAt fresh (~seconds) |
| BrowserSession status | **ready** (CDP `127.0.0.1:9222`) |
| active/running AgentJobs | **0** after drain (transient scheduler jobs ran post-restart) |
| pending outbox | **0** |
| failed outbox | **0** |
| Node RSS (worker 1776) | ~**363 MB** |
| Node heapUsed | n/a from OS; diagnose script process-only |
| Chrome total RSS | ~**11.7 GB** (user tabs + CDP; not Agent-only) |
| browser context count | **1** (from last job `resourceDiagnostics`) |
| browser page count | **2–11** depending on user tabs open; flat w.r.t. job count |
| worker-owned page count | **1** |
| last successful scan | multiple post-restart; e.g. source smoke reuse with `stopReason=known_post_streak` |
| last sync time | `2026-07-14T03:47:37.880Z` (`syncStatus=synced`) |

## Health / CMS

| Check | Result |
|-------|--------|
| `GET /api/health` | **success** |
| home `/` | **200** |
| scheduler | enabled, running, lastTick OK |
| Prisma EPERM | Not present after unlock → `prisma generate` + full `npm run build` **PASS**, then restart |

## Stale jobs

```
npm run agent:recover-stale-jobs  # dry-run
totals: running=0, stale=0, valid=0, unknown=0
```

No apply needed.

## Shell mid-session note

Các lỗi shell giữa phiên là lỗi thao tác tạm thời do probe timeout và process được dừng có chủ đích để giải phóng Prisma engine. Sau đó cleanup, prisma generate, build, regression và restart runtime đã hoàn tất. Chúng không phản ánh trạng thái cuối.
