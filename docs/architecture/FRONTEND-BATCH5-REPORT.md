# FRONTEND BATCH 5 REPORT

**Branch:** `feature/performance-cms-loading`  
**Baseline:** `266fab3` (Batch 4 ownership)  
**Date:** 2026-07-14  
**Verdict:** **BATCH 5 PARTIAL**

## 1. Baseline / checkpoint

Batch 5 baseline docs: `BATCH5-BASELINE.md`, `BATCH5-PROPERTIES-OWNERSHIP.md`.  
Properties extraction completed first and kept green; this close-out finishes Inbox + Chat cleanup on the same working tree.

## 2–3. App metrics

| Metric | Batch 4 end (`266fab3`) | After Batch 5 |
|--------|------------------------:|--------------:|
| App.tsx LOC | ~3,442 | **~1,608** |
| non-blank | ~3,224 | **~1,482** |
| useState | 45 | **27** |
| useEffect | 10 | **9** |
| handle* | 22 | **9** |
| properties App state | yes | **removed** |
| inbox/chat App state | yes | **removed** |
| property/inbox/chat APIs in App | yes | **no** |

Shell target useState &lt;20–25 slightly missed (27) due to AI content selection, posts, dashboard/auth/bootstrap remaining.

## 4–7. Properties

- `features/properties/pages/PropertiesPage.tsx` (~1012 LOC) owns list/filters/pagination/modal/mutations.
- `AdminProjectsPanel` self-fetches properties when prop omitted.
- AI Content keeps lightweight `aiPropertyOptions` in App (options only), not full CMS inventory ownership.
- Public `ListingsPage.tsx` (~1565 LOC) remains public-site debt (not admin App tab).
- **Debt:** PropertiesPage still &gt;800 LOC (modal inline); further form split deferred.

## 8–10. Inbox

- Multi-channel social inbox (Messenger/Zalo/TikTok/Website livechat demo inbox), not email.
- `features/inbox/pages/InboxPage.tsx` owns list, selection, AI suggest, send reply, search.
- No App polling for inbox (load-on-mount + search debounce only).
- Lazy from App.

## 11–12. Chat

- Independent CMS chat surfaces: assistant chatbot, website guest chat, chat history (not a tab inside Inbox).
- `features/chat/pages/ChatFeatureHost.tsx` owns threads, draft, send, delete, guest AI toggle.
- Polling (2.5s) only when `mode` is `website-chat` or `chat-history`; cleaned via `clearInterval` on unmount/mode change.
- CRM opens chatbot via `initialDraft` + remount key (no global selectedCustomer).
- Sidebar website/history badges set to `0` (lists no longer App-owned); `pendingInbox` still from navigation counts.

## 13–16. Cleanup / lazy / tests

- App mounts: lazy `PropertiesPage`, `InboxPage`, `ChatFeatureHost`.
- Architecture tests extended for Batch 5 ownership.
- Browser runtime smoke not executed in this environment → contributes to PARTIAL.

## 17. Bundle

Measured after `npm run build` in close-out (see final response). Expect separate Properties/Inbox/Chat chunks and smaller `admin-app`.

## 18–22. Remaining App

Auth/bootstrap, dashboard, AI content hub, posts/MXH, SEO panels, settings prop shell, automations/integrations/profile/users lazy mounts, search for posts, toast, activeTab.

## 23. Verdict

**BATCH 5 PARTIAL** — Properties/Inbox/Chat ownership left App with lazy routes and architecture tests pass; runtime smoke unverified; PropertiesPage still large; chat sidebar badges diluted; public ListingsPage undecomposed.
