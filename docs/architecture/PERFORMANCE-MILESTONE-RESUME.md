# PERFORMANCE MILESTONE — RESUME PLAN

Performance work remains **paused** after Batch 2 architecture. Do not claim complete.

## Already kept (still wired)

- `getBootstrapData` / dashboard + navigation-counts + settings bootstrap
- `navigationCounts` sidebar badges
- `loadModuleForTab` for CRM/properties/etc.
- `queryCache` + invalidate helpers
- Lazy admin panels (investor leads, SEO, property directory, …)
- List pagination query params on CRM APIs
- Batch 2 feature lazy pages (settings/automations/integrations/profile + agent sections)

## Needs rewire after further architecture

- When Users / CRM leave App, keep permission assignment APIs unchanged
- Move remaining bootstrap `loadModuleForTab` owners into page hooks
- Ensure Notifications bell continues to use count-only endpoint

## Not done (Performance Milestone)

- Full CRM server-side search UX polish
- Virtual tables for lists >100
- Dedicated AppRouter composition (routes still via tab state in AdminApp)
- F5 → only auth/layout/dashboard/nav-counts as exclusive guaranteed set for all menus

## KPI still apply

Same as PERFORMANCE-REPORT.md: F5 API count, transfer, lazy chunks, no preload of Sources/Jobs/Notifications list/Reports/Sessions.
