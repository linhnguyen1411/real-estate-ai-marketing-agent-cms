# Control Plane

**Date:** 2026-07-18  
**Status:** CONTROL PLANE COMPLETE  
**Commit intent:** `feat(control-plane): introduce agent registry and runtime control plane`

## Goal

Nâng Automation Engine thành **Control Plane** — quan sát + điều khiển từ xa.

Reuse toàn bộ:

- Mission Engine
- Execution Pool
- Browser Pool
- Runtime API
- Runtime Monitor

**Không** rewrite / duplicate / đổi business logic Scanner · Publisher · Mission Runtime.

## Architecture

```
Clients (Web Dashboard · Telegram · CLI · Report Engine)
        │
        ▼
   Control Plane  ─── sole read/write console surface
        │
        ├── Agent Registry   (BrowserSession + heartbeat metadata)
        ├── Runtime API      (buildAutomationRuntimeSnapshot + agents + events)
        ├── Runtime Event Bus (AgentRuntimeEvent append-only)
        └── Report Engine    (projections from Runtime API)
        │
        ▼
   Existing runtimes (unchanged)
        Mission Engine · AgentJob queue · Worker / Execution Pool · Browser Pool
```

## Agent Registry

Mỗi Agent = **Execution Node** (không phải process mới).

| Field | Source |
|-------|--------|
| agentId | `workerId` / metadata.agentId |
| hostname | `os.hostname()` in heartbeat metadata |
| version | control-plane / package version |
| capabilities | scan · publish · browser · (+ messaging/comment/cdp) |
| status | online / offline / degraded / needs_login |
| heartbeat | `BrowserSession.lastHeartbeatAt` |
| execution slots | `metadata.executionPool` |
| browser pool | `metadata.browserPool` |
| metrics | process RSS/heap + util % |

Self-register = existing `HeartbeatService.register`.  
Self-heartbeat = existing pulse with enriched registry metadata.

APIs:

- `GET /api/agent/agents`
- `GET /api/agent/runtime` (includes `agents` + `events`)

## Runtime API = nguồn dữ liệu duy nhất

Mọi client đọc qua Control Plane / Runtime API:

| Client | Path |
|--------|------|
| Web Dashboard | Runtime Monitor → `/api/agent/runtime` |
| Telegram Bot | `/api/agent/telegram/command` → Runtime API |
| CLI / scripts | `ControlPlane.getRuntime` |
| Report Engine | `ControlPlane.report` |

**Không** đọc Worker process trực tiếp.

## Runtime Event Bus

Table: `agent_runtime_events`

Events:

`MISSION_STARTED` · `MISSION_COMPLETED` · `MISSION_FAILED`  
`JOB_CREATED` · `JOB_CLAIMED` · `JOB_COMPLETED` · `JOB_FAILED`  
`AGENT_ONLINE` · `AGENT_OFFLINE`  
`SLOT_BUSY` · `SLOT_RELEASED`  
`BROWSER_LEASED` · `BROWSER_RELEASED`  
`CAMPAIGN_STARTED` · `CAMPAIGN_COMPLETED`

Emit is best-effort (never breaks job/mission paths).

`GET /api/agent/runtime/events`

## Report Engine

`GET /api/agent/reports/control-plane?kind=`

| kind | Content |
|------|---------|
| daily | Runtime + existing daily metrics |
| weekly | 7-day window projection |
| campaign | campaigns from Runtime |
| publish | publish/hour + publish jobs |
| scanner | scan/hour + scan jobs |
| runtime_health | health + queue + slots + browsers |

`dataSource: runtime_api` — no direct Worker queries.

## Telegram Remote Console

Commands (via Runtime API / enqueue services only):

```
/health
/agents
/runtime
/missions
/report today|week|health|publish|scanner|campaign
/scan start [sourceId]
/publish now
/cancel mission <missionRunId>
```

`POST /api/agent/telegram/command` `{ "text": "/health" }`

## Multi-Agent prep

Một Mission có thể target:

- Local PC · Mini PC · VPS · Cloud Desktop

`selectAgent(agents, { require, preferredAgentId, preferredHostname })`  
chọn Agent online có capability phù hợp (ưu tiên util thấp).

Claim affinity (opt-in via job payload):

```json
{ "targetAgentId": "worker-…" }
```

Default claim vẫn global `SKIP LOCKED` — không thêm queue/worker.

## Non-goals (honored)

| Forbidden | Status |
|-----------|--------|
| New Worker | ✗ |
| New Queue | ✗ |
| New Scheduler | ✗ |
| New Browser Runtime | ✗ |
| Scanner / Publisher / Mission Runtime rewrite | ✗ |

## Tests

```
npm run test:control-plane
npm run test:runtime-observability
npm run test:mission-engine
npm run test:social-publishing
npm run lint
```

## Module map

```
server/modules/control-plane/
  index.ts                 ControlPlane façade
  agentRegistry.ts
  agentSelector.ts
  runtimeEventBus.ts
  reportEngine.ts
  telegramRemoteConsole.ts
  types.ts
```
