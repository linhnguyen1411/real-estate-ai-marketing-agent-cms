# R2 Report — Repository and Transaction Boundaries

**Date:** 2026-07-14  
**Branch:** `feature/refactor`  
**Baseline:** `38ed959`  
**Recommendation:** **R2 COMPLETE — READY FOR R3**

## 1. Baseline

See `R2-BASELINE.md`. Pre-change: regression 23/23, lint/build PASS on `38ed959`.

## 2. Prisma access before

See `R2-PRISMA-ACCESS-INVENTORY.md`. Hotspots: promote / external inventory / ingest multi-step without `$transaction`; outbox often after content write; Lead globally shared (no companyId — schema constraint).

## 3. Repository boundaries

```
server/repositories/shared/transactionContext.ts
server/repositories/agent/{agentFinding,scannedContent,agentOutbox}Repository.ts
server/repositories/crm/investorLeadRepository.ts
server/repositories/inventory/externalInventoryRepository.ts
```

Repos take optional `DbClient` (PrismaClient | TransactionClient). Tenant-scoped finds use `companyId` (or bypass). No generic BaseRepository.

## 4. Transaction client design

`runInTransaction(fn)` + soft duration warning (>5s). Repositories call `asDb(db)`.

## 5. Tenant scope

`findFindingByIdForCompany`, bulk update scoped, content/inventory scoped lookups. Covered by `test:agent-repositories`.

## 6. Finding transitions

`promoteFindingToLead` — resolve intelligence **outside** tx; lead create/merge + source/score/event/tags + `markFindingConsumed` **inside** one `$transaction`. Idempotent retry via `promotedLeadId`.

## 7. CRM transition

InvestorLead → CRM Customer still uses `dbHelper` (cmsRecord + in-memory cache). **Not fully Prisma-atomic** in R2 — documented residual for R6. Lead event writes unchanged behaviorally.

## 8. Inventory transitions

`saveFindingToExternalInventory` wrapped in `$transaction` (item/source/event + consume). Official conversion left as residual (CMS property path).

## 9. Outbox atomicity

`server/agentSync/localPersistenceService.ts` — `persistScannedContentWithOutbox` / `persistFindingWithOutbox`. Worker adopters deferred to R3 (see deprecations).

## 10. Ingestion atomicity

`ingestFindingPayload` source+content+finding+ingestionEvent in one `$transaction`. Telegram / high-score notify **after** commit (no rollback on send fail).

## 11. Route thinning

Agent lifecycle routes already service-backed. Credential CRUD remains on ingest routes (crypto helpers); scaffold `credentialService.ts` for incremental move.

## 12. Error mapping

`server/dataLifecycle/domainErrors.ts` — EntityNotFound / TenantScope / LifecycleConflict / etc. Used by promote/inventory.

## 13. Network side effects

Telegram and VPS flush stay outside DB transactions.

## 14. Tests

| Suite | Result |
|-------|--------|
| `test:agent-repositories` | PASS |
| `test:agent-transactions` | PASS (promote, retry, tenant reject, rollback sim, inventory, outbox helper) |
| `test:agent-regression` | **25/25 PASS** |
| lint / build | PASS |

## 15. Performance

`runInTransaction` logs when >5s. No AI/network inside tx.

## 16. Deprecated direct access

See `R2-DEPRECATIONS.md`.

## 17. Files changed (summary)

Repositories, domain errors, promote/inventory/ingest transactional paths, localPersistenceService, tests, docs.

## 18. Commits

See git log after R2 close on `feature/refactor`.

## 19. Remaining direct Prisma callers

- `agentDb.ts` list/CRUD (thin gradually)
- Worker content/finding write + enqueue (adopt localPersistence in R3)
- `investorLeadConversionService` / `externalToOfficialService` (R6 CRM/CMS)
- Ingest credential routes (crypto create still inline)
- Lead model still global (no companyId — no migration in R2)

## 20. Recommendation

### R2 COMPLETE — READY FOR R3

Critical Agent lifecycle (promote, external inventory save, ingestion upsert) is transactional; tenant repo helpers and regression are green. R3 kickoff only — worker/browser lifecycle.
