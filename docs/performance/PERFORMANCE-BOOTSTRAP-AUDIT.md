# PERFORMANCE BOOTSTRAP AUDIT

**Repo:** `real-estate-ai-marketing-agent-cms`  
**Branch base:** `master` (post-R2)  
**Date:** 2026-07-14  
**Scope:** CMS admin bootstrap (login / F5 / dashboard). No business-logic changes in this milestone.

---

## 1. Stack & entry points

| Layer | Detail |
|--------|--------|
| Frontend | React 19 + Vite 6 + React Router 7 |
| Backend | Express + Prisma/Postgres (`cmsRecord` collections + agent tables) |
| Shared query cache | **None** (no TanStack Query / SWR) |
| Entry | `index.html` → `src/main.tsx` |
| Admin shell | Lazy `AdminApp` = `src/App.tsx` (~5k lines) |
| Chunk | `vite.config.ts` maps `src/App.tsx` → `admin-app` |

Public pages already use `React.lazy`. Admin **internals** are **eager static imports** inside `App.tsx`.

---

## 2. API calls — login / F5 / dashboard

### 2.1 Login

| # | Request | From | Records / payload |
|---|---------|------|-------------------|
| 1 | `POST /api/auth/login` | `api.login` ← `App.handleLogin` | Auth session |
| 2–9 | Core parallel `getInitialAppData()` | `App.fetchAllData` | See below |
| 10–14 | Secondary `loadSecondaryData()` | Fire-and-forget | Chat, guests, generated, users |
| 15 | `GET /api/agent/notifications/unread-count` | `AgentNotificationBell` | Count only |

**Core parallel:**

| Endpoint | Intent | Shape today | Used by UI? |
|----------|--------|-------------|-------------|
| `GET /api/dashboard` | Metrics | counts + top-10 traffic | **Fetched then discarded** |
| `GET /api/customers` | Full CRM | **All customers** | Yes (state) |
| `GET /api/properties` | Full inventory | **All properties** | Yes |
| `GET /api/posts` | MXH posts | **All posts** | Yes (even if MXH disabled) |
| `GET /api/inbox` | Inbox | **All messages** | Yes |
| `GET /api/automations` | Automations | Full list | Yes |
| `GET /api/settings` | Settings | Object | Yes |
| `GET /api/channels` | Channels | Full list | Yes |

**Secondary:**

| Endpoint | Notes |
|----------|-------|
| `GET /api/chat/history` | Full-ish history |
| `GET /api/chat/guests` | All guests |
| `GET /api/chat/history?scope=mine` | Assistant thread |
| `GET /api/content/generated` | Generated contents |
| `GET /api/users` | Role-gated |

### 2.2 Authenticated F5

Same as login **minus** login POST, **plus** `GET /api/auth/me`.

Additional polls:

| Poll | When | Cost |
|------|------|------|
| Properties + settings every **15s** | `dashboard` or `properties` tab | Full property list again |
| Chat guests/history every **2.5s** | chat tabs only | OK (scoped) |
| Unread notifications every **45s** | Always (header bell) | Light |

### 2.3 Open CRM Dashboard

No extra agent list APIs. Dashboard metrics are **recomputed client-side** from already-loaded full arrays (`App.tsx` `useMemo` ~317–380). Server `/api/dashboard` response is unused.

**Observed pattern (before fix):**

```
F5 → auth/me
   → Promise.all(dashboard, customers*, properties*, posts*, inbox*, automations, settings, channels)
   → background(chat*, generated*, users?)
   → unread-count (+45s)
```

\* = full list preload.

---

## 3. Preload findings (by domain)

| Domain | Preloaded on login/F5? | Actual load trigger |
|--------|------------------------|---------------------|
| Customers / CRM | **YES** | Always |
| Properties | **YES** | Always + 15s poll |
| Posts | **YES** | Always |
| Inbox / automations / settings / channels | **YES** | Always |
| Chat / generated / users | **YES (secondary)** | Always after core |
| Findings (Lead Intelligence) | No | Agent Findings route |
| Scanned contents | No | Agent Contents route |
| Investor leads | No | Investor Leads tab (cap 300) |
| Notifications **list** | No | Bell open / Notifications page |
| Notifications **count** | Yes (poll) | Header always |
| Jobs / Sources / External inventory / Reports / Matching | No | Respective agent routes |
| SEO blog CMS | No | SEO tabs |
| `cms_records` | Server memory hydrate | `readDatabase()` / `cmsRecord.findMany` — every CRM API may touch in-memory DB |

