# R1 Kickoff — Shared Agent Domain Types and Resolver Consolidation

**Status:** Planned only — **no R1 code in this task.**
**Prerequisite:** R0 gate **READY FOR REFACTOR** (see `STABILIZATION-REPORT.md`).
**Branch:** continue on `feature/refactor` (or cut `feature/r1-domain-types` from gate close commit).

## Goal

- One shared Lead Intelligence schema / types used by backend analysis + API DTOs + frontend display.
- One resolver path for cards, drawers, promote, matching, inventory.
- Consolidate duplicate types/normalizers without changing business rules.
- Prefer **no DB schema change** and **no public API contract change**.
- Keep regression suite green before/after.

## Non-goals

- No Facebook selector work.
- No worker/browser lifecycle redesign (R3).
- No sync envelope rewrite (R5).
- No CRM lifecycle merge (R6).
- No feature additions.

## Files likely in scope

| Area | Paths |
|------|--------|
| Frontend resolver (move/wrap) | `src/utils/resolveLeadIntelligence.ts` |
| FE consumers | `src/components/agent/AgentFindings.tsx`, `AgentExternalInventory.tsx` |
| Backend classification / scoring | `server/agent/leadIntelligence.ts`, `leadAnalysisSchema.ts`, `findingStructuredData.ts`, `subjectDirection.ts` |
| Dual normalizers | `server/agent/dedup/contentNormalizer.ts` vs `server/agent-worker/services/contentNormalizer.ts` |
| Consumers of normalized content | `server/agent-worker/services/contentRepository.ts`, adapters, dedup services |
| Promote / match / inventory | `server/agent/findingPromotionService.ts`, `findingMatchingService.ts`, `externalInventoryService.ts` |
| Notifications formatting | `server/notifications/telegramFormatter.ts` (DTO-only touch if needed) |
| Shared home (new) | e.g. `server/agent-domain/` or `shared/agent-domain/` (decide in implementation PR) |

## Duplicate types / resolvers (inventory)

| Smell | Today | Target |
|-------|--------|--------|
| Lead display resolver | FE `resolveLeadIntelligence` | Shared module; FE imports shared or API already-resolved DTO |
| Classification enums | `leadIntelligence.ts` + scattered string unions | Single exported schema |
| Content normalize | **two** `contentNormalizer` modules (URL/page vs lead-dedupe) | Keep distinct **names**; share only truly identical helpers; document ownership |
| Structured finding shape | `findingStructuredData` + FE `FindingLike` | Align fields + precedence rules in one place |

## Dependency graph (planned)

```
agent-domain (types, resolver, normalize helpers)
    ↑
agent-api / agent services (promotion, matching, inventory)
    ↑
agent-worker (adapters write ScannedContent; do not import React)
    ↑
frontend (imports shared resolver OR consumes API DTO only)
```

Worker must not import React. Frontend must not import Prisma.

## Blast radius

| Layer | Risk |
|-------|------|
| Finding cards / drawers | Medium — visual field precedence |
| Promote / convert | Medium — wrong field ⇒ wrong CRM row |
| Matching / inventory | Medium — score/phone/location drift |
| Tests | High protection — resolver + classification + structured-data suites |

## Test gates (must pass before merge)

- `npm run test:agent-regression`
- `npm run test:lead-intelligence-resolver` (or equivalent in harness)
- `npm run test:finding-structured-data`
- `npm run test:finding-classification`
- `npm run test:agent-tenant-isolation`
- `npm run lint`
- `npm run build`
- Smoke: one Facebook scan job still completes with tab reuse (spot-check)

## Rollback plan

1. Revert R1 commit(s) on `feature/refactor`.
2. No migration expected → no DB rollback.
3. If a shared package path breaks imports, restore previous dual files from git.
4. Re-run `test:agent-regression`.

## Commit plan (implementation — future)

1. `chore(r1): add agent-domain scaffold + re-export stubs`
2. `refactor(r1): move Lead Intelligence types to shared module`
3. `refactor(r1): unify resolver precedence; keep FE/API adapters thin`
4. `refactor(r1): clarify dual contentNormalizer ownership / shared helpers`
5. `test(r1): expand resolver fixtures for precedence edge cases`
6. `docs(r1): update TARGET-ARCHITECTURE + STABILIZATION residual risks`

Do **not** start these commits until R1 implementation task begins.
