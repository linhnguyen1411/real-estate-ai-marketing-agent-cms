# R1 Deprecations

| Symbol | Old path | Replacement | Remaining callers | Earliest removal |
|--------|----------|-------------|-------------------|------------------|
| `src/utils/resolveLeadIntelligence` (module) | `src/utils/resolveLeadIntelligence.ts` | `shared/agent-domain` / `@/shared/agent-domain` | scripts, any missed imports | R7 after grep=0 |
| `resolved` on Finding API | `enrichFindingForApi` | `intelligence` (same object) | FE may still read `resolved` | R7 |
| `LeadClassification` name | `server/agent/leadIntelligence.ts` | `LeadIntelligenceClassification` | many BE files via re-export | R2/R7 |
| `normalizeLeadContent` name | dedup normalizer | `normalizeContentForDedup` | dedup service | R3+ |
| `normalizeText` name | worker normalizer | `normalizeTextForMatching` | scrape pipeline | R3+ |
| FE `AgentFindingStatus` subset | `src/types/agentPlatform.ts` | Align with BE lifecycle strings | FE filters | R2/R8 |

## Removal gates

Only delete when:

1. `rg` / import graph shows **0** callers  
2. `npm run test:agent-regression` PASS  
3. Documented in this table as removed
