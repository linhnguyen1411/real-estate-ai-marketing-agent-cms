# Burn-in Checklist — v0.9.0 (H0.2 / H0.3)

## Pre-flight

- [x] Tag `v0.9.0-runtime-stable` present
- [ ] DB backup completed (`pg_dump` — strip `?schema=` from URL if needed)
- [x] `.env` backup completed (`/var/backups/real-estate-ai-cms/h0-v0.9.0/`)
- [x] Health `status=success`
- [x] `scheduler.enabled=true` and `running=true`
- [x] Gemini key present (or intended provider OK)
- [x] `automation-agent` online (fleet heartbeat) — **CDP mode only**
- [x] `BROWSER_PUBLISH_LIVE=1` on VPS
- [x] Only one execution process (no parallel `agent-worker` + `automation-agent`)

## Publish E2E (no manual trigger after schedule)

- [x] Draft created
- [x] Draft **Approved**
- [x] Draft **Scheduled**
- [x] Wait for VPS scheduler tick (≤60s after due) / enqueue due
- [x] `SocialPublishJob` → `queued` then claimed
- [x] `AgentJob` `publish_social` created
- [x] Placement decision recorded (`JOB_CLAIMED` payload / `plannerDecision`)
- [x] Ownership: `ownerAgent`, `ownerMachine`, `leaseUntil` set
- [x] Browser lease acquired (purpose=publish)
- [x] Facebook Timeline **or** Group post visible (Timeline confirmed 2026-07-21)
- [x] Evidence / result permalink present
- [x] Job **completed** / draft published
- [ ] Telegram or ops report shows success (if configured)

## Fleet / Lease

- [ ] `/fleet planner` shows decisions
- [ ] Second agent cannot claim owned job while `leaseUntil` valid
- [ ] After fail+requeue, ownership cleared → reassign possible
- [ ] Browser panel shows owner / TTL (not only Locked)

## Negative / safety

- [x] Video MIME rejected with Experimental message
- [ ] Drain mode blocks new claims
- [x] No Graph publish unless explicitly flagged

## Known H0 ops notes

- Hydrate `dryRun` is controlled by **VPS** `BROWSER_PUBLISH_LIVE` (not agent-local alone).
- Channel Admin `profileUrl` must hydrate into `destinationConfig` (bugfixed).
- Facebook Group soft-verify improved; Timeline used for primary burn-in proof.

## Sign-off

| Role | Name | Date |
|------|------|------|
| Operator | | 2026-07-21 |
| Owner | | |

**Burn-in window:** recommend ≥2 hours with scheduler on + ≥1 scheduled publish success (**1 live Timeline publish confirmed**).
