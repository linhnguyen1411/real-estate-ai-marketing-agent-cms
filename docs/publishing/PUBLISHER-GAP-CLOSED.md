# Publisher Gap Closed

**Branch:** `feature/facebook-auto-publishing`  
**Date:** 2026-07-16  
**Phase:** P1 Facebook Publisher Production Core

| Gap ID | Severity | Gap | Closure |
|--------|----------|-----|---------|
| G1.1 | HIGH | Ad-hoc Graph fetch | `graph/facebookGraphClient.ts` — shared `graphFetch`, feed/photos, debug_token |
| G1.2 | BLOCKER | No long-lived token handling | `connectPageToken` + optional `fb_exchange_token`; store `tokenExpiresAt` |
| G1.3 | HIGH | Expiry only reactive | `debugToken` on verify; map code 190 → expired |
| G1.4 | BLOCKER | No reconnect | `POST /api/social/channels/:id/connect` + Channels UI Connect/Reconnect |
| G1.5 | BLOCKER | No publish permission check | Scope check `pages_manage_posts`; map 10/200 → `graph_permission_denied` |
| G1.6 | HIGH | No connection badges | UI: Connected / Disconnected / Expired / Permission Error via `connectionState` |
| G2.1 | MED | Skip claimed/preparing | Handler: claim → preparing → publishing |
| G2.2 | BLOCKER | Stuck lock | `reclaimStalePublishJobs` (10m lease) on scheduler tick |
| G2.3 | HIGH | Double-post risk | Idempotency key + skip if `externalPostId`; attempt log before complete |
| G2.4 | MED | Manual retry attempts | `retryJob` resets `attempts` to 0 |
| G2.5 | BLOCKER | No timeout | `AbortSignal` + worker `Promise.race` (`SOCIAL_PUBLISH_TIMEOUT_MS`, default 90s) |
| G2.6 | HIGH | Publish Now waits cron | Immediate `enqueueAgentJobForPublishJob` when due |
| G3.1 | HIGH | Silent media drop | Single HTTPS image → photos; multi/video → `media_invalid`; else feed+link |
| G3.2 | BLOCKER | No structured attempt | `SocialPublishAttempt` + result fields (postId/url/request/response/latency) |
| G4.1–4.2 | HIGH | Thin logs | Attempts API + History/Logs UI |
| G5 | — | Scheduler publish | Already enqueue-only — verified |
| G6 | HIGH | UI gaps | Connect, Logs attempts, View Facebook Post on queue |
| G7 | HIGH | Missing tests | 88 assertions incl. success/fail/retry/dup/expired/perm/scheduler/claim |

## Remaining operational gates (not code gaps)

1. Operator must paste/connect a valid **Page Access Token** with `pages_manage_posts`.
2. First **live** Facebook post requires explicit approval (not run in this phase).
3. Profile browser publisher remains secondary; production path for this phase is **Facebook Page + Graph API**.
