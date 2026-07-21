# Publish Burn-in — Production Scheduler

Companion to `PUBLISH-VALIDATION.md`. Operator checklist for ongoing burn-in after v0.9.

## Pre-flight (every burn-in)

- [ ] `BROWSER_PUBLISH_LIVE=1` on VPS; PM2 restarted with env
- [ ] Health: scheduler `enabled=true` + `running=true`
- [ ] Exactly one execution process: `automation-agent` CDP (`AGENT_BROWSER_MODE=cdp`)
- [ ] Chrome CDP `http://127.0.0.1:9222` logged into target Facebook account
- [ ] Do **not** run `agent-worker` in parallel
- [ ] Channel `profileUrl` / `config.groupUrl` populated

## Happy path (no manual enqueue)

1. Operator: Draft → Approve → Schedule (datetime-local on VN machine → Instant OK)
2. Wait until `scheduledAt` (Asia/Ho_Chi_Minh) + ≤60s scheduler tick
3. Confirm `AgentJob` `publish_social` created with `triggeredBy=social_publish_scheduler`
4. Confirm payload: `ownerMachine`, `ownerAgent`, `leaseUntil`, `plannerDecision`
5. Confirm single `claimedBy` agent id
6. Confirm browser lease purpose=`publish`
7. Confirm SocialPublishJob → **published** with **non-notification** permalink
8. Confirm draft → published
9. Confirm Telegram / AgentNotification success
10. **Clear all test drafts/jobs** after burn-in

## Pass criteria (strict)

- Permalink must **not** contain `notif_id`, `notif_t`, `ref=notif`, `feedback_reaction`
- Reject `soft_feed_url` / `soft_feed_url_unverified` as success
- Video MIME rejected = expected Experimental

## Failure handling

- Agent retries up to `maxAttempts`
- On verify fail, job must **not** mark SocialPublishJob published
- After burn-in: delete/cancel test `SocialPublishJob` + related `AgentJob` + mark test drafts cancelled

## Concurrency smoke (optional)

Schedule 5 text drafts same minute on Timeline **only** if operator accepts FB spam risk. Expect serialize on one CDP agent (`CDP_BUSY` defer). Abort if duplicate published posts appear.

## Sign-off

| Window | Operator | Scheduler PASS | Verified FB PASS | Notes |
|--------|----------|----------------|------------------|-------|
| 2026-07-21 | Auto validation | YES | NO | `soft_feed_url_unverified` |
| | | | | |
