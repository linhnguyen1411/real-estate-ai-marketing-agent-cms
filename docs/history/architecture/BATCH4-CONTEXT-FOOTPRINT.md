# Batch 4 — Context footprint

Goal: feature fixes should not require reading `App.tsx`.

| Task | Before Batch 4 | After Batch 4 |
|------|----------------|---------------|
| Lead Intelligence card / drawer / matching | App shell + old AgentFindings / large page | `features/agent/lead-intelligence/*` only (+ shared DTO) |
| Scanned Content actions | App / AgentPlatform static import | `features/agent/scanned-content/*` |
| CRM modal / analyze / list | App.tsx customers state + handlers | `features/crm/pages/CustomersPage.tsx` |
| Users permission assignment | App + `customers` + `properties` arrays | `features/users/pages/UsersPage.tsx` (self-fetches catalogs) |
| Dashboard hot leads table | App `customers.filter(...)` (often empty) | `features/dashboard/components/DashboardHotLeads.tsx` |
| Property sell/hide/modal | Still App | Still App (next extraction) |
| Inbox / chat | Still App | Still App (next extraction) |

## Remaining App-read tasks

Editing Properties directory, property modal, inbox replies, website chat, MXH posts, AI content hub still require App.tsx.
