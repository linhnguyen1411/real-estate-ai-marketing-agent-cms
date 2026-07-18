# Publisher Production Report

**Branch:** `feature/facebook-auto-publishing`  
**Date:** 2026-07-16  
**Phase:** P1 — Facebook Publisher Production Core

## Verdict

### **PUBLISHER PRODUCTION READY** (Facebook Page + Graph API)

Code path is complete for:

**Draft → Queue → Claim → Publishing → Facebook Page → Published → Publish Log (attempts)**

Automated proof: **88/88** tests including DB claim/lock/scheduler/retry.

**Operational gate (not a code blocker):** first live Fanpage post needs a connected Page token and explicit operator approval. Until that smoke, keep `SOCIAL_PUBLISH_DRY_RUN` unset for Graph (Graph path does not use dry-run) and only publish approved test content.

Profile browser publishing remains available but is **not** the production gate for this phase.

---

## Flow (production)

1. Create `facebook_page` channel (`executionMode=graph_api`)
2. **Connect** Page Access Token (UI or API) → optional long-lived exchange
3. **Test** → `connectionState`: connected | disconnected | expired | permission_error
4. Create draft → submit review → approve
5. **Publish Now** or Schedule → `SocialPublishJob` queued + `AgentJob publish_social` enqueued immediately if due
6. Scheduler tick: reclaim stale locks + enqueue due jobs only (never publishes)
7. Worker: claim → preparing → publishing → Graph feed/photo → complete
8. Persist attempt log + job result (`facebookPostId`, URL, request/response sanitized, latency)
9. CMS **Logs** shows attempts; **View Facebook Post** on queue/history

---

## Phases delivered

| Phase | Deliverable |
|-------|-------------|
| 1 Connection | Graph client, debug_token, connect/exchange, permission map, UI badges |
| 2 Engine | Lock, reclaim, idempotency, retry+backoff, timeout, publish-now enqueue |
| 3 Facebook Page | Text, text+image (single HTTPS), link; structured result |
| 4 Publish log | `SocialPublishAttempt` + CMS Logs |
| 5 Scheduler | Enqueue-only (verified) |
| 6 UI | Draft / Queue / Channels / Logs / Calendar-queue |
| 7 Tests | 88 assertions |

---

## Key files

- `server/modules/social-publishing/graph/facebookGraphClient.ts`
- `server/modules/social-publishing/attemptService.ts`
- `server/modules/social-publishing/publishers/facebookPageGraphPublisher.ts`
- `server/modules/social-publishing/jobService.ts`
- `server/modules/social-publishing/worker/publishSocialHandler.ts`
- `server/modules/social-publishing/channelService.ts`
- `prisma/migrations/20260716110000_social_publish_production/`
- `src/features/agent/social-publishing/**`
- Docs: `PUBLISHER-GAP-CLOSED.md`, `PUBLISHER-TEST-REPORT.md`

---

## Env

- `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_ACCESS_TOKEN` (fallback)
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (debug_token + long-lived exchange)
- `FACEBOOK_TOKEN_ENCRYPTION_KEY` (encrypt tokens at rest)
- `SOCIAL_PUBLISH_TIMEOUT_MS` (default 90000)

---

## Out of scope (by design)

AI generate, Campaign, Groups, Marketplace, Threads, TikTok, Zalo, Analytics, Mission/Scanner changes.

---

## Commits (this phase)

See git log on branch for `feat(publisher)`, `test(publisher)`, `docs(publisher)`.
