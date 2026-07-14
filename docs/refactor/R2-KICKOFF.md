# R2 Kickoff — Repository and Transaction Boundaries

**Status:** Planned only — **no R2 code in this task.**  
**Prerequisite:** R1 COMPLETE (`R1-REPORT.md`).

## Goal

Push Prisma access behind repositories/services with clear transaction boundaries so routes and workers do not own ad-hoc queries/updates for Lead Intelligence lifecycle.

## Non-goals

- No Lead Intelligence type redesign (done in R1).  
- No browser/Facebook scraper changes.  
- No sync envelope redesign (R5).  
- No CRM product feature work.

## Expected scope

| Area | Intent |
|------|--------|
| Finding repository | list/get/update/status transitions |
| ScannedContent repository | create/dedupe write path |
| Consumption transactions | promote / external inventory / dismiss atomicity |
| Route thinning | `agentRoutes` → services → repos |
| Remove remaining FE `extractedData` peeks | serve diagnostics via API DTO fields |

## Test gates (future)

- `npm run test:agent-regression`  
- tenant isolation  
- promote / inventory / dismiss integration fixtures  
- no migration unless unavoidable  

## Rollback

Revert R2 commits; R1 shared domain remains.

Do **not** start R2 implementation until a dedicated R2 task begins.
