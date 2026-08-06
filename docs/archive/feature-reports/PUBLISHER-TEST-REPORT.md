# Publisher Test Report

**Date:** 2026-07-16  
**Command:** `npm run test:social-publishing` (alias `npm run test:publisher-production`)

## Result

| Metric | Value |
|--------|-------|
| Passed | **88** |
| Skipped | **0** |
| Failed | **0** |
| Migration | `20260716110000_social_publish_production` applied locally |
| Lint (`tsc --noEmit`) | Run in commit gate |
| Build | Vite + esbuild server |

## Coverage map

| Scenario | Status |
|----------|--------|
| Publish success shape (facebookPostId, latencyMs, sanitized request) | PASS |
| Publish failed / mapGraphApiError | PASS |
| Retry exponential backoff (`computeBackoffMs`) | PASS |
| Duplicate / shouldSkipRetry | PASS |
| Expired token (190) | PASS |
| Permission denied (10/200) | PASS |
| Scheduler enqueue-only (creates AgentJob, no publisher call) | PASS |
| Worker claim + channel lock | PASS |
| Timeout → `publish_timeout` | PASS |
| sanitizeGraphPayload redacts tokens | PASS |
| Multi-image / video → media_invalid | PASS |
| Manual retry resets attempts | PASS |
| Draft lifecycle + approval + idempotency + tenant | PASS |
| Mission AI draft no auto-approve | PASS |

## Not covered here (manual / live)

- Live Graph POST to a real Fanpage
- Live token refresh against Meta OAuth UI
- Browser profile composer against real Facebook DOM

## Regression note

Publisher tests do not invoke Scanner or Mission workflow engines.
