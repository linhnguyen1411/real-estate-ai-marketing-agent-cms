# BATCH 4 — Ownership baseline (Wave A)

**Branch:** `feature/performance-cms-loading`  
**Commit:** `ca70e7a`  
**Date:** 2026-07-14  
**Git status:** clean at audit start  
**Verify before code:** `test:frontend-architecture` / `lint` / `build` / `git diff --check` — **PASS**

## App.tsx metrics

| Metric | Count |
|--------|------:|
| LOC (physical lines) | 4,217 (~3,953 non-blank reported earlier) |
| imports | 21 |
| useState | 50 |
| useReducer | 0 |
| useEffect | 10 |
| useMemo | 5 |
| useCallback | 0 |
| `handle*` handlers | 28 |
| open/close helpers | 5 |
| Modal/drawer states | `showAddPropertyModal`, `editingUser`, `editingProperty`, `selectedInboxMessage` (+ property form satellite) |
| Selected-entity states | inbox, chat guest, chat history session, property-for-AI, permission member, editing user/property |
| Feature API surface in App | properties, customers, users, inbox, posts, chat, settings patch, bootstrap |

## Verdict of audit (pre-code)

Batch 3 moved **pages/JSX** for agent/sales modules, but App still owns:

1. **Duplicate CRM list** — `customers` + `loadCrmModule` while `CustomersPage` already queries.
2. **Users & permissions** — full UI + assignment mutating App `customers`/`properties`.
3. **Dashboard hot leads table** — derives from App `customers` (empty unless CRM/Users preload).
4. **Properties/inbox/chat** — still God-owned (out of Wave B core; Wave E shell remaining).

Agent tabs (`AgentPlatformPage userRole` only) and Investor Leads (0 props) already own internal state — **ownership OK**.

## State inventory (summary)

| State | Current owner | Used by | Correct owner | Action |
|-------|---------------|---------|---------------|--------|
| `currentUser`, auth/login fields | App | shell | App | keep |
| `activeTab`, menu open flags | App | nav | App/router | keep (route sync exists) |
| `toast` | App | shell | App | keep |
| `dashboardData`, `navigationCounts` | App | dashboard/nav | App bootstrap + dashboard widgets | keep bootstrap; isolate list widgets |
| `customers` | App | Users assign + dashboard hot table + CRM preload | Users (assignment fetch), Dashboard widget, CRM page | **move / delete App copy** |
| `properties` | App | properties tab, projects, AI hub, Users assign | properties feature / Users assignment catalog | keep for listings Wave E; Users must not depend on App copy |
| `managedUsers` + permission forms | App | Users UI, creator names, Profile patch | UsersPage + light creator map | **move Users UI** |
| `inbox`, `selectedInboxMessage`, reply | App | inbox | inbox feature | Wave E keep for now |
| chat / guests / history | App | chat tabs | chat feature | Wave E keep for now |
| property modal/form/AI selection | App | properties + AI | properties feature | Wave E keep for now |
| `settings` | App | catalog, layout | settings page owns save; App keeps shared settings for catalog | keep thin |
| `posts`, `generatedContents` | App | MXH/AI | respective tabs | keep until Batch 5+ |
| `automations` | App | unused remnant? | delete if unused | audit/delete |
| Agent finding/scanned/etc. | features | agent pages | features | already moved |

## Effects inventory

| Effect | Trigger | Side effect | Correct owner | Action |
|--------|---------|-------------|---------------|--------|
| traffic poll | dashboard tab | refresh dashboard/settings | dashboard | keep gated |
| toast dismiss | toast | timer | App | keep |
| restore session | mount | getCurrentUser | App | keep |
| auth redirect | auth | navigate login/dashboard | App | keep |
| path → activeTab | location | set tabs/menus | App | keep |
| bootstrap fetch | currentUser | getBootstrapData | App | keep |
| loadModuleForTab | activeTab | module lists | split | remove CRM arm; Users self-load |
| properties/posts/inbox search debounce | search/filters | reload module | App (listings/inbox) | keep until extract |
| chat poll | chat tabs | guests/history | App chat | Wave E |
| persist activeTab | activeTab | localStorage | App | keep |

## Handler inventory (batch-relevant)

| Handler | Correct owner | Action |
|---------|---------------|--------|
| User create/update/status/assign* | UsersPage | **move** |
| CRM analyze/add (already in CustomersPage) | CRM | done |
| Property save/image/sold/hide/restore/AI | properties | keep Wave E |
| Inbox reply | inbox | keep Wave E |
| Chat send/delete/guest | chat | keep Wave E |
| Login/logout/nav/copy | App | keep |
| Projects save | App/settings coupling | keep |
| `handleRunDemoAutomations` | AutomationsPage | remove from App if dead |

## Prop drilling (feature mounts)

| Component | Prop count | Notes |
|-----------|-----------:|-------|
| AgentPlatformPage | 1 | `userRole` — OK |
| InvestorLeadsPage | 0 | OK |
| CustomersPage | 3 | `onNotify`, `onCustomersChanged` (App CRM reload), `onDraftForCustomer` — reduce |
| Automations/Integrations | 1 | notify — OK |
| SystemSettingsPage | 2 | notify + `onSettingsSaved` — OK |
| ProfilePage | 4 | auth callbacks — OK |
| AdminProjectsPanel | 4 | properties/settings/save — listings coupling |
| AdminPropertyDirectory | ≥10 | App still God-owns properties — Wave E |
| SeoContentAdmin | (settings props) | leave |

## Global-true state to keep in App

- Auth session (`currentUser`)
- Bootstrap (`dashboardData`, `navigationCounts`, settings shell)
- Toast
- Active tab / submenu open (until router fully owns)
- Listings/inbox/chat until their features extract (documented remainder)

## Wave plan after this doc

- **B:** Remove App CRM duplicate ownership; CRM page props cleanup; confirm agent pages need no App handlers.
- **C:** Extract UsersPage; self-fetch assignment catalogs; remove Users handlers/modals from App.
- **D:** Dashboard hot-leads widget owns query (no App `customers`).
- **E:** Document remaining App shell (properties/inbox/chat); extend architecture tests.
