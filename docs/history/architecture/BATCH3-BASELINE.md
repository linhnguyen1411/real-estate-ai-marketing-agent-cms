# BATCH 3 BASELINE

**Date:** 2026-07-14  
**Branch:** `feature/performance-cms-loading`  
**HEAD:** `2ab6c13` — Batch 2 PARTIAL  
**Pre-checks:** `test:frontend-architecture`, `lint`, `build`, `git diff --check` — **PASS**

## App.tsx metrics

| Metric | Value |
|--------|------:|
| LOC | 4,254 (file lines ~4,535) |
| imports | 21 |
| useState | 55 |
| useEffect | 11 |
| useMemo | 6 |
| useCallback | 0 |
| handle* | 30 |
| modal markers | ~30 |
| CRM-related symbols | ~27 |

## Section ownership map (truth)

| Section | In App.tsx? | Current home | LOC (approx) | Target module | Notes |
|---------|-------------|--------------|-------------:|---------------|-------|
| Scanned Content | No (via AgentPlatform static) | `components/agent/AgentScannedContents.tsx` | 636 | `features/agent/scanned-content` | 3A move + lazy |
| Lead Intelligence | No | `AgentFindings.tsx` | **1,731** | `features/agent/lead-intelligence` | 3A move + split drawer/helpers; matching inside |
| Action Proposals | No | `AgentActionProposals.tsx` | 321 | `features/agent/lead-intelligence/proposals` or `action-proposals` | 3A move + lazy |
| External Inventory | No | `AgentExternalInventory.tsx` | 419 | `features/agent/external-inventory` | 3B move + lazy |
| Investor Leads | Thin lazy only | `components/admin/InvestorLeadsPanel.tsx` | 573 | `features/investor-leads` | 3B move |
| CRM Customers | **Yes** | App lines ~2134–2257 + modal ~3752+ + handlers | ~250–400 | `features/crm` | **Primary App LOC cut** |
| Matching | Inside Findings | AgentFindings | (included) | `lead-intelligence/matching` | Extract with LI |
| Users & Permissions | Yes | App ~3443–3708 | ~265 | Batch 4 | Depends customers/properties |
| Properties/Listings | Yes | App + AdminPropertyDirectory | large | Out of Batch 3 | — |
| Dashboard / chats / inbox | Yes | App | large | Out of Batch 3 | — |

## Dependencies

- Lead Intelligence → promote → Investor Leads navigation; save external → External Inventory.
- CRM Users assignment still needs customer/property lists in App until Batch 4.
- Canonical DTO: Findings already prefer `intelligence` / resolver helpers — preserve.
- Performance: keep bootstrap / navigationCounts / queryCache; do not preload LI/scanned/inventory/CRM on F5.

## Plan

1. **3A** — Move Scanned / Lead Intelligence (+ drawer split) / Proposals → features; lazy in AgentPlatformPage.  
2. **3B** — External Inventory + Investor Leads + CRM Customers page; remove CRM JSX/modals/handlers from App.  
3. Docs: BATCH4-USERS-DEPENDENCIES + FRONTEND-BATCH3-REPORT.
