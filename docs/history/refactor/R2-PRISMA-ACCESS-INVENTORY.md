# R2 Prisma Access Inventory

**Date:** 2026-07-14  
**Baseline:** `38ed959`

## Route layer

| Path | Direct Prisma? | Notes |
|------|----------------|-------|
| `server/agent/agentRoutes.ts` | No | Services + `agentDb` |
| `server/investorLeadRoutes.ts` | No | Lead services |
| `server/agentIngest/ingestRoutes.ts` | **Yes** | Credential CRUD + health raw; ingest body → service |

## Hotspots (priority for R2)

| Path | Models | Tenant | Tx | Risk | Target |
|------|--------|--------|----|------|--------|
| `findingPromotionService.ts` | Finding, Lead, LeadSource/Score/Event/Tag | Finding scoped; Lead **global** | No | Partial write; cross-tenant lead merge by phone | FindingRepo + InvestorLeadRepo + findingTransitionService |
| `externalInventoryService.ts` | Finding, ExternalInventory* | Company scoped | No | Partial write | ExternalInventoryRepo + transition |
| `externalToOfficialService.ts` | ExternalInventory + CMS Customer | Item scoped | No | Partial / CMS outside Prisma | Inventory transition + Customer adapter |
| `investorLeadConversionService.ts` | Lead + CMS Customer | Lead unscoped | No | Partial | investorLeadTransitionService |
| `ingestService.ts` | Source, Content, Finding, IngestionEvent | Credential companyId | No | Partial upsert chain | IngestionRepo + atomic service |
| Worker `contentRepository` + enqueue | ScannedContent, Outbox | companyId | Split | Orphan content without outbox | localPersistenceService |
| Worker `findingRuleEngine` + enqueue | Finding, Outbox | companyId | Split | Same | localPersistenceService |
| `agentDb.ts` | Sources/Missions/Jobs/Findings/Notifications/Content | List scoped; getById unscoped | Only forceDelete | Fat DA layer | Split repos; keep thin helpers |
| `jobClaimer.ts` | AgentJob | Unscoped claim pool | Yes SKIP LOCKED | Keep semantics | agentJobRepository |
| `agentSync/enqueue.ts` | Outbox | companyId on payload | Yes for insert | Good pattern; join caller tx | agentOutboxRepository |
| `outboxService.ts` | Outbox + entity syncStatus | Mixed | Network then DB | Keep HTTP **out** of tx | unchanged worker |
| `entityTransitionService.ts` | Finding | Caller | Tx-ready | Callers rarely pass outer tx | Use inside transitions |
| `entityDedupService.ts` | Lead/Inventory/Idempotency | Inventory scoped; Lead not | No | Cross-tenant lead | Accept as R2 constraint (no schema) |
| `entityAuditService.ts` | LeadEvent / ExtEvent / Notification | optional companyId | No | Orphan audit | Pass tx client |
| `ingestRoutes` credentials | AgentApiCredential | Owner/company | No | Route Prisma | Credential service + repo |
| `telegramNotificationService.ts` | DeliveryLog, Finding | companyId | No | Network | After commit only |

## Already transactional (keep)

- `agentJobService.enqueueMissionRun`
- `agentScheduler` advisory lock + jobs
- `jobClaimer.claimNextJob`
- `agentDb.forceDeleteAgentSource`
- `agentSync/enqueue` outbox insert (check-before-create)

## Suggested repository map

```
server/repositories/shared/{repositoryTypes,transactionContext}.ts
server/repositories/agent/{agentFinding,scannedContent,agentJob,agentSource,agentNotification,agentOutbox,agentIngestion}Repository.ts
server/repositories/crm/{investorLead,crmCustomer}Repository.ts
server/repositories/inventory/{externalInventory,officialInventory}Repository.ts
```

Do not invent generic BaseRepository CRUD.
