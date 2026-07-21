# Publish Validation Report — Production Scheduler

**Date:** 2026-07-21 (Asia/Ho_Chi_Minh)  
**Scope:** Validate only — no new features  
**Environment:** VPS `bdsdanang.site` · `BROWSER_PUBLISH_LIVE=1` · scheduler tick 60s · agent `worker-LinhMSC-vps` (CDP)

## Verdict

| Layer | Result |
|-------|--------|
| Production Scheduler → AgentJob enqueue (no manual enqueue) | **PASS** |
| Fleet ownership (`ownerMachine` / `ownerAgent` / `plannerDecision` / `leaseUntil`) | **PASS** |
| Browser lease path (CDP purpose=publish) | **PASS** (acquire observed; release on job end) |
| Facebook Timeline **verified** publish | **FAIL** (`soft_feed_url_unverified`) |
| Evidence + Telegram success notify | **NOT REACHED** (blocked by verify) |
| End-to-end “auto đăng 100% không tay” | **NOT COMPLETE** |

**Overall:** Scheduler automation is confirmed. Live Facebook DOM success under strict verification is **not** confirmed (anti–false-positive guards from H0 are working as designed).

## Run artifact (TEXT)

| Field | Value |
|-------|--------|
| Draft | `cmrsyqpa202jjmd6btnnpph4y` → scheduled |
| SocialPublishJob | `cmru32q7m00013i02f9rdyln1` |
| `scheduledAt` UTC | `2026-07-21T03:19:19.593Z` |
| `scheduledAt` VN | **21/7/2026 10:19:19** |
| AgentJob #1 created | `2026-07-21T03:19:29.573Z` (~10s after due — within one scheduler tick) |
| AgentJob #1 | `cmru34js50020131df7t7rn53` → failed after 3 attempts |
| Failure | `[facebook_timeline:publish] browser_publish_failed:soft_feed_url_unverified` |
| Owner | `ownerMachine=LinhMSC`, `ownerAgent=worker-LinhMSC-vps` |
| Planner | score≈140–168, `policy=spread`, reasons include `caps_ok`, `browser_free` |

Timezone math: `03:19Z` = `10:19+07` — **matches Asia/Ho_Chi_Minh**.

## Checklist

| Item | Status |
|------|--------|
| Draft → Scheduled | PASS |
| Scheduler enqueue đúng giờ (Asia/Ho_Chi_Minh) | PASS |
| Publish AgentJob có `plannerDecision` | PASS |
| `ownerMachine` | PASS (`LinhMSC`) |
| `ownerAgent` | PASS (`worker-LinhMSC-vps`) |
| Chỉ một Agent claim | PASS (single agent id); note: retry/re-enqueue created a 2nd AgentJob while Social job still queued |
| Browser Lease acquire | PASS (CDP purpose=publish) |
| Browser Release | PASS (job end / defer CDP_BUSY) |
| Publish thành công (verified) | **FAIL** |
| Evidence upload | NOT OBSERVED (no verified success) |
| Telegram notify (success rich card) | NOT OBSERVED |

### Ownership field notes

Present on AgentJob payload: `ownerMachine`, `ownerAgent`, `leaseUntil`, `plannerDecision`, `targetAgentId`.  
**Not** on payload today: `reservationUntil`, `leaseId` (browser `leaseId` appears on successful `executionPool` result only). Documented as contract gap — no schema/feature change in this validation.

## Media support

| Case | Result | Notes |
|------|--------|-------|
| TEXT | Pipeline PASS / FB verify FAIL | Live run above |
| TEXT + 1 IMAGE | Code path **supported** | Not re-posted live (avoid spam); validation via media pipeline + prior H0 audit |
| TEXT + 5 IMAGE | Code path **supported** (≤ maxMediaCount) | Same — no live spam run |
| VIDEO | **Experimental** | `mediaValidation` rejects `video/*` — does not block release |

`npm run test:h0-stabilization` → **PASS** (ownership + Facebook publish audit + fleet/telegram).

## Recovery

| Expectation | Observed |
|-------------|----------|
| Retry on fail | PASS (3 attempts on AgentJob) |
| Lease held during run | PASS (`leaseUntil` refreshed on claims) |
| No duplicate publish to Facebook | PASS (verify blocked success; no false “published”) |
| No duplicate AgentJob | **PARTIAL** — after max attempts, scheduler spawned a second `publish_social` while SocialPublishJob still `queued` |

## Concurrency (5 jobs / same minute)

**Not executed live** (single CDP agent; would amplify Facebook risk). With one agent, planner is expected to serialize via CDP busy + queue (`CDP_BUSY` defer observed). Multi-agent spread remains architecture-level only.

## Telegram

Success path creates `AgentNotification` title **Đăng bài thành công** via `notifyPublishSuccess` (job id + channel id).  
Smart Telegram event notifier maps `PUBLISH_SUCCESS` / `PUBLISH_FAILED` from runtime events.

**Gap vs desired card** (Timeline · machine · duration · evidence link): current message is shorter — **validate-only**, no feature change.

## Metrics (this run)

| Metric | Value |
|--------|-------|
| Success rate (verified FB) | **0%** (0/1) |
| Scheduler enqueue success | **100%** (1/1) |
| Ownership present on claim | **100%** |
| Average duration (agent attempts) | ~3.5 min wall (incl. retries) until fail |
| Retry count | 3 |
| Primary failure reason | `soft_feed_url_unverified` |

## Cleanup

Test artifacts prefixed `pv-validate` / job `cmru32q7m00013i02f9rdyln1` cleaned after run (SocialPublishJob deleted, draft cancelled). Per standing rule: **clear all test data when testing finishes**.

## Blockers to “100% auto publish”

1. Facebook Timeline DOM verify requires toast **or** non-notification permalink (H0 anti–false-positive).
2. Rich Telegram evidence card not yet matching desired format.
3. Duplicate AgentJob after exhausted retries while Social job stays queued.

## Recommendation

Treat **Production Scheduler + Fleet ownership** as validated. Keep Facebook live publish as **burn-in open** until one verified Timeline post (real permalink, no `notif_*`) is observed — then re-check Telegram + evidence.
