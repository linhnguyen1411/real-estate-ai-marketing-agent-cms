# ADR-001 — Stateless Execution

## Problem

Long-lived worker/browser sessions make horizontal scaling, recovery, and multi-machine Fleet placement fragile. Failures leave sticky state that is hard to reason about.

## Alternatives

1. **Sticky stateful workers** — keep browser + job affinity forever on one machine.  
2. **Stateless execution** — jobs carry intent/idempotency; workers claim, execute, release; leases are time-bounded.  
3. **Hybrid** — sticky only for interactive human sessions; jobs remain claim-based.

## Decision

Adopt **stateless (claim-based) execution** for agent jobs and publish/scan work: workers are replaceable; correctness relies on job status, idempotency keys, and leases — not on immortal process memory.

## Consequences

- Positive: Fleet can place/drain; retries are explicit; traces map to job/campaign ids.  
- Negative: Requires careful idempotency and lease expiry handling.  
- Follow-ups: Keep Publisher/Scanner Runtime changes behind explicit missions; never bypass job SSOT for “convenience”.
