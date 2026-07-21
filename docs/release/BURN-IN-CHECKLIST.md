# Burn-in Checklist — v0.9.0 (H0.2 / H0.3)

## Pre-flight

- [ ] Tag `v0.9.0-runtime-stable` present
- [ ] DB backup completed
- [ ] `.env` backup completed
- [ ] Health `status=success`
- [ ] `scheduler.enabled=true` and `running=true`
- [ ] Gemini key present (or intended provider OK)
- [ ] `automation-agent` online (fleet heartbeat)

## Publish E2E (no manual trigger after schedule)

- [ ] Draft created
- [ ] Draft **Approved**
- [ ] Draft **Scheduled** (future `scheduledAt`)
- [ ] Wait for VPS scheduler tick (≤60s after due)
- [ ] `SocialPublishJob` → `queued` then claimed
- [ ] `AgentJob` `publish_social` created
- [ ] Placement decision recorded (`JOB_CLAIMED` payload / `plannerDecision`)
- [ ] Ownership: `ownerAgent`, `ownerMachine`, `leaseUntil` set
- [ ] Browser lease acquired (purpose=publish)
- [ ] Facebook Timeline **or** Group post visible
- [ ] Evidence folder / API evidence present
- [ ] Job **completed** / draft published
- [ ] Telegram or ops report shows success (if configured)

## Fleet / Lease

- [ ] `/fleet planner` shows decisions
- [ ] Second agent cannot claim owned job while `leaseUntil` valid
- [ ] After fail+requeue, ownership cleared → reassign possible
- [ ] Browser panel shows owner / TTL (not only Locked)

## Negative / safety

- [ ] Video MIME rejected with Experimental message
- [ ] Drain mode blocks new claims
- [ ] No Graph publish unless explicitly flagged

## Sign-off

| Role | Name | Date |
|------|------|------|
| Operator | | |
| Owner | | |

**Burn-in window:** recommend ≥2 hours with scheduler on + ≥1 scheduled publish success.
