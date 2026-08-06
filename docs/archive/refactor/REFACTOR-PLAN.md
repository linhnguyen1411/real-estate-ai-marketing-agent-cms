# Refactor Plan

**R1 not started in this task.**

| Phase | Goal | Risk | Done when |
|-------|------|------|-----------|
| **R0** | Baseline, docs, scripts, safe cleanup | low | This report |
| **R1** | Shared domain types/resolver/normalizers | med | Single import path |
| **R2** | Repo/transaction boundaries | med | No ad-hoc Prisma in routes |
| **R3** | Worker/browser lifecycle hardening | high | Stable tabs after 50 jobs |
| **R4** | Analysis pipeline separation | med | Clear stages |
| **R5** | Sync/ingest consolidation | high | Envelope V1 stable |
| **R6** | CRM/inventory lifecycle | high | No duplicate leads/inventory |
| **R7** | API cleanup (deprecate first) | med | Catalog clean |
| **R8** | Frontend state/query | med | Leaner agent UI data |
| **R9** | Performance / budgets | med | Budgets met |
| **R10** | Production rollout | critical | Verification checklist green |

Each later phase needs: modules list, deps, API impact, rollback, tests, blast radius (expand when entering phase).
