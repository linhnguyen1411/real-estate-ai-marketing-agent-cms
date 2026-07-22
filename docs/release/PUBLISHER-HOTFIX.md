# Publisher Hotfix (P0) — Facebook Stabilization

**Date:** 2026-07-22  
**Status:** Production hotfix  
**Commit message:** `fix(publisher): stabilize facebook publisher for production`

## Problems fixed

1. **Spam / multi-post** — retries and stale reclaim could click Đăng again after a successful post.
2. **Repeated caption text** — compose retries / re-type stacked text in the composer.
3. **Link preview steals image** — caption URL caused Facebook to prefer link preview over uploaded media.

## Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Exactly-once | `publishClicked` / `publishOutcome` persisted mid-flight; `shouldSkipRetry`; reclaim → `publish_verify_unknown` (no requeue) |
| Single editor insert | Focus → Ctrl+A → Delete → verify empty → insert once → read-back compare; `composeRetries=0` |
| Media first | Upload + thumbnail wait **before** caption |
| URL policy | `publishMode=media_first` (default): no URL in caption when media present; link deferred |
| Verify unknown | After click, unverified → `browser_verify_unknown` / terminal fail — **never republish** |
| Anti-dupe | Feed caption-hash check before Publish click |
| Trace | `[publish-trace]` events: AcquireLock…Permalink…Duration |

## Regression

```bash
npx tsx scripts/test-publisher-hotfix-regression.ts
npm run test:social-publishing
```

PASS criteria: 0 spam, 0 duplicate inserts, media_first URL strip, exactly-once skip on retry, 20/20 simulated publishes.

## Operator notes

- If job ends with `publish_verify_unknown` / `needsManualVerify`: **check Facebook manually**, do **not** force retry.
- Deferred links (when media present) are stored on job result as `deferredLinkUrl` for a future first-comment task.
- Env: `SOCIAL_PUBLISH_MODE=media_first` (default) or `legacy`.
