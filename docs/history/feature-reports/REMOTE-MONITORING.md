# Remote Monitoring (Telegram)

Telegram monitors **each Local Execution Agent** through Control Plane — not SSH, not direct DB/browser access.

## Architecture

```
Telegram → Command Registry → Control Plane → Runtime Snapshot / OPS queue
                                              ↓
                                    Execution Agent (heartbeat)
```

## Commands

| Command | Purpose |
|---------|---------|
| `/agent` | List registered agents |
| `/agent <id>` | Full telemetry snapshot for one machine |
| `/agent restart <id>` | Soft restart via OPS (agent exits for PM) |
| `/browser` | Browser pool + last snapshots |
| `/browser profiles` | Profile / busy / URL lines |
| `/browser release\|recover\|restart [agent]` | Soft browser OPS |
| `/browser refresh [agent]` | Refresh runtime request |
| `/jobs` `/jobs running` `/jobs waiting` | Job lists |
| `/scan` | Scanner telemetry from local agents |
| `/scan start\|stop <mission>` | Mission control |
| `/publish` | Queue + local publish telemetry |
| `/runtime` | VPS metrics + local agent summaries |
| `/health` | Health score + local heartbeats |

Job control (retry / pause / resume / cancel) uses existing `/mission` and `/retry` Control Plane commands.

## Remote control (no SSH)

1. Operator issues Telegram command
2. Control Plane enqueues OPS + emits `OPS_REQUEST`
3. Next agent heartbeat response delivers `opsCommands`
4. Agent applies (`release_browser`, `restart_browser`, `refresh_runtime`, `restart_agent`)

## What Telegram must not do

- Read Prisma / production DB directly
- Drive Playwright / CDP
- Duplicate Runtime state outside Control Plane snapshots

## Extensibility

Same snapshot + OPS contract powers future Fleet / Web / Mobile / Discord / Slack clients.
