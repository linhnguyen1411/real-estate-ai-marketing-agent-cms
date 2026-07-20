# Browser Lifecycle (G1.5)

## Happy path

```
idle
  → lease(job) → leasing → active
  → heartbeat every ~10s (WorkerLoop tick)
  → job done → releasing → idle
  → clear sidecar
```

## Expire / reclaim

```
active
  → lastHeartbeat older than leaseTimeout (45s)
  → expired
  → reclaimStale → idle + release CDP lock
  → emit BROWSER_EXPIRED
```

## Crash recovery

```
Chrome crash / launch failure
  → markRecovering (purpose)
  → release CDP lock
  → OPS recover/restart: shutdown + launch
  → markRecovered → idle
  → emit BROWSER_RECOVERED / BROWSER_RESTARTED
```

## Agent death

```
runtimeAgentOffline
  → requeue claimed jobs
  → handleAgentOfflineBrowserOwnership
  → busy profiles → orphan events
  → soft recover command queued for next online
```

## PROFILE_LOCKED diagnosis

Managed Chrome OS lock still possible when two processes share a user-data-dir.

Error now includes sidecar ownership when present:

```
BROWSER_PROFILE_LOCKED: … | profile=… owner=LINH-PC · scan · job=… · active pid=… sidecar=12s ago
```

Mitigation: one Execution Agent per profile; prefer CDP attach when a managed worker already holds Chrome.

## Operator actions

| Action | Effect |
|--------|--------|
| Release | Soft release all purpose leases |
| Force Release | Same, explicit OPS force |
| Takeover | Clear leases so next job can acquire |
| Recover / Restart | Release + relaunch browser + recover handles |
| Screenshot / Refresh | Soft OPS / telemetry refresh |

Telegram: `/browser` · Admin: Runtime → Browser Pool.
