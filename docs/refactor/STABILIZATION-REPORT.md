# Stabilization Report

**Date:** 2026-07-14 (R0 Final Verification)

**Branch:** `feature/refactor`

**Baseline commit (pre-closure work):** `72d9eb6`

**Gate close commit:** see `chore(refactor): close R0 stabilization gate`

## Final recommendation

### READY FOR REFACTOR

All R0 gate conditions met after final verification (runtime, smoke, 10-job tab stability, regression, lint/build, deploy safety, tenant isolation).

---

## Shell errors (mid-session clarification)

Các lỗi shell giữa phiên là lỗi thao tác tạm thời do probe timeout và process được dừng có chủ đích để giải phóng Prisma engine. Sau đó cleanup, prisma generate, build, regression và restart runtime đã hoàn tất. Chúng không phản ánh trạng thái cuối.

---

## Runtime state after restart

See `R0-FINAL-RUNTIME-STATE.md`.

| Item | Result |
|------|--------|
| CMS / API health | **success**, home 200 |
| Worker | `worker-LinhMSC-1776` (PID 1776), BrowserSession **ready**, CDP `:9222` |
| Heartbeat | fresh |
| Outbox | pending **0**, failed **0** |
| Prisma generate + full build | **PASS** after brief stop of Node holding the engine DLL; runtime restarted |

## Stale jobs result

`npm run agent:recover-stale-jobs` dry-run: **stale=0**, **running=0**. No apply required after final drain.

Earlier recovered (historical): three long-stale `running` jobs failed via recover tool — see prior R0 Closure notes.

## Smoke job result

See `R0-FINAL-SMOKE.md`. **PASS** — reused scan tab, `workerOwnedScanPages=1`, `stopReason=known_post_streak`, outbox clean.

## 10-job tab stability

See `R0-MEMORY-STRESS.md`. **PASS** — jobs 1–10 all `browserPageMode=reused`; context pages flat at 10; contexts=1; no recreate-after-crash.

## Memory before / 1 / 5 / 10 / idle

| Checkpoint | Worker RSS MB | Chrome RSS MB |
|------------|---------------|---------------|
| before | 364 | 11746 |
| after 1 | 434 | 12206 |
| after 5 | 661 | 11057 |
| after 10 | 845 | 11281 |
| idle 10m | 854 | 11063 |

Node plateau after idle; Chrome fell (user+CDP attribution). No unexplained Agent tab leak.

## Regression final

```
npm run test:agent-regression
ran: 22/22 PASS
```

Suites include structured-data, classification, lead-intelligence-resolver, tenant isolation, deploy-safety, sync outbox, scheduler, etc. Duration ≈ 35–40s wall for the harness batch.

Also: `npm run lint` PASS; `npm run build` PASS (after unlock); `git diff --check` clean on committed docs after whitespace trim.

## Deploy safety

`npm run test:deploy-safety` **PASS** (10/10).

Verified intents: `deploy:safe` → `scripts/deploy-safe.ps1`; no `db push` / `--accept-data-loss`; migrate before restart; backup/preflight; health-fail rollback path. **No production deploy in R0.**

## Tenant isolation

`npm run test:agent-tenant-isolation` **PASS** — company A cannot read/dismiss/promote B findings; no cross-tenant inventory or ingestion credential write.

## Remaining risks (not R0 blockers)

| Risk | Note |
|------|------|
| Chrome total RSS high | Dominated by user tabs + CDP; watch worker-owned pages in R3 |
| Worker Node RSS climb during batch | Plateaus after idle; instrument handles/listeners in R3 |
| Prisma EPERM on Windows | Stop worker/API briefly before `prisma generate` / full build |
| Dual contentNormalizer / FE resolver | Deferred to **R1** — see `R1-KICKOFF.md` |
| Live `test:agent-api` without TEST_EMAIL | Offline contract mode still green in regression; optional live HTTP later |

---

## R0 Closure history (engine / deploy / env)

### Cashflow classification

| Item | Detail |
|------|--------|
| Fixture | Supply listing: “Dãy trọ … nhỉnh 6 tỷ … Dòng tiền sẵn” |
| Engine fix | `subjectDirection.ts`: sale asking wins over boarding-house ⇒ landlord |
| Tests | Symmetric demand/supply/broker cases PASS |

### Deploy safety migration

| Item | Result |
|------|--------|
| `deploy:safe` | → `scripts/deploy-safe.ps1` only |
| `deploy.ps1` | DEPRECATED — refuses |

### Env flags

Unset ⇒ enabled: `AGENT_ENABLED`, `FACEBOOK_GRAPH_LEGACY_ENABLED`.

---

## Prior audit artifacts

See: `BASELINE.md`, inventories, `DEAD-CODE-CANDIDATES.md`, `REFACTOR-PLAN.md`, `R0-CLOSURE-BASELINE.md`, `TARGET-ARCHITECTURE.md`.
