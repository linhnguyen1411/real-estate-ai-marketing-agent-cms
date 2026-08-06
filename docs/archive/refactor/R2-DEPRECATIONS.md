# R2 Deprecations

| Symbol / path | Replacement | Remaining callers | Earliest removal |
|---------------|-------------|-------------------|------------------|
| Direct `prisma.agentFinding.*` in promote/inventory services | `agentFindingRepository` + transition `$transaction` | Some promote internal loads still via repo; agentDb list paths | R7 |
| Fat `agentDb.ts` Prisma surface | Split repositories | Routes still use agentDb for list/CRUD | R3–R7 incremental |
| Ingest route credential Prisma | `credentialService` (scaffold) | `ingestRoutes` still embeds crypto create | R5 |
| Worker `contentRepository` direct create + post enqueue | `localPersistenceService.persistScannedContentWithOutbox` | Worker adapters | R3 |
| `findingRuleEngine` create + enqueue split | `persistFindingWithOutbox` | Worker | R3 |
| CMS Customer via `dbHelper` outside Prisma tx with Lead | Future CRM repo with `cmsRecord` on same tx | conversion / official | R6 |

Do not delete until call sites = 0 and regression green.
