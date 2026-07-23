# Stateless Execution Agent (G1)

Execution Agent (`npm run automation-agent`) is a **stateless worker**: Runtime API + Browser only.

## Boundary

| Layer | Responsibility |
|-------|----------------|
| Control Plane (CMS) | Scheduler, enqueue, **hydrate job payload**, apply evidence on complete |
| Execution Agent | Claim → execute → browser → return evidence |
| Production DB | Lives on CMS only |

## Forbidden on worker

- `DATABASE_URL`
- Prisma / repositories
- `assertAgentSourceActiveForScan`
- Mission / source DB reads

## Required env (worker)

```env
EXECUTION_AGENT_STATELESS=1
AGENT_RUNTIME_URL=https://bdsdanang.site
AGENT_RUNTIME_TOKEN=...
AGENT_CDP_ENDPOINT=http://127.0.0.1:9222
```

## Flow

```
Scheduler → AgentJob (IDs)
     ↓
Claim (Runtime API) → hydrate payload.execution
     ↓
automation-agent → scan/publish handler reads payload only
     ↓
Evidence in result → CMS applyExecutionEvidence → complete
```

## Backward compatibility

Legacy jobs with `{ sourceId }` only are hydrated **at claim** on CMS. Worker never hydrates.

Legacy `agent:worker` (local Prisma queue) unchanged — uses DB fallback in `resolveScanExecutionContext`.

## Verdict

**STATELESS EXECUTION AGENT COMPLETE** when worker runs without `DATABASE_URL` and remote fleet claims hydrated jobs.
