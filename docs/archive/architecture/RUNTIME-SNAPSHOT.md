# Runtime Snapshot

## Contract

`ExecutionAgentRuntimeSnapshot` (`TELEMETRY_SCHEMA_VERSION = 1`) is the shared runtime state document for one Execution Agent.

Produced by:

1. Agent `buildExecutionTelemetryMetadata(...)` on heartbeat
2. Control Plane `normalizeRuntimeSnapshot(...)` on ingest
3. Stored as last-known snapshot in Telemetry Collector (in-memory)

## Shape (summary)

```ts
{
  schemaVersion: 1,
  agentId, hostname, version, platform, status, heartbeatAt, uptimeSec,
  host: { platform, arch, hostname, uptimeSec, loadAvg1m, mem*, disk* },
  process: { pid, rssMb, heapUsedMb, heapTotalMb, uptimeSec },
  chromeCount,
  browserProfiles: [{ profile, state, facebookAccount, currentUrl, currentAction,
                      currentMission, busy, lockedBy, runningSec }],
  executionSlots: [...],
  jobs: { running, waiting, completed?, failed?, retry?, currentStep?, progress?, etaSec?, owners },
  mission?: { missionName, missionType, currentStep, progress, durationSec, findingCount },
  publish?: { draftId, destination, phase, evidence, publishedUrl, retryCount },
  scanner?: { currentSource, currentGroup, postsScanned, postsRemaining, findings, currentKeyword },
  currentUrl?,
  slotUtilization?, browserUtilization?
}
```

## Snapshot vs Event

| Mode | When | Use |
|------|------|-----|
| **Snapshot** | Every heartbeat / register | Poll-free dashboards, `/agent`, `/runtime`, `/browser` |
| **Event** | Lifecycle transitions | Telegram smart alerts, audit |

Do not emit `AGENT_ONLINE`-style noise on every heartbeat. Update the snapshot only.

## Consumers

All clients should read snapshots through Control Plane / Runtime API — not Prisma, not CDP:

- Telegram Ops Center
- Future: Fleet dashboard, Web Ops, Mobile, Discord, Slack

## Delivery of remote commands

Heartbeat response may include:

```json
{ "opsCommands": [{ "id": "ops_…", "action": "release_browser", "requestedAt": "…" }] }
```

Agent drains and applies; Control Plane clears the queue (`drainRemoteCommands`).
