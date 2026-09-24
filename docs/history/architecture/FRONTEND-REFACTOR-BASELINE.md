# FRONTEND REFACTOR BASELINE

**Date:** 2026-07-14  
**Branch:** `feature/performance-cms-loading`  
**HEAD:** `2981803` (`fix lazy load`) — includes Performance Milestone partial work  
**Working tree:** clean at baseline capture  

---

## Snapshot

| Metric | Value |
|--------|------:|
| `src/App.tsx` LOC | **5136** |
| Source files (`src`+`server`+`scripts` `*.ts/tsx`) | **331** |
| `useState` in App.tsx | ~55 |
| `useEffect` in App.tsx | ~10 |
| `React.lazy` panels already in App | 8 |
| Admin routes in `main.tsx` (all → same AdminApp) | 18 |

---

## Top 30 largest files (LOC)

| LOC | Path | Risk |
|----:|------|------|
| 5136 | `src/App.tsx` | **critical** monolith |
| 1667 | `src/components/agent/AgentFindings.tsx` | critical UI |
| 1565 | `src/ListingsPage.tsx` | public (out of CMS shell scope) |
| 1301 | `server/agent-worker/.../findingRuleEngine.ts` | backend — **do not touch** |
| 1166 | `server/agent/agentRoutes.ts` | backend — skip |
| 932 | `server/agent/agentDb.ts` | backend — skip |
| 826 | `server/agentIngest/ingestService.ts` | backend — skip |
| 803×3 | `server/seed/postArticles/*` | seed data — leave |
| 739 | `server/blogDb.ts` | backend — skip |
| 731 | `src/components/admin/seoCms/PostEditorPanel.tsx` | large UI |
| 705 | `server/dbHelper.ts` | backend — skip |
| 657 | `server/aiService.ts` | backend — skip |
| 610 | `server/blogRoutes.ts` | backend — skip |
| 607 | `src/components/agent/AgentScannedContents.tsx` | large UI |
| 589 | `src/components/admin/AdminPropertyDirectory.tsx` | large UI |
| 588 | `src/services/agentPlatformApi.ts` | API surface |
| 545 | `src/components/admin/InvestorLeadsPanel.tsx` | large UI |
| 472 | `src/services/api.ts` | CMS API (keep slim) |

---

## Bundle (production `npm run build`)

| Chunk | Approx |
|-------|--------|
| `admin-app-*.js` | 209 kB / gzip 48.5 kB |
| `AgentPlatformPage-*.js` | 129 kB / gzip 32 kB |
| `SeoContentAdmin-*.js` | 45 kB |
| `vendor-react` | 220 kB / gzip 70 kB |

---

## F5 API pattern (post–performance partial)

```
auth/me | login
→ /api/dashboard
→ /api/navigation-counts
→ /api/settings
(+ notification unread-count from bell)
```

Lists load on menu open.

---

## Commands run

| Command | Result |
|---------|--------|
| `npm run lint` (`tsc --noEmit`) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |
| `npm run test:lead-intelligence-domain` | **PASS** (28 assertions) |
| `npm run test:deploy-safety` | **PASS** (10/10) |
| `npm run test:agent-regression` / tenant-isolation | **BLOCKED locally** — no `.env` / `DATABASE_URL` in this workspace (`F:\workspace\...`). Workers still run from `C:\Users\linhn\workspace\...`. |

---

## Route list (admin — URL preserved)

All currently render the same lazy `AdminApp` (`src/App.tsx`):

- `/admin/login`
- `/admin/dashboard`
- `/admin/seo/{posts,categories,tags,audit}`
- `/admin/agents` (+ sources, missions, jobs, contents, findings, external-inventory, proposals, notifications, sessions, reports)
- redirect `/admin/ai-content` → `/admin/seo/posts`

Internal CMS “tabs” still use `activeTab` + `localStorage` key `real_estate_ai_active_tab` (must keep).

---

## Goals for this phase

1. Decompose App.tsx into `src/app/*` + `src/features/*`.
2. Preserve UI, routes, API contracts, permissions.
3. Keep performance bootstrap (dashboard + nav counts + load-on-menu).
4. Do **not** declare Performance Milestone complete.
