# Publishing Legacy Audit

**Branch:** `feature/facebook-auto-publishing`  
**Date:** 2026-07-16  
**Scope:** Facebook / social auto-publishing only (not SEO blog posts, not lead scan)  
**Method:** Keyword search + route → component → API → service → DB → worker traces (not filename guesses)

---

## Verdict

**C. LEGACY PUBLISHING STUB/DEAD** for outbound social auto-post.

There is **no production end-to-end “publish to Facebook” pipeline**. Existing pieces are:

| Area | Classification | Action |
|------|----------------|--------|
| CMS MXH posts + Dashboard “Publish queue” | STUB / DEAD UI | Deprecate; do not restore as publisher |
| Graph Fanpage webhook/inbox | LEGACY GRAPH ACTIVE (inbound) | Keep; adapt Page token crypto for Fanpage Graph publish |
| Agent Facebook browser | ACTIVE scan/read | Keep; add **separate** publish tab (do not reuse scan tab) |
| Action proposals (“Duyệt phản hồi”) | ACTIVE draft/approval, **no execute post** | Keep as pattern; do not wire to auto-post |
| `/api/channels` + Integrations cards | STUB mock | Deprecate as “connected channels” |
| CMS Inbox outbox | STUB (`console.log`) | Not social publish |
| `FacebookPanel` (“Kênh Facebook”) | DEAD / REUSABLE UI (unmounted) | Do not remount as publisher; optional inbox later |
| Manual sharer (`propertyShare` / `blogShare`) | ACTIVE user-driven | Keep; not auto-post |

**Implement MVP as a new `social-publishing` module** (channels, drafts, jobs, audit, adapters). Reuse: browser session discipline, token crypto, AI copy helpers, approval UX patterns.

---

## Inventory

