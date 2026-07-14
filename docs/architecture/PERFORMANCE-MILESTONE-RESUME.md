# PERFORMANCE MILESTONE RESUME

After Frontend Architecture Decomposition (Batch 1+), resume Performance work on the new module boundaries — do **not** declare Performance complete yet.

## Already kept (must not regress)

| Item | Location |
|------|----------|
| F5 bootstrap = dashboard + navigation-counts + settings | `App.tsx` → `getBootstrapData` |
| Load-on-menu via `loadModuleForTab` | `App.tsx` |
| Query TTL cache | `src/services/queryCache.ts` |
| List pagination query params | `server/listPagination.ts` + CRM GETs |
| Lazy panels (InvestorLeads, AgentPlatform, SEO, …) | still in App + `AdminHeader` bell |
| Docs audit/report | `docs/performance/*` |

## Needs rewire as features extract

| Work | When feature moves |
|------|--------------------|
| Dashboard metrics UI | → `features/dashboard` hooks using `/api/dashboard` only |
| CRM list fetch/pagination | → `features/crm` hooks |
| Properties list | → `features/properties` |
| Nav badges | stay on `navigation-counts`; sidebar already config-driven |
| Promote invalidate | keep `invalidateAfterLeadPromote` near findings feature |

## Not done yet (Performance Milestone)

- Full route-based router (still tab `activeTab` for CRM tabs)
- Virtual tables for >100 rows
- Complete server-side filter for all CRM price/area client filters
- Dedicated page-level Suspense for every CRM tab module
- Before/after runtime metrics in prod

## KPI still apply

- F5: auth + layout + dashboard + nav counts only
- No preload findings/CRM/jobs/inventory/notifications list/sources/properties
- Pagination server-side for lists
- Route/module lazy boundaries
- No business/schema/AI changes

## Resume order (after architecture PARTIAL→COMPLETE)

1. Finish App shell + feature extraction (this phase).
2. Convert remaining CRM tabs to lazy feature pages.
3. Re-run PERFORMANCE-REPORT deltas on new chunk graph.
4. Only then mark Performance Milestone.
