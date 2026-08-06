# FRONTEND BATCH 6 REPORT

**Branch:** `feature/performance-cms-loading`  
**Baseline HEAD:** `36f6433` (Batch 5)  
**Date:** 2026-07-14  
**Verdict:** **FRONTEND ARCHITECTURE COMPLETE**  
**Performance resume:** **YES**

---

## 1. Baseline

See `BATCH6-BASELINE.md`.

| Metric | Before (Batch 5) |
|--------|-----------------:|
| App LOC / nb | 1608 / 1482 |
| useState / useEffect / handlers | 27 / 9 / 9 |
| PropertiesPage | ~1011 / 951 |
| ChatFeatureHost | ~763 / 718 |
| Badge chat dilution | hardcoded 0 |

## 2. Runtime smoke

See `BATCH6-RUNTIME-SMOKE.md`. Core Properties / Inbox / Chat + badge **PASS**. Poll stops on leave. Settings click interrupted mid-tooling (non-core).

## 3. Badge root cause / fix

**Cause:** Batch 5 left `extraBadges.websiteChat/chatHistory = 0`, overriding real counts.  
**Fix:** Extended `GET /api/navigation-counts` with lightweight `websiteChat` + `chatHistory`; wired `NavigationCounts` + sidebar; App no longer hardcodes chat zeros. Inbox/Chat call `onCountsChanged` → `refreshNavigationCounts`.

Runtime: website **1**, history **2**, inbox **4**.

## 4. Properties split

- Extracted `PropertyFormModal`
- `PropertiesPage` **553 LOC** (≤560 target)
- Modal no longer inline in page

## 5. Chat split

- `AssistantChatPanel`, `WebsiteChatPanel`, `ChatHistoryPanel`
- `useChatPolling` owns `setInterval` / `clearInterval`
- `ChatFeatureHost` **335 LOC**

## 6. App ownership final

| Name | Type | Current owner | Global OK? | Target | Action | Phase |
|------|------|---------------|------------|--------|--------|-------|
| auth / session | state+effect | App | yes | App | keep | — |
| activeTab / menus | nav | App | yes | App/router | keep | — |
| toast / bootstrap / nav counts | shell | App | yes | App | keep | — |
| dashboard shell + traffic poll | dashboard | App | yes | Dashboard feature (later) | document | Perf M2 |
| posts / SEO panels | legacy content | App | no | SEO/Posts modules | defer | Next content batch |
| selectedPropertyForAI / aiPropertyOptions | AI hub | App | no | AI Content page | defer | Next content batch |
| properties/inbox/chat lists/modals | feature | feature pages | — | — | removed from App | Done |

## 7. App metrics after

| Metric | After |
|--------|------:|
| App LOC / nb | 1623 / 1496 |
| useState | 26 |
| useEffect | 9 |
| handlers | 9 |
| PropertiesPage | 553 |
| ChatFeatureHost | 335 |
| InboxPage | 225 |

App grew slightly (+15) from badge wiring props — still within ≤1800 shell gate with legacy Posts/SEO/AI.

## 8. Duplicate mount / fetch

- Pages gated by `activeTab === …` (architecture test enforced).
- Properties → one list request; Inbox → one list request.
- Chat StrictMode may double initial reload in DEV; not a poll leak.

## 9. Polling lifecycle

Verified: website-chat polls guests/history; leaving to Dashboard yields **0** chat APIs for 5s.

## 10. Bundle / chunks (build)

| Chunk | Size |
|-------|------|
| admin-app | ~73.6 kB |
| PropertiesPage | ~48.5 kB |
| ChatFeatureHost | ~23.8 kB |
| InboxPage | ~7.1 kB |

## 11. Large file debt

See `FRONTEND-LARGE-FILE-DEBT.md` (ListingsPage 1680, LI 1015, Users 766 — non-blocking).

## 12. Tests

| Suite | Result |
|-------|--------|
| `test:frontend-architecture` | PASS |
| `lint` (`tsc --noEmit`) | PASS |
| `build` | PASS |
| `git diff --check` | PASS |
| `test:agent-regression` | PASS (25/25) |
| `test:agent-tenant-isolation` | PASS |

## 13. Commits

Per commit plan (badge → properties → chat → app → docs/tests) on this branch after Batch 5 head.

## 14. Remaining legacy modules in App

Posts list/status, SEO submenu panels, AI Content Generator property picker (`selectedPropertyForAI`). Documented — do not block architecture COMPLETE.

## 15. Verdict

**FRONTEND ARCHITECTURE COMPLETE**

## 16. Performance resume decision

**YES** — see `PERFORMANCE-MILESTONE-RESUME.md`. No Milestone 2 code in Batch 6.
