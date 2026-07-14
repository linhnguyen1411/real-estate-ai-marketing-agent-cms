# R0 Smoke Test (Part 17)

**Date:** 2026-07-14

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Website/CMS local | **partial** | API/worker restarted mid-closure; not fully re-verified UI |
| 2 | Agent dashboard | **not verified** | Needs login |
| 3 | Worker connected | **partial** | Session row existed; worker was restarted |
| 4 | Scan one source | **not run** | Avoid bulk; deferred |
| 5 | ScannedContent | **data exists historically** | Not new scan this pass |
| 6 | Finding | **data exists historically** | |
| 7 | Sync VPS | **outbox pending=0** | Not forced one-event |
| 8 | Telegram | **skipped** | No forced send |
| 9 | Finding → InvestorLead | **covered by unit regression** | Live UI not run |
| 10 | Supply → External Inventory | **unit regression PASS** | Live UI not run |
| 11 | No duplicate | **not live-checked** | |
| 12 | Page count stable | **not proven** | See R0-MEMORY-STRESS |
| 13 | Outbox backlog | **pending=0 failed=0** | diagnose |
| 14 | No new stale running | **recover applied earlier** | monitor after restart |

## Verdict

**Part 17 incomplete** → blocks READY FOR REFACTOR per closure rules.
