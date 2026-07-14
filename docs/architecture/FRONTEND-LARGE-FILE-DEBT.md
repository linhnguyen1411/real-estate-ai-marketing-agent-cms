# Frontend large-file debt (post Batch 6)

Technical debt inventory after closing the frontend architecture gate. Non-blocking items do not reopen the App shell gate.

| Owner | File | LOC (approx) | Risk | Priority | Phase |
|-------|------|-------------:|------|----------|-------|
| Public marketing | `src/ListingsPage.tsx` | 1680 | High maintainability / token cost; does **not** block admin shell | P1 | Dedicated public listings refactor (explicitly out of Batch 6) |
| Agent | `src/features/agent/lead-intelligence/pages/LeadIntelligencePage.tsx` | 1015 | Dense lead UX; already feature-owned | P2 | Agent UX decomposition |
| Users | `src/features/users/pages/UsersPage.tsx` | 766 | Permission/assignment complexity | P2 | Users form/section split |
| App legacy | `src/App.tsx` Posts / SEO / AI Content blocks | shell 1623 total | Residual God sections for content hub | P2 | Extract Posts + SEO + AI Content modules |
| Properties | `src/features/properties/components/PropertyFormModal.tsx` | ~530 | Large form; under 800 threshold | P3 | Optional field-group split |
| Chat | `src/features/chat/components/ChatHistoryPanel.tsx` | ~250 | OK | P3 | — |
| Admin SEO | `src/components/admin/SeoContentAdmin.tsx` (lazy chunk ~45 kB) | large admin UI | Content editor complexity | P2 | SEO feature folder |

## Explicitly not blockers for architecture COMPLETE
- Public `ListingsPage` (separate product surface; App shell no longer waits on it).
- Lead Intelligence / Users God pages (already outside App ownership).
- Posts/SEO still in App but documented as legacy modules with clear owner target.

## Gate thresholds (Batch 6)
- App ≤ 1800 LOC with legacy Posts/SEO/AI allowed.
- PropertiesPage ≤ 800 (target ≤ 560) — **met**.
- ChatFeatureHost ≤ 500 (target ≤ 380) — **met**.
- InboxPage ≤ 500 — **met**.
