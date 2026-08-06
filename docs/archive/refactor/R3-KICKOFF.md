# R3 Kickoff — Worker / Browser Lifecycle Consolidation

**Status:** Planned only — **no R3 code in this task.**  
**Prerequisite:** R2 COMPLETE (`R2-REPORT.md`).

## Goal

Harden agent worker browser/CDP lifecycle: single scan-tab ownership, crash recovery, lease/heartbeat, adopt `localPersistenceService` for content/finding+outbox, without changing scan business rules.

## Non-goals

- No Facebook selector rewrite  
- No Lead Intelligence domain redesign (R1)  
- No repository redesign (R2)  
- No production profile wipe  

## Expected scope

| Area | Intent |
|------|--------|
| BrowserSession / CDP attach | Clear ready/offline transitions |
| Scan tab reuse metrics | Keep R0 counters; fail closed on leak |
| Job claim / stale recover | Via job repository patterns |
| Persist path | Worker → `persistScannedContentWithOutbox` / finding variant |
| Memory budgets | Align with RESOURCE-BUDGET |

## Test gates (future)

- Stress 10–50 jobs tab reuse  
- `test:agent-regression`  
- Stale job recover dry-run  
- No reconnect loops  

## Rollback

Revert R3 commits; R2 transactions remain.

Do **not** start R3 until a dedicated R3 task begins.
