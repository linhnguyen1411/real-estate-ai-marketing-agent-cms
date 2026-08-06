# Social Publishing MVP Report

**Branch:** `feature/facebook-auto-publishing`  
**Date:** 2026-07-16  
**Verdict:** **SOCIAL PUBLISHING MVP PARTIAL**

Reason for PARTIAL (not COMPLETE): domain + UI + scheduler/worker + tests are in place, but **live Facebook smoke** (one real profile post + one real Fanpage post with captured URLs) was not executed in this session — requires explicit user approval and a safe test channel/token.

---

## 1. Legacy audit

See [PUBLISHING-LEGACY-AUDIT.md](./PUBLISHING-LEGACY-AUDIT.md).

**Verdict:** **C. LEGACY PUBLISHING STUB/DEAD** for outbound auto-post.

| Area | Status |
|------|--------|
| CMS MXH posts / Publish queue | STUB (flag `MXH_POSTS_ENABLED=false`) |
| Graph Fanpage webhook/inbox | ACTIVE inbound only — no feed publish |
| Agent browser Facebook | ACTIVE scan — not publisher |
| Action proposals | ACTIVE draft/approve/copy — no FB post |
| Integrations `/api/channels` | MOCK STUB |
| `FacebookPanel` | DEAD / unmounted |

---

## 2. Code reused

- `BrowserManager` pattern → `getPublishPage()` (separate from scan tab)
- `tokenCrypto` / Graph config patterns for Fanpage tokens
- Agent auth (`canManageAgentConfig`, tenant `companyId`)
- Agent scheduler tick + `AgentJob` bridge (`publish_social`)
- Agent notification bridge (deduped eventKeys)
- Checkpoint / auth-block detection helpers (browser publisher)

---

## 3. Code removed / deprecated

| Item | Action |
|------|--------|
| MXH posts menu | Kept flag **false**; comments mark stub |
| Dashboard Publish queue | Labeled legacy stub |
| `FacebookPanel` | Header: DEPRECATED as publisher entry |
| Integrations mock channels | UI note: mock, not live publish channels |
| Graph inbound stack | **Kept** (not publishing) |

---

## 4. Domain / data model

Prisma models + migration `20260716090000_social_publishing`:

- `SocialChannel` — `facebook_profile` \| `facebook_page`, `executionMode` browser \| graph_api
- `SocialPostDraft` + `SocialPostMedia`
- `SocialPublishJob` — idempotencyKey unique, claim/retry fields
- `SocialPublishAuditLog`

Draft statuses: draft → pending_review → approved → scheduled → …  
Job statuses: queued → claimed → preparing → publishing → published \| failed \| cancelled \| needs_login \| needs_review  
Channel: active \| paused \| needs_login \| error \| disabled

---

## 5. Profile publisher

`FacebookProfileBrowserPublisher`:

- Uses worker-owned **publish** tab (`getPublishPage`), not scan tab, not user tab
- Auth check → composer → fill → media filechooser → publish → success heuristics
- `SOCIAL_PUBLISH_DRY_RUN=1` skips live click (CI / safe default)
- Timeout-after-click recovery helper (content fingerprint / success signals)

---

## 6. Fanpage publisher

- **Primary:** `FacebookPageGraphPublisher` — Graph `/{page-id}/feed` (+ photos via URL when public)
- **Optional:** `FacebookPageBrowserPublisher` when `executionMode=browser`
- Token from channel config / env; expired token → `graph_token_expired` → channel error / needs_login

---

## 7. Job / scheduler

1. Approve + schedule → `SocialPublishJob` queued (idempotency key `draftId:channelId:scheduledAtISO`)
2. Scheduler tick → enqueue `AgentJob` type `publish_social` (deduped)
3. Worker claims → channel lock → publisher → persist result / audit / notify
4. Daily cap (default 3/day), min spacing 120m, pause after 2 consecutive failures
5. Retry skips if already published / has externalPostId

---

## 8. Approval

Mandatory: draft → review → approve → schedule/publish-now.  
Mission/AI: `createAiGeneratedDraft` / `createMissionSocialDraft` → **pending_review only** (never auto-approve).

---

## 9. Idempotency

- Unique `idempotencyKey` on jobs
- Re-create same key returns existing job
- Retry checks published / result before republishing

---

## 10. Safety limits

Defaults in `DEFAULT_SAFETY_SETTINGS`: max 3/day/channel, spacing 120m, approval required, pause after 2 failures, duplicate window 14d, media jpeg/png/webp max 4 / 8MB.

---

## 11. Media

URL-based media on drafts; MIME/count/size validation. Browser filechooser path for local files; Graph photo via public URL. **No video** in MVP.

---

## 12. UI

Route: `/admin/agents/publishing` (+ `/drafts`, `/channels`, `/history`)

Sidebar under AI Agent:

- Lịch đăng bài
- Bản nháp
- Kênh đăng
- Lịch sử đăng

---

## 13. Mission integration

`server/modules/social-publishing/missionIntegration.ts` — draft-only helper. No auto-publish step in MVP.

---

## 14. Tests

```bash
npm run test:social-publishing
```

**58 passed / 0 skipped** (lifecycle, approval, schedule, cap, lock, duplicate, idempotency, media, retry, cancel, tenant, AI draft, notification keys, dry-run helpers).

Also: `npm run lint` (tsc), `npm run build`, `git diff --check` — OK after stopping worker lock on Prisma engine.

---

## 15. Manual smoke

| Check | Status |
|-------|--------|
| Migrate social tables | Done locally (tests used DB) |
| UI create channel / draft / schedule | Ready — needs operator |
| Profile real post + URL | **pending** (user approval) |
| Fanpage Graph real post + ID | **pending** (token + approval) |
| Retry no duplicate | Covered in unit/integration tests |
| Daily cap | Covered in tests |
| needs_login pause | Covered in tests |
| One publish tab reuse | Implemented; live proof pending |

---

## 16. Migration / deploy

1. `npx prisma migrate deploy`
2. Set env: page token for Fanpage; `SOCIAL_PUBLISH_DRY_RUN=0` only when ready
3. Restart CMS + agent worker
4. Create channels in UI; keep dry-run until first approved test post

---

## 17. Commits (planned on branch)

1. docs(publishing): audit legacy social publishing code ✅
2. feat(publishing): domain models, publishers, scheduler, worker
3. feat(ui): social publishing drafts / calendar / channels
4. test(publishing) + docs report

---

## 18. Limitations

- No group posting (by design)
- Live Facebook DOM may break; dry-run for CI
- Graph personal profile feed not supported (by Meta)
- Mission step not auto-wired into workflow engine (helper only)
- Media requires reachable URLs for Graph photos

---

## 19. Verdict

**SOCIAL PUBLISHING MVP PARTIAL**

Complete when operator confirms:

1. One personal-profile test post URL  
2. One Fanpage test post ID/URL  
3. Retry does not duplicate  
4. Worker uses single publish tab  

Until then: safe to merge as feature-flagged / dry-run module with full automated coverage.
