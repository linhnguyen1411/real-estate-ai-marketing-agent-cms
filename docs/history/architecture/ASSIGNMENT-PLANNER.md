# Assignment Planner (G2)

## Soft claim plan

```
candidates (SKIP LOCKED)
  → score each for polling agent
  → drop ineligible
  → anti-steal vs better idle peers
  → pick highest score
  → short reservation (15s)
  → caller UPDATEs claim
```

## Reservation

In-memory TTL (~15s). If agent never claims, reservation expires → reassign eligible.

## Cooldown

Repeated failures → exponential cooldown; planner skips job until TTL ends.

## Observability

Each decision stores:

- chosen job / score / breakdown  
- rejected jobs + reasons  
- policy mode  

Telegram: `/fleet planner`  
Report: `/report fleet` → `plannerLines`  
Events: `JOB_CLAIMED.payload.placement`

## Rejection learning

Capability / browser failures on release → `onClaimRejection` + cooldown so the same agent does not thrash the same job.