| Path | ~LOC | Purpose | Runtime caller | Kind | Status | Reusable? | Risk |
|------|------|---------|----------------|------|--------|-----------|------|
| `src/app/navigation/tabPaths.ts` | ~42 | `MXH_POSTS_ENABLED=false`; remaps `posts`/`facebook` → dashboard | App bootstrap | Prod | ACTIVE flag / DEAD feature | Yes (flag) | Hidden feature confusion |
| `src/app/navigation/sidebarConfig.ts` | ~98 | Conditionally shows “Danh sách bài đăng CMS” | AdminSidebar | Prod | ACTIVE (item hidden) | Yes | — |
| `src/App.tsx` | ~1500 | Posts tab + dashboard Publish/Schedule | Admin shell | Prod | PARTIAL / STUB | Partial (AI UI) | Fake Publish labels |
| `src/types.ts` (`Post`) | ~25 | draft/scheduled/published + platform | FE/API | Prod | ACTIVE type for stub | Partial | Misleading statuses |
| `src/services/api.ts` | posts helpers | `/api/posts` client | App when flag on | Prod | ACTIVE client | Yes | — |
| `server.ts` `/api/posts*` | ~100 | CRUD into `cms_records` collection `posts` | FE | Prod | ACTIVE DB write, **no publish** | Partial | Status ≠ Facebook |
| `server.ts` AI generate → drafts | ~70 | Creates facebook/zalo/tiktok draft rows | `/api/ai/generate-content` | Prod | ACTIVE content gen | Yes (copy) | Orphan drafts |
| `server/dbHelper.ts` posts | ~30 | Prisma `CmsRecord` for posts | writeDatabase | Prod | ACTIVE | Yes | — |
| `src/components/admin/FacebookPanel.tsx` | ~408 | “Kênh Facebook” inbox UI | **NONE** | Dead UI | DEAD / REUSABLE UI | Partial | Orphan |
| `src/services/facebookApi.ts` | ~153 | Client `/api/facebook/*` | Only FacebookPanel | Dead path | DEAD caller | Yes | — |
| `server/facebookRoutes.ts` | ~284 | Webhook + admin Graph routes | `server.ts` if flag | Prod | LEGACY GRAPH ACTIVE | Yes | Env token |
| `server/facebook/graphApi.ts` | ~71 | Test Page connection only | admin test + `fb:test` | Prod | LEGACY GRAPH | Yes | **No feed publish** |
| `server/facebook/facebookApi.ts` | ~32 | PSID profile + URL helpers | webhook enrich | Prod | ACTIVE | Yes | — |
| `server/facebook/privateReplyService.ts` | ~42 | `canSendPrivateReply` + `sendPrivateReply` | can* in routes; **send* unused** | Prod | PARTIAL | Partial | Dangerous if wired blindly |
| `server/facebook/config.ts` | ~18 | Env Graph config | Graph stack | Prod | ACTIVE | Yes | Secrets |
| `server/facebook/tokenCrypto.ts` | ~34 | Encrypt page tokens | facebookDb | Prod | ACTIVE | **Yes** | Key fallback |
| `server/facebook/facebookDb.ts` | ~270 | Prisma FB models | routes/processor | Prod | ACTIVE | Yes | — |
| `server/facebook/webhook*.ts` | ~240 | Inbound parse/queue/process | webhook | Prod | ACTIVE | Yes | Fire-and-forget |
| `server/facebook/conversationService.ts` | ~30 | Messenger → DB | processor | Prod | ACTIVE | Yes | — |
| `server/facebook/leadSync*.ts` | ~195 | Comment/intent → Lead | processor | Prod | ACTIVE | Yes | — |
| `prisma` `Facebook*` models | ~130 | PageConnection, Contact, Conversation, Message, Interaction, Webhook* | Graph | Prod | ACTIVE | Yes | Encrypted tokens |
| `prisma` `AgentActionProposal` | ~40 | Draft replies; no FB post | agent | Prod | ACTIVE | Yes | executedAt unused for FB |
| `src/features/.../ActionProposalsPage.tsx` | ~303 | Approve/copy; “chưa đăng FB” | `/admin/agents/proposals` | Prod | ACTIVE | Yes | — |
| `server/agent/actionProposalService.ts` | ~414 | Approve/copy audit; never posts | agent routes | Prod | ACTIVE | Yes | — |
| `server/agent-worker/adapters/facebookGroupAdapter.ts` | ~547 | Scan group/home feed | worker | Prod | ACTIVE **scan** | Yes | Session/CDP |
| `server/agent-worker/facebook/*` | ~2800 | DOM/nav/checkpoint/GraphQL capture | adapter | Prod+tests | ACTIVE | Yes | Fragile DOM |
| `server/agent-worker/browserManager.ts` | ~290 | Worker-owned **scan** tab reuse | adapter | Prod | ACTIVE | **Yes pattern** | CDP shares Chrome profile |
| `src/features/integrations/IntegrationsPage.tsx` | ~115 | Fanpage connection cards | integrations tab | Prod | STUB | No | Fake CONNECTED |
| `server.ts` `/api/channels` | ~12 | Hardcoded mock channels | IntegrationsPage | Prod | STUB | No | Lies |
| `src/features/inbox/InboxPage.tsx` | ~205 | Multi-channel inbox | inbox tab | Prod | PARTIAL mock | Partial | Simulated send |
| `server.ts` inbox reply | ~25 | `console.log [OUTBOX SENT]` | InboxPage | Prod | STUB | No | False success |
| `src/utils/propertyShare.ts` / `blogShare.ts` | ~90 | Manual FB sharer popup | public site | Prod | ACTIVE manual | Yes | User tab only |
| `scripts/fb-test.mjs` + facebook tests | various | Graph test + scan unit tests | npm | Test | ACTIVE (scan/webhook) | — | **No publish tests** |

---

## Runtime chains (traced)

### A) Fake CMS social publisher

```
Sidebar "Danh sách bài đăng CMS" → MXH_POSTS_ENABLED=false → NOT in nav
tab "posts" / "facebook" → normalizeStoredTab → dashboard
App posts tab → gated false
Dashboard "Publish queue" → posts state never loaded → empty
PUT /api/posts/:id → cms_records "posts" → NO Graph, NO browser, NO worker
```

### B) Graph Fanpage (inbound only)

```
Meta webhook → /webhooks/facebook → processor → Prisma facebook_*
Admin → /api/facebook/* + /api/admin/facebook/test-connection
UI FacebookPanel → NEVER imported
Flag FACEBOOK_GRAPH_LEGACY_ENABLED (default true)
```

**No** `POST /{page-id}/feed` or `/photos` publish endpoints exist.

### C) Agent Facebook scanner (read-only)

```
AgentSource facebook_group → job scan_source → facebookGroupAdapter
→ browserManager.getScanPage (worker-owned tab) → capture → ScannedContent
→ findings / action proposals (draft text only)
```

### D) Manual share (not auto-post)

`window.open(facebook.com/sharer/...)` — user must confirm in Facebook UI.

---

## Mandatory answers (Q1–20)

1. **Old menu / route**  
   - “Danh sách bài đăng CMS” — tab `posts` (flag off).  
   - “Kênh Facebook” — `FacebookPanel` title; **no route mount**.  
   - Tab id `facebook` remapped to dashboard (`tabPaths.ts`).  
   - No `/admin/facebook` or `/admin/posts` in `routeConfig` (SEO `/admin/seo/posts` is blog).