---

## 4. React mount audit

### Mounts on F5 (authenticated)

1. Lazy `AdminApp` shell (header + sidebar + main)
2. `AgentNotificationBell` (always)
3. **One** active tab panel via `{activeTab === '…' && …}` (good)

### Code-splitting

| Layer | Status |
|-------|--------|
| Public routes | `React.lazy` ✅ |
| Admin `App.tsx` | Lazy from `main.tsx` ✅ |
| Inside admin (InvestorLeads, AgentPlatform, SEO, LeadMagnet, …) | **Eager imports** ❌ |

### Hidden-but-mounted

- CRM tabs: **conditional render** → inactive tabs **unmount** ✅
- Agent platform: one section at a time ✅
- Remaining issues: global polls + eager JS parse of entire admin graph

### `useEffect` fetch when tab closed

| Effect | Problem |
|--------|---------|
| `fetchAllData` on `currentUser` | Loads **all** CRM lists regardless of active tab |
| `loadSecondaryData` | Same |
| Traffic `refreshTrafficData` | Full properties when on dashboard |
| Notification unread poll | Acceptable (count only) |

---

## 5. Pagination / search / sort / filter

| Area | Model (before) |
|------|----------------|
| CRM customers / posts / inbox | Full fetch → client `array.filter` / render all |
| Properties | Full fetch → client filters + client page slice (`AdminPropertyDirectory`) |
| Investor leads | Cap 300 → client filter |
| Agent findings / jobs / sources / scanned / inventory | Server `?page=&limit=` + Prisma filters ✅ |

---

## 6. Cache

- No TanStack Query
- Auth token + active tab in `localStorage`
- Public site property module cache in `main.tsx` only
- Refresh button = full `getInitialAppData` again

---

## 7. Dashboard API vs lists

`GET /api/dashboard` already returns **counts + metrics + top-10** (not full findings lists).  
Problem: bootstrap **also** loads full CRM lists and **ignores** dashboard payload on the client.

---

## 8. Navigation badge counts

Computed from in-memory arrays:

| Badge | Source |
|-------|--------|
| CRM | `customers.length` |
| Properties | `countPropertyStatuses(properties).adminVisible` |
| Posts | `posts.length` |
| Inbox | pending filter |
| Website chat / chat history / users | secondary arrays |
| Agent submenu | No badges |
| Bell | `/api/agent/notifications/unread-count` |

**Gap:** No dedicated `/api/navigation-counts`; badges force full-list preload.

---

## 9. Target bootstrap (after optimization)

```
F5 → auth/me
   → GET /api/dashboard
   → GET /api/navigation-counts
   → GET /api/settings   (cached ~10m)
→ open menu / route → module API only
```

---

## 10. Key files

- `src/main.tsx`, `src/App.tsx`, `src/services/api.ts`
- `src/pages/AgentPlatformPage.tsx`, `src/components/agent/*`
- `src/components/admin/InvestorLeadsPanel.tsx`, `AdminPropertyDirectory.tsx`, `SeoContentAdmin.tsx`
- `server.ts`, `server/dbHelper.ts`, `server/agent/agentRoutes.ts`, `server/investorLeadRoutes.ts`

---

## 11. Executive verdict

1. **Largest cost:** every login/F5 eagerly loads full customers, properties, posts, inbox (+ chat/content secondary).
2. **`/api/dashboard` is redundant on client** today — UI re-aggregates from full lists.
3. Agent entity lists are largely **route-scoped** (good); CRM is not.
4. Tabs unmount correctly; remaining pain is **eager admin bundle** + **global list preload**.
5. CRM search/pagination are client-side; agent lists already server-paginated.
