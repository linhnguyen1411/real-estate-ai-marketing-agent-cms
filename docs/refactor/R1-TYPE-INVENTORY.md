# R1 Type Inventory

**Date:** 2026-07-14  
**Baseline commit:** `789c5a1`

Actions: **canonical** | **adapt** | **deprecate** | **delete later**  
Rule: do not delete until callers = 0.

| Name | Path | Purpose | Owner | Diff vs similar | Callers | Action |
|------|------|---------|-------|-----------------|---------|--------|
| `LeadClassification` / `LEAD_CLASSIFICATIONS` | `server/agent/leadIntelligence.ts` | Enum + normalize + score helpers | backend scoring | Same values FE resolver uses as strings | analyzer, structuredData, routes, scripts | **canonical → move to shared** (re-export stub here) |
| `LeadIntent` / `LEAD_INTENTS` | same | Intent enum | backend | FE uses bare string | analyzer, structuredData | **canonical → shared** |
| `ActorRole` / `ACTOR_ROLES` | same | Actor enum | backend | FE string | analyzer, structuredData | **canonical → shared** |
| local `LeadClassification` | `server/agent/extractors/propertyExtractor.ts` | Soft local union | extractor | Duplicate soft copy | propertyExtractor | **adapt** → import shared |
| `FindingLike` | `src/utils/resolveLeadIntelligence.ts` | Resolver input | FE+BE (cross-import) | Mirrors Prisma columns + nested | agentDb, structuredData, promote, FE | **adapt** → shared input type |
| `ResolvedLeadIntelligence` | same | Resolved display/lifecycle DTO | FE+BE | Closest to target canonical | API `resolved`, FE cards | **canonical base** → rename/alias `LeadIntelligence` |
| `AnalysisStatus` / `ScoreStatus` / `PersonType` | same | UI statuses | resolver | Partial overlap lifecycle | resolver, FE | **canonical → shared** |
| `AgentFinding` | `src/types/agentPlatform.ts` | FE API row type | frontend | Includes `resolved?`, money as string\|number | AgentFindings, api | **adapt** add `intelligence?`; keep legacy fields |
| `AgentFindingStatus` (FE) | same | `new\|reviewed\|promoted\|dismissed` | frontend | **Subset** of BE statuses | FE filters | **adapt** document gap; expand types optionally |
| `AgentFindingStatus` (BE) | `server/agent/agentTypes.ts` | Full lifecycle statuses | backend | Superset | agentDb, services | **canonical for lifecycle strings** |
| `StructuredFindingPatch` | `server/agent/findingStructuredData.ts` | Persist patch to columns+ed | backend | Writes shape similar to Resolved | pipeline | **adapt** emit via shared types |
| `LeadAnalysisResult` (+ contact/meta) | `server/agent/leadAnalysisSchema.ts` | AI JSON contract | analyzer | Not display DTO | leadAnalyzer | **keep** (analysis I/O ≠ domain DTO); map into resolver input |
| `SubjectDirectionResult` | `server/agent/subjectDirection.ts` | Deterministic demand/supply | backend | Orthogonal to display | analyzer, structuredData | **keep** (not display domain) |
| Extractor result types | `server/agent/extractors/*` | Phone/money/location/property | backend | Feed structuredData | pipeline | **keep**; map into shared contact/money |
| `normalizeLeadContent` / `hashNormalizedContent` | `server/agent/dedup/contentNormalizer.ts` | Lead dedupe hash | dedupe | ≠ website normalizer | findingDedupService | **clarify name** `normalizeContentForDedup` |
| `normalizeText` / URL helpers | `server/agent-worker/services/contentNormalizer.ts` | Scrape/page sanitize + hash | worker | Different purpose | website adapter, contentRepository | **clarify name** `normalizeTextForMatching` / display helpers |
| Telegram / promote / match mappers | notifications + finding*Service | Local field picks | server | Each re-resolves or peeks columns | services | **adapt** → shared resolver output |
| Scripts backfill / recalculate | `scripts/*` | Maintenance | ops | Duplicate field assumptions | CLI | **adapt** imports |

## Duplicate resolver call sites (must consolidate imports)

| Site | Today |
|------|-------|
| `src/utils/resolveLeadIntelligence.ts` | Implementation |
| `server/agent/agentDb.ts` | `enrichFindingForApi` → `resolved` |
| `server/agent/findingStructuredData.ts` | patch build |
| `server/agent/findingPromotionService.ts` | promote mapping |
| `server/agent/externalInventoryService.ts` | inventory mapping |
| `server/agent/findingMatchingService.ts` | match input |
| `server/notifications/telegramFormatter.ts` | message fields |
| `src/components/agent/AgentFindings.tsx` | cards + detail (also raw `extractedData`) |
| `src/components/agent/AgentExternalInventory.tsx` | budget format helper |
| `scripts/test-lead-intelligence-resolver.ts` | unit tests |

## Target shared module

`shared/agent-domain/` (via `@/` alias already → repo root).

Must remain free of React, PrismaClient, Express, Playwright, secrets.
