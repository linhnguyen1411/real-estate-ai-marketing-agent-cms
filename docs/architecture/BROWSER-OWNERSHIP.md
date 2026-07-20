# Browser Ownership (G1.5)

## Problem

Previously the runtime only knew **LOCKED**. Operators could not answer:

- Who holds the browser?
- Since when?
- Which mission / job?
- Is the holder alive?
- Can we takeover?

`BROWSER_PROFILE_LOCKED` was an OS-level Chrome lock with **no ownership trail**.

## Ownership chain

```
LINH-PC
  → automation-agent (worker-LinhMSC)
    → Browser facebook-main
      → Mission Buyer Scan
        → Job cmxxxx
          → state=active · locked 12m · heartbeat 3s · TTL 40s
```

## Sources of truth

1. **In-process Lease Manager** on the Execution Agent (authoritative while agent is online)
2. **Runtime Snapshot** via heartbeat metadata (`browserPool`)
3. **Control Plane ownership view** from warm snapshots (`listBrowserOwnership`)
4. **Profile sidecar** `.cms-lease.json` for OS-lock diagnostics

## Orphan detection

```
Agent Offline
  + last snapshot still busy
    → Orphan
    → BROWSER_EXPIRED (reason=agent_offline)
    → auto enqueue recover_browser / restart_browser
```

## Takeover

```
Lease expired | orphan
  → Browser Pool reclaim
  → Another agent (or same agent after recover) acquires lease
```

No operator required for TTL reclaim. Manual takeover via `/browser takeover [agentId]`.

## Audit

Lease lifecycle events land on `AgentRuntimeEvent` (`BROWSER_*`). Ownership audit buffer records orphan / recover / release / takeover actions in Control Plane memory for ops inspection.
