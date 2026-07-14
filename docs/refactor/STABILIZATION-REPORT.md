# Stabilization Report

**Date:** 2026-07-14 (R0 Closure)  
**Branch:** `feature/refactor`  
**Baseline commit (pre-closure work):** `72d9eb6`

## Final recommendation

### NOT READY FOR REFACTOR

`npm run test:agent-regression` is **green (22/22)**, stale jobs recovered, prisma generate/build clean when worker stopped, `deploy:safe` no longer calls `db push`.

Still **blocking READY**:

1. **10-job Facebook tab/memory series not completed** (`R0-MEMORY-STRESS.md`)
2. **Part 17 live smoke incomplete** (`R0-SMOKE-TEST.md`)
3. `test:agent-api` passed in **offline contract mode** (no `TEST_EMAIL`/`TEST_PASSWORD`) — live HTTP smoke not locked

---

## R0 Closure

### Cashflow classification

| Item | Detail |
|------|--------|
| Fixture | Supply listing: “Dãy trọ … nhỉnh 6 tỷ … Dòng tiền sẵn” |
| Expected (correct) | `seller` / supply / sell / chào bán |
| Engine before | `landlord` / `lease_out` — falsely triggered by `dãy trọ` |
| Fix | **Engine** in `subjectDirection.ts`: sale asking (`nhỉnh X tỷ`) wins over “boarding house ⇒ landlord” |
| Tests | Symmetric demand/supply/broker cashflow cases added; structured+classification+analyzer PASS |

### Stale AgentJobs

| Job | claimedBy | Age | Action |
|-----|-----------|-----|--------|
| `cmrixpcwb…` | worker-25776 | ~18h | **failed** (stale) |
| `cmriyonw0…` | worker-26548 | ~18h | **failed** (stale) |
| `cmrjxxoeu…` | worker-27596 | ~88m | **failed** (stale) |

Tool: `npm run agent:recover-stale-jobs` (dry-run default). After apply: `runningJobs=0` (later restart races rechecked).

### Prisma / build

| Step | Result |
|------|--------|
| Root cause | Worker/API Node held `query_engine-windows.dll.node` |
| Fix | Stop worker (and leftover tsx) → `prisma generate` **PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS after unlock |

### Deploy safety

| Item | Result |
|------|--------|
| `deploy:safe` | → `scripts/deploy-safe.ps1` only |
| Remote | `tmp-vps-safe-deploy.sh` migrate deploy; no db push |
| `deploy.ps1` | DEPRECATED — refuses to run |
| `npm run test:deploy-safety` | **10/10 PASS** |

### 10-job / Chrome

Snapshot only: Chrome ≈10.2 GB; dual Chrome (user + CDP). **Not Agent-only.** Full 10-job reuse metrics **not captured** → blocker.

### Smoke / tenant

| Item | Result |
|------|--------|
| Part 17 | Incomplete — see `R0-SMOKE-TEST.md` |
| Tenant isolation | `npm run test:agent-tenant-isolation` **PASS** |

### Regression

```
22/22 PASS — npm run test:agent-regression
```

Includes structured-data, classification, tenant isolation, deploy-safety.

### Env flags

Wired with production-safe defaults (unset ⇒ enabled):

- `AGENT_ENABLED` gates agent admin routes + scheduler/outbox
- `FACEBOOK_GRAPH_LEGACY_ENABLED` gates Graph webhook + admin routes

### Dual normalizer / FacebookPanel

Deferred to R1 / later cleanup — not merged/deleted in R0.

---

## Prior sections (audit artifacts)

See also: `BASELINE.md`, inventories, `DEAD-CODE-CANDIDATES.md`, `REFACTOR-PLAN.md`, `R0-CLOSURE-BASELINE.md`.

## Path to READY

1. Run `npm run agent:stress-10jobs -- --run --source-id=<fb>` with worker up; fill table job1/5/10/idle.  
2. Complete Part 17 live checklist; set `TEST_EMAIL`/`TEST_PASSWORD` and re-run `test:agent-api` live.  
3. Confirm `runningJobs` stable (no new stale).  
4. Re-assert `test:agent-regression` green.  
5. Then flip verdict to **READY FOR REFACTOR**.
