# Telegram Operations Center

**Date:** 2026-07-18  
**Status:** TELEGRAM OPERATIONS READY  
**Commit intent:** `feat(telegram): add operations center`

## Role

Telegram = **Operation Client** only.

```
Telegram
  → Command Engine
  → Control Plane API (operationsService)
  → Mission / Runtime / Publish services
```

No Mission/Execution Agent/Scanner/Publisher core changes.  
No new Runtime. Telegram layer has **no Prisma**.

## Commands

| Command | Purpose |
|---------|---------|
| `/dashboard` | Health, agents, pools, queue, jobs, missions |
| `/jobs [running\|pending\|failed\|completed]` | AgentJob list + keyboard |
| `/mission <id>` | Detail + Retry/Cancel/Pause/Resume/Refresh buttons |
| `/mission retry\|cancel\|pause\|resume <id>` | Mission ops via Control Plane |
| `/publish` / `/publish queue` | SocialPublishJob queue |
| `/publish now\|retry\|cancel` | Campaign / job ops |
| `/agents` · `/agent <id>` · `/agent restart <id>` | Registry + soft restart (`OPS_REQUEST`) |
| `/browser` · `release\|recover\|screenshot` | Pool status + soft ops events |
| `/retry` | Mission / publish / scan / campaign |
| `/report today\|week\|publish\|scan\|agents\|browser` | Report Engine |

## Inline Keyboard

Mission / publish responses attach buttons:

Retry · Cancel · Pause · Resume · Refresh  

`callback_query` → `callbackDataToCommand` → same Command Engine.

## Alerts

Event Bus pull with **per-key cooldown** (default 60s):

Agent Offline · Mission Failed · Publish Failed · Browser Error · Queue / Job Failed

## Soft browser / agent commands

`/agent restart` and `/browser release|recover|screenshot` emit `OPS_REQUEST` on the Event Bus.  
Agents may observe and act — **no SSH**, no direct Worker calls from Telegram.

## Tests

```bash
npx tsx scripts/test-telegram-operations.ts
npx tsx scripts/test-telegram-control-plane.ts
npm run lint
```

## Related

- `docs/telegram/TELEGRAM-CONTROL-PLANE.md`
- `docs/architecture/LOCAL-SCHEDULER.md`
- `server/modules/control-plane/operationsService.ts`
- `server/modules/control-plane/command-engine/operationsCommands.ts`
