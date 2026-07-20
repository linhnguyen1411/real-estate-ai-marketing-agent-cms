# Browser Lease Manager (G1.5)

Browser profiles are **managed resources** with explicit ownership, lease TTL, and reclaim — not opaque `LOCKED` flags.

## Model

```
Browser Profile
  ↓ Lease
  ↓ Owner (machine · agent · worker · mission · job)
  ↓ Heartbeat (10s)
  ↓ Release | Expire | Reclaim | Takeover
```

## Lease info

| Field | Meaning |
|-------|---------|
| `browserId` | Logical handle id (`browser_scan_1`, …) |
| `profileName` | Chrome user-data path / profile label |
| `machineId` / `agentId` / `workerId` | Execution node identity |
| `missionRunId` / `jobId` | Current work |
| `purpose` | `scan` \| `publish` \| `messaging` \| `comment` |
| `createdAt` / `lastHeartbeat` | Lease clocks |
| `leaseTimeoutMs` | TTL (default **45s**, range 30–60s) |
| `state` | Lifecycle (below) |

## States

`idle` → `leasing` → `active` → `releasing` → `idle`

Failure / recovery paths:

- `expired` — heartbeat missed beyond TTL
- `orphan` — agent offline while lease still busy (Control Plane)
- `recovering` — crash / restart in progress

## Heartbeat & TTL

| Knob | Default |
|------|---------|
| Lease heartbeat | 10s (WorkerLoop / OPS refresh) |
| Lease timeout | 45s |

On timeout: `expired` → `reclaimStale()` → idle → another agent may lease. **No CMS restart.**

## Ownership surfaces

- **Runtime snapshot** — `browserPool[]` includes owner, lease id, TTL remaining
- **Fleet / Telegram `/browser`** — Owner · Mission · Job · Locked · Heartbeat · TTL
- **Admin Runtime Browser Pool** — Owner · Lease · TTL · Mission · Job · Heartbeat
- **Sidecar** — `{profileDir}.cms-lease.json` diagnoses `BROWSER_PROFILE_LOCKED`

## Manual OPS (Event Bus → heartbeat)

`release` · `force` · `takeover` · `recover` · `restart` · `screenshot`

## Events

`BROWSER_LEASED` · `BROWSER_HEARTBEAT` · `BROWSER_RELEASED` · `BROWSER_EXPIRED` · `BROWSER_RECOVERED` · `BROWSER_TAKEOVER` · `BROWSER_RESTARTED` · `BROWSER_CRASH`

## Code map

| Layer | Path |
|-------|------|
| Lease Manager | `server/agent-worker/runtime/browserLeaseManager.ts` |
| Browser Pool | `server/agent-worker/runtime/browserPool.ts` |
| Sidecar | `server/agent-worker/runtime/profileLeaseSidecar.ts` |
| Control Plane ownership | `server/modules/control-plane/browser-ownership/` |
| Remote OPS | `telemetry/remoteControl.ts` + `automation-agent` handlers |

## Out of scope

Scanner / Publisher / Mission Runtime / Queue / Scheduler business logic — unchanged.