2. **Component/page mounts?**  
   - Posts tab: **no** (`MXH_POSTS_ENABLED=false`).  
   - FacebookPanel: **no** (zero importers).  
   - Dashboard Publish queue panel: **yes**, but empty when flag off.

3. **Real backend API?**  
   - Posts CRUD: yes. Graph inbox: yes. Channels: mock.

4. **API writes DB or mock?**  
   - Posts → real `CmsRecord`. Graph → real Prisma. Channels → hardcoded. Inbox reply → DB status + `console.log`.

5. **Prisma models for publishing?**  
   - **No** SocialPost / SocialPublishJob. Posts use `CmsRecord` collection `"posts"`. Graph models are inbound. Action proposals are reply drafts.

6. **Scheduler/job queue for publishing?**  
   - **No.** Agent scheduler enqueues **scan** only. `scheduled_at` on posts is a field with no executor.

7. **Browser executor for posting?**  
   - **No.** Browser stack is scan/read only.

8. **Graph API routes?**  
   - Webhook, test-connection, inbox/comments/leads CRUD, can_reply_privately. **No feed publish.**

9. **Graph supports Fanpage / Personal / Group?**  
   - Graph: **Fanpage only** (page id + page token) — inbound + connection test.  
   - Browser: group + personal **home feed scan**. Not Fanpage Graph publish; not group posting.

10. **Draft/approval?**  
    - Action proposals: real approve/reject/copy; **does not post**.  
    - CMS posts: status labels only.

11. **Scheduled posting?**  
    - UI can set `scheduled_at`; **no worker fires it**.

12. **Audit log?**  
    - Action proposals + webhook events. **No** social publish audit.

13. **Media upload (outbound)?**  
    - **No** for Facebook publish. Inbound Messenger attachments only.

14. **Retry/idempotency for publish?**  
    - **None.** Scan has content-hash dedupe (read path).

15. **Evidence of successful FB feed posts?**  
    - **None** in tests or production call paths.

16. **Opens new tab per job?**  
    - Scan: reuses one worker-owned tab. Manual sharer: user popup.

17. **Uses user’s Facebook tab?**  
    - Designed **not** to drive user tabs; CDP may share same Chrome profile cookies.

18. **Dangerous cookies/tokens?**  
    - Page access token in env + encrypted `FacebookPageConnection`. Managed profile cookies on disk for scan login. No FB password in DB.

19. **Feature flags?**  
    - `MXH_POSTS_ENABLED` (hardcoded false).  
    - `FACEBOOK_GRAPH_LEGACY_ENABLED`.  
    - Agent/worker flags unrelated to publish.

20. **Tests?**  
    - Scan/webhook/checkpoint/navigation/dom-parser + `fb:test`.  
    - **Zero** social-publish tests.

---

## Keep / refactor / adapt / deprecate / remove

| Decision | Items |
|----------|--------|
| **Keep** | Agent FB scan worker + tests; Graph webhook + Prisma inbox; token crypto; action-proposal draft/approve/copy; AI Facebook copy generation; manual sharer |
| **Refactor** | Naming clarity scan ≠ publish; Dashboard “Publish queue” label when MXH off |
| **Adapt** | `BrowserManager` pattern → add `getPublishPage` (separate from scan); Graph Page token → Fanpage feed publisher; approval UX patterns → SocialPostDraft |
| **Deprecate** | MXH posts menu (keep flag false); Integrations fake CONNECTED as “publish channels”; Inbox OUTBOX as social send; orphan FacebookPanel as publisher entry |
| **Remove (later, not blocking MVP)** | Dead UI paths after new module ships; do not delete Graph inbound without product decision |

**Do not keep fake menus.** New menu under AI Agent: Drafts / Calendar / Channels / History.

---

## MVP direction (post-audit)

- **Profile cá nhân:** browser publisher via persistent Chrome session, **one owned publish tab**, never scan tab, never user tab.  
- **Fanpage:** Graph API feed/photo when page token valid; optional browser fallback behind explicit `executionMode`.  
- **No groups** in MVP.  
- **Mandatory approval** before any schedule/publish.  
- **Separate** `SocialPublishJob` + daily cap / spacing / idempotency.  
- Mission may only create **draft** (`pending_review`), never approve/schedule/publish.

---

## Env / scripts (related, not publish)

- Env: `FACEBOOK_APP_ID/SECRET`, `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_VERSION`, `FACEBOOK_TOKEN_ENCRYPTION_KEY`, `FACEBOOK_GRAPH_LEGACY_ENABLED`  
- Scripts: `fb:test`, `test:facebook-*`, `agent:check-facebook-session`, `agent:debug-facebook` — all scan/Graph inbound, not feed publish
