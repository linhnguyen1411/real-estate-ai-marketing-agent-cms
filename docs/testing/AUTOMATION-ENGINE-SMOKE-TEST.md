# Automation Engine V1 — Production Smoke Test

**Date:** 2026-07-18  
**Mode:** LIVE (BROWSER_PUBLISH_LIVE=1) — stopped mid-run to protect Facebook account  
**Result:** SMOKE TEST FAILED

## Verdict

Partial LIVE proof only. **Do not re-run LIVE** until Facebook account risk cools down.

| Test | Result | Notes |
|------|--------|-------|
| T1 Timeline Publish | PASS (prior LIVE runs) | Draft → Approve → Publish Now → MissionRun → AgentJob → Worker → FB Timeline → published + evidence |
| T2 Group Publish | PASS (prior LIVE runs) | Group post OK; timeline unaffected; retry idempotent (`already_published`); evidence + permalink |
| T3 Multi-destination Campaign | FAIL / incomplete | 2/3 destinations published; bad dest stuck then fixed (`channel_paused` non-retryable). Run aborted to stop spam |
| T4 UI | PASS | Lazy modules present; no blank-page host without Suspense |
| T5 Recovery | NOT RUN | Aborted — kill-worker recovery would publish again |

## Bugs found & fixed (root-cause only)

1. **False publish success** — `publishSocialHandler` completed jobs even when workflow `stopped` / `stepsFailed > 0` → now fails with `browser_publish_failed`.
2. **Evidence incomplete** — capture step now copies screenshot/HTML paths into manifest bundle.
3. **Orphan agent jobs** — worker boot `reclaimOrphanedAgentJobs()` after hard kill.
4. **CDP lock leak** — cleanup still runs on `stop_workflow`; handler `finally` releases CDP lock.
5. **FB create-post UI** — composer flow uses **Tiếp (Next)** before **Đăng/Post**; selectors + `DomPublisher` / `DomNavigator` / `DomEditor` updated.
6. **Campaign progress stale** — `completePublishJob` / `failPublishJob` sync campaign targets.
7. **Infinite requeue after channel pause** — `channel_paused` (and related safety codes) are non-retryable terminal failures.
8. **LIVE spam guard** — smoke script requires `SMOKE_CONFIRM_LIVE=1` with `BROWSER_PUBLISH_LIVE=1`.

## Architecture path verified (T1/T2)

```
Draft → Approve → Publish Now / CampaignRun → MissionRun → AgentJob(publish_social)
  → Worker → Browser Runtime → Destination Adapter → Evidence
```

## How to re-run (later, carefully)

Architecture / dry-run (default — **no real posts**):

```bash
npx tsx scripts/smoke-automation-engine-v1.ts
```

LIVE (explicit ack only — real Facebook posts):

```powershell
$env:BROWSER_PUBLISH_LIVE='1'
$env:SMOKE_CONFIRM_LIVE='1'
$env:SMOKE_SKIP_RECOVERY='1'   # recommended until account is safe
npx tsx scripts/smoke-automation-engine-v1.ts
```

## Scope

No Automation Engine / Mission / Worker architecture refactor. Bugfixes only.

## Notes

- Multiple LIVE attempts during debugging posted repeatedly to Timeline/Groups — account risk. Worker + smoke processes were killed; queued publish jobs cancelled.
- Future LIVE smoke must use `SMOKE_CONFIRM_LIVE=1` and preferably skip recovery / limit destinations.
