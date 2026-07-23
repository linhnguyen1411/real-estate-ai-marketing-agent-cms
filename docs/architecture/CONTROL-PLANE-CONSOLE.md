# Control Plane Console

**Date:** 2026-07-18  
**Status:** CONTROL PLANE CONSOLE COMPLETE  
**Commit intent:** `feat(control-plane): add command engine and runtime console`

## Goal

Lớp **điều khiển và quan sát** dùng chung cho Web · Telegram · CLI.

Không sửa Runtime / Mission / Execution Agent / Scanner / Publisher.

## Architecture

```
Control Plane
│
├── Runtime API
├── Runtime Events
├── Agent Registry
├── Report Engine
├── Command Engine   ← shared
└── Clients
      ├── Web Dashboard   POST /api/agent/console/command
      ├── Telegram        thin render client
      └── CLI             npm run automation-cli
```

Telegram **chỉ là Client** — không chứa business logic.

## Command Engine

Registry + Adapter (no switch-case dispatch).

```
Command text
  → parseCommandLine
  → CommandRegistry.get(name)
  → handler(args, ctx)
  → CommandResult { ok, lines, data }
```

Shared entry:

- `executeControlCommand(text, { client })`
- `ControlPlane.command(...)`
- Clients: `web` | `telegram` | `cli`

### Commands

| Command | Action |
|---------|--------|
| `/health` | Runtime health + recent events |
| `/runtime` | Runtime metrics snapshot |
| `/agents` | Agent Registry |
| `/missions` | Mission timeline |
| `/browser` | Browser pool |
| `/campaigns` | Campaign runtime |
| `/report today\|week\|…` | Report Engine |
| `/scan start <mission>` | Mission Engine enqueue |
| `/scan stop <mission>` | Cancel active mission runs |
| `/publish now <campaign>` | Start campaign run |
| `/cancel <mission>` | Cancel run / mission |
| `/retry <mission>` | New MissionRun |

Flow: **Command → Runtime API / Mission enqueue → (existing engines)**

## Runtime Events

Command Engine & Report Engine **subscribe** via `subscribeRuntimeEvents()` (read-only Event Bus).

Event types unchanged (`MISSION_*`, `JOB_*`, `AGENT_*`, `SLOT_*`, `BROWSER_*`, `CAMPAIGN_*`).

## Report Engine

Kinds (Runtime API + Events, never Worker direct):

`runtime_health` · `scanner` · `publish` · `campaign` · `agent` · `browser` · `daily` · `weekly`

## Clients

### Telegram

`telegramRemoteConsole.ts` → `executeControlCommand` → `formatCommandText`.

`POST /api/agent/telegram/command`

### CLI

```bash
npm run automation-cli -- runtime
npm run automation-cli -- report today
npm run automation-cli -- missions
AUTOMATION_CLI_JSON=1 npm run automation-cli -- health
```

### Web

`POST /api/agent/console/command` `{ "text": "/health" }`

## Non-goals (honored)

| Forbidden | Status |
|-----------|--------|
| New Worker / Queue / Scheduler | ✗ |
| Duplicate Telegram business logic | ✗ |
| Runtime / Mission / Agent rewrite | ✗ |

## Module map

```
server/modules/control-plane/command-engine/
  index.ts
  types.ts
  parse.ts
  registry.ts
  defaultCommands.ts
  eventSubscription.ts

scripts/automation-cli.ts
```

## Tests

```
npm run test:control-plane-console
npm run test:control-plane
npm run test:mission-engine
npm run test:social-publishing
npm run lint
```
