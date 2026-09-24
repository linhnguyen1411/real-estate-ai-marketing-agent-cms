# Execution Agent

**Date:** 2026-07-18  
**Status:** EXECUTION AGENT COMPLETE  
**Commit intent:** `feat(agent): introduce execution agent runtime`

## Goal

Tách **Browser Runtime** khỏi CMS.

| Role | Process |
|------|---------|
| **Control Plane** | CMS (`server.ts`) — Mission · enqueue · Runtime · Agent registry · Health |
| **Execution Node** | `automation-agent` — register · heartbeat · poll · claim · execute · report |

CMS **không** chạy Browser trong mô hình mục tiêu.  
Execution Agent **không** chứa business logic Scanner/Publisher.

## Run

```bash
# Control Plane (CMS)
npm run dev

# Execution Agent (separate process)
npm run automation-agent
```

Env:

| Variable | Meaning |
|----------|---------|
| `AGENT_RUNTIME_URL` | CMS base URL (default `http://127.0.0.1:3000`) |
| `AGENT_RUNTIME_TOKEN` | Shared bearer token for Runtime Agent API |
| `AGENT_WORKER_ID` | agentId |
| `AGENT_CAPABILITIES` | e.g. `scan,publish,browser` |
| `AGENT_BROWSER_MODE` / profile / CDP | same as legacy worker |

Legacy `npm run agent:worker` vẫn chạy (DB-direct) để tương thích.

## Architecture

```
CMS Control Plane
  POST /api/agent/runtime/register
  POST /api/agent/runtime/heartbeat
  POST /api/agent/runtime/offline
  POST /api/agent/runtime/jobs/claim
  POST /api/agent/runtime/jobs/:id/complete|release|requeue
  POST /api/agent/runtime/jobs/reclaim
        ▲
        │ HTTP only (no agent → Prisma)
        │
Execution Agent process
  RuntimeAgentClient
  HttpJobQueuePort ──► WorkerLoop (orchestration)
  HttpAgentHeartbeat
  ExecutionPool (in-process)
  BrowserPool (in-process)
  JobHandlerRegistry (adapters → existing scan/publish handlers)
```

Selection chain (unchanged pools):

**Agent → Slot → Browser → Workflow → Mission**

## Design rules

| Rule | How |
|------|-----|
| DRY | Reuse `WorkerLoop`, `ExecutionPool`, `BrowserPool`, `jobClaimer` via ports |
| SOLID / DI | `JobQueuePort`, `JobHandlerRegistry` injected into `WorkerLoop` |
| Registry + Adapter | Handlers registered by type — **no switch-case dispatch** |
| No global singleton | Ports constructed per process |
| No duplicate workflow | Existing Mission / scan / publish modules unchanged |
| Runtime = orchestration | Agent loop only claims/leases/executes/reports |

## Capabilities

Agent chỉ claim job phù hợp:

| Job type | Capability |
|----------|------------|
| `scan_source` / `visit_url` | `scan` |
| `publish_social` | `publish` |
| messaging / comment | `messaging` / `comment` |
| `health_check` | any |

## Recovery

| Event | Action |
|-------|--------|
| Agent offline | `POST .../offline` → mark session offline · requeue claimed/running jobs |
| Agent boot | `POST .../jobs/reclaim` · register · resume poll |
| Slot/browser | release on job end / shutdown (existing pools) |

## What did NOT change

- Mission Engine · Automation Engine · Scanner · Publisher · Queue · Scheduler
- Existing admin GETs (`/api/agent/runtime`, UI)
- Execution Pool / Browser Pool algorithms

## Module map

```
server/automation-agent/
  index.ts
  runtimeClient.ts
  httpJobQueue.ts
  httpHeartbeat.ts

server/modules/control-plane/
  runtimeAgentRoutes.ts
  runtimeAgentService.ts

server/agent-worker/
  ports.ts              JobQueuePort + JobHandlerRegistry
  prismaJobQueue.ts
  defaultHandlers.ts
  workerLoop.ts         DI-aware (backward compatible defaults)
```

## Tests

```
npm run test:execution-agent
npm run test:control-plane
npm run test:mission-engine
npm run test:social-publishing
npm run lint
```

## Note on execute + DB

Control-plane ops (register/claim/complete) đi qua Runtime API — agent process **không** gọi Prisma cho queue/heartbeat.

Handlers scan/publish vẫn persistence qua modules hiện có (business logic giữ nguyên). Persistence HTTP-fenced là phase sau nếu cần “zero CMS import” tuyệt đối trong data path.
