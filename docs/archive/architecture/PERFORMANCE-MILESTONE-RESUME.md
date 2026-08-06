# Performance Milestone — Resume Gate

**Date:** 2026-07-14  
**Frontend architecture verdict:** **FRONTEND ARCHITECTURE COMPLETE** (Batch 6)  
**Resume Performance Milestone:** **YES**

## Allowed next phase
Resume **Milestone 2** performance work with KPIs:

- F5 dashboard usable &lt; 2s
- Only necessary bootstrap APIs on load
- Load data per active menu
- Server-side pagination / filter / search / sort
- Cache / reopen menu near-instant
- No unnecessary background APIs
- Memory plateau when switching menus

## Preserve from architecture batches
- `getBootstrapData`
- `navigationCounts` (including `websiteChat` / `chatHistory`)
- `loadModuleForTab`
- `queryCache`
- Lazy route chunks for Properties / Inbox / Chat / CRM / Agent sections

## Do not regress
- F5 must not preload properties list, inbox list, chat messages, findings, CRM, jobs, or inventory.
- Chat polling must remain mode-scoped with cleanup (`useChatPolling`).
- Sidebar badges must continue to use lightweight `/api/navigation-counts`, not full list bootstrap.

## Note
Batch 6 did **not** implement Performance Milestone work — it only reopened the gate.
