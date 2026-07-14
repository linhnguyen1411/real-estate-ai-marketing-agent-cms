# BATCH 5 — Context footprint

| Task | Before | After |
|------|--------|-------|
| Property form / directory | App.tsx property state + modal | `features/properties/pages/PropertiesPage.tsx` (+ AdminPropertyDirectory) |
| Inbox reply / selection | App.tsx inbox state + handlers | `features/inbox/pages/InboxPage.tsx` |
| Chat draft / send / guest poll | App.tsx chat state + 2.5s poll | `features/chat/pages/ChatFeatureHost.tsx` |
| Public SEO listings page | `ListingsPage.tsx` (unchanged) | still public monolith (debt) |

Ordinary property/inbox/chat fixes should not require reading App.tsx except for AI Content property picker shell.
