# R1 Report — Shared Lead Intelligence Domain

**Date:** 2026-07-14  
**Branch:** `feature/refactor`  
**Baseline commit:** `789c5a1`  
**Recommendation:** **R1 COMPLETE — READY FOR R2**

## 1. Baseline commit

`789c5a1` — R0 gate. See `R1-BASELINE.md`. Pre-change: regression 22/22, lint/build PASS.

## 2. Duplicate types before

FE `FindingLike` / `ResolvedLeadIntelligence`; BE `LeadClassification` enums; API `AgentFinding`; dual normalizers; each consumer re-resolved via `src/utils/resolveLeadIntelligence` (also imported by server). See `R1-TYPE-INVENTORY.md`.

## 3. Canonical types new

`shared/agent-domain/`:

- `leadIntelligence.ts` — classification / intent / actor enums + guards  
- `leadIntelligenceScore.ts` — score/analysis status  
- `leadIntelligenceContact.ts` — `LeadPhone`, `resolvePrimaryPhone`  
- `leadIntelligenceMoney.ts` — VND string DTO helpers  
- `leadIntelligenceLocation|Property|Source|Lifecycle.ts`  
- `leadIntelligenceDTO.ts` — list/detail DTOs  
- `validateLeadIntelligence.ts` — lightweight guards (no Zod)  
- `resolveLeadIntelligence.ts` — pure resolver  
- `index.ts` — public exports  

`LeadIntelligence` ≡ `ResolvedLeadIntelligence` (alias).

## 4. Resolver architecture

- **Pure:** `resolveLeadIntelligence` / `resolveLeadIntelligenceFromSources` — plain objects only.  
- **Server:** `agentDb.enrichFindingForApi` loads row → pure resolver → attaches `intelligence` (+ legacy `resolved`) and `intelligenceSummary` list DTO.  
- **Shim:** `src/utils/resolveLeadIntelligence.ts` re-exports shared (deprecated path).

## 5. Field precedence

Unchanged behavior: Prisma columns → structured extractedData → legacy extractedData → ScannedContent → null. Never map `finding.score` → `finalScore`.

## 6. Legacy fallbacks

Covered by existing resolver + new `resolvePrimaryPhone` flags (`legacy_primary_phone_object`, `legacy_phone_object`). Golden tests for score=100 / null classification.

## 7. Consistency flags

Existing `consistencyWarnings` / `dataInconsistent` retained on canonical object.

## 8. DTO list/detail

- List: `intelligenceSummary` / `toLeadIntelligenceListDTO` — no full original content.  
- Detail: full `intelligence` object (= resolved).  
- Top-level legacy API fields kept for compatibility.

## 9. Frontend migration

`AgentFindings` uses `intelligenceOf(finding)` → `finding.intelligence || finding.resolved || resolveLeadIntelligence(finding)`. Cards do not re-interpret raw extracted paths for score/class/phone. Detail drawer still reads `extractedData` for diagnostics/matching evidence tabs (noted residual).

## 10. Server consumer migration

Promote, external inventory, matching, structured data, telegram notifier/formatter import `shared/agent-domain`.

## 11. Normalizer decision

Keep both; aliases + docs. See `R1-NORMALIZER-DECISION.md`. No hash change.

## 12. Golden fixtures

`scripts/test-lead-intelligence-domain.ts` — buyer, seller, broker, renter, investor, legacy score, phone object, money BigInt, DTO list/detail.

## 13. Compatibility results

Consumer unit tests + full regression **23/23 PASS** (suite +1 domain). Tenant isolation PASS. Deploy safety PASS.

## 14. Performance

Pure resolve only (no extra DB). List DTO excludes full content. No microbench regression observed in regression wall time (~34s similar to baseline).

## 15. Deprecated symbols

See `R1-DEPRECATIONS.md`.

## 16. Files changed (summary)

- `shared/agent-domain/**` (new)  
- `src/utils/resolveLeadIntelligence.ts` (shim)  
- `server/agent/leadIntelligence.ts` (enums from shared)  
- `server/agent/agentDb.ts` (`intelligence` fields)  
- FE AgentFindings / AgentExternalInventory / agentPlatform types  
- consumer import retargets  
- normalizer aliases  
- tests + docs  

## 17. Commits

See git log on `feature/refactor` after R1 close (split per plan where practical).

## 18. Test results

| Command | Result |
|---------|--------|
| `test:lead-intelligence-domain` | PASS |
| `test:agent-regression` | **23/23 PASS** |
| `test:agent-tenant-isolation` | PASS |
| `lint` | PASS |
| `build` | PASS (Prisma unlock as needed) |
| `git diff --check` | PASS |

## 19. Remaining callers / duplication

- Detail drawer still peeks `extractedData` for diagnostics/matching/domain tabs.  
- Shim `src/utils/resolveLeadIntelligence` until scripts fully migrated.  
- FE status enum still a subset of BE lifecycle strings.

## 20. Recommendation

### R1 COMPLETE — READY FOR R2

No Prisma migration. No browser/sync/CRM business rule changes. R2 kickoff only: `R2-KICKOFF.md`.
