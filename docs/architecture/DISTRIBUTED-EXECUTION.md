# Distributed Execution

## Topology

```
┌─────────────────┐     Runtime API      ┌──────────────────┐
│  VPS CMS        │ ◄──────────────────► │  LINH-PC Worker  │
│  PostgreSQL     │   claim / complete   │  CDP Chrome      │
│  Scheduler      │   hydrated payload   │  no database     │
└─────────────────┘                      └──────────────────┘
```

## Why G1

Jobs on VPS carried `sourceId` only. Remote worker queried **local** Prisma → `SOURCE_REMOVED`. Fix is architectural: **hydrate at claim**, not sync IDs or shared `DATABASE_URL`.

## Joining the fleet

1. `npm run automation-agent` with `AGENT_RUNTIME_URL` + token
2. `.\scripts\fleet\start-cdp-chrome.ps1` for Facebook
3. No Prisma, migration, or seed on worker machine

## Multi-worker

- Claim uses PostgreSQL `SKIP LOCKED` on CMS
- Capability filter: `scan`, `publish`, `cdp`
- Evidence applied once on `completeJob`

## PC / Laptop / Mini PC / Docker / Cloud VM

Any node with Chrome CDP + network to CMS can execute. Control Plane owns business state.
