# R2 Baseline

**Captured:** 2026-07-14 ~13:10 ICT  
**Branch:** `feature/refactor`  
**Commit:** `38ed959` — R1 COMPLETE (docs pin)  
**Ancestor of R0 gate:** `789c5a1`  
**R2 code before this doc:** none (untracked local R0/R1 raw logs only)

## Preconditions

| Check | Result |
|-------|--------|
| `git status` | clean code tree |
| `git diff --stat` | empty |
| `git diff --check` | clean |
| `npm run test:lead-intelligence-domain` | **PASS** (28 assertions) |
| `npm run test:agent-tenant-isolation` | **PASS** (7) |
| `npm run lint` | **PASS** |
| `npm run test:agent-regression` | **23/23 PASS** |
| `npm run build` | **PASS** after intentional CMS/worker stop (Prisma EPERM unlock), then restart — health **success** |

## Runtime / API flow baseline (behavior to preserve)

| Flow | Current owner | Tx today? | Idempotency today | Notes |
|------|---------------|-----------|-------------------|-------|
| Finding create/update | worker `findingRuleEngine`, `approveFindingService`, ingest | No outer tx | contentHash / findFirst | Enrichment after write |
| Finding → InvestorLead | `findingPromotionService.promoteFindingToLead` | **No** | `promotedLeadId` short-circuit + phone/fb/url merge | Multi-step lead+events+tags+consume |
| InvestorLead → CRM | `investorLeadConversionService` | **No** | already converted + phone merge | Mix Prisma Lead + CMS `dbHelper` customer |
| Finding → ExternalInventory | `externalInventoryService` | **No** | `externalInventoryItemId` + heuristic dupe | Partial-write risk |
| External → Official | `externalToOfficialService` | **No** | status checks | Inventory + CMS customer |
| ScannedContent + Outbox | worker contentRepository → `enqueueScannedContentSync` | Outbox insert can use tx; **content write often before** | ingestionId unique | Gap: content saved then crash before outbox |
| Finding + Outbox | findingRuleEngine → enqueue | Same pattern | syncIdempotencyKey | Same gap |
| Ingestion upsert | `ingestService` | **No** outer tx | AgentIngestionEvent key | Partial source/content/finding/event |
| Dismiss / Reviewed | `updateAgentFinding` via routes | Single update | N/A | Not always via `markFindingConsumed` |
| Bulk action | `agentDb` bulk update | Multi updateMany | Scoped where | Tenant via company scope |

## Non-goals reminder

No schema migration, no UI/browser/Telegram protocol changes, no classification changes. Network (Telegram/VPS) must stay **outside** DB transactions.

## Rollback

Revert R2 commits to `38ed959`.
