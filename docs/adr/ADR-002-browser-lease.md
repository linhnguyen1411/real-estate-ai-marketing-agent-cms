# ADR-002 — Browser Lease

## Problem

Browser profiles/CDP sessions are scarce and unsafe to share. Concurrent publishers or scanners fighting one profile cause flaky posts and session corruption.

## Alternatives

1. **Global shared browser** — one profile for everything.  
2. **Browser Lease** — exclusive time-bounded lease per workload; release/recover on finish/fail.  
3. **Always new ephemeral browser** — max isolation, high cold-start cost.

## Decision

Use **Browser Lease**: ownership is explicit, expired leases are recoverable, and publish/scan paths must acquire before use. Lease logic is a **Protected Runtime/Browser** concern.

## Consequences

- Positive: Safer concurrency; clearer ops debugging (“who holds the browser”).  
- Negative: Features must not invent side-channel browser access.  
- Follow-ups: Unrelated features compose via jobs/APIs — do not patch lease cores without Runtime Impact.
