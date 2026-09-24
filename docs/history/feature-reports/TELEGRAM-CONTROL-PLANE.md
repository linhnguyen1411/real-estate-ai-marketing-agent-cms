# Telegram Control Plane

**Date:** 2026-07-18  
**Status:** TELEGRAM CONTROL PLANE COMPLETE  
**Commit intent:** `feat(telegram): implement control plane console`

## Architecture

```
Telegram (Client)
    ↓ UpdateReceiver (polling | webhook)
    ↓ ACL
    ↓ Router
    ↓ Command Engine (shared)
Control Plane (Server)
    ↓ Mission / Runtime API / Report / Queue enqueue
Execution Agent (Executor)
    ↓ claim → Local schedule → Browser publish → report
```

Telegram **does not** call Worker or Browser directly.  
Telegram **does not** own business logic.

## Modules

| Path | Role |
|------|------|
| `server/modules/control-plane/telegram/` | Transport, ACL, router, reply, event push |
| `server/modules/control-plane/command-engine/` | Shared commands (Web / CLI / Telegram) |
| `server/modules/control-plane/telegramRemoteConsole.ts` | Thin command adapter |
| `server/notifications/telegramNotificationService.ts` | `sendMessage` (sole reply path) |

## Update receiver

Abstraction: `TelegramUpdateReceiver`

- **polling** — `getUpdates` loop (default)
- **webhook** — `POST /api/webhooks/telegram`

Switch via `TELEGRAM_CONSOLE_MODE` or settings `telegram_console_mode`.

## ACL

Requires allowlist of users and/or chats:

- `TELEGRAM_ALLOWED_USER_IDS` / settings `telegram_allowed_user_ids`
- `TELEGRAM_ALLOWED_CHAT_IDS` / settings + primary `telegram_chat_id`
- `TELEGRAM_ADMIN_USER_IDS` / settings `telegram_admin_user_ids`
- Rate limit: `TELEGRAM_RATE_LIMIT_PER_MIN` (default 20)

Empty ACL → console will **not** start (`acl_not_configured`).

## Commands (shared engine)

| Command | Purpose |
|---------|---------|
| `/health` `/runtime` `/agents` `/missions` | Runtime snapshot via Control Plane |
| `/report today` | Report Engine |
| `/publish queue` | List queued SocialPublishJob |
| `/publish now <campaign>` | Mission → Production Queue → Agent |
| `/scan start\|stop` | Enqueue / cancel mission runs |
| `/pause` `/resume` | Mission status |
| `/cancel` `/retry` | Mission run control |
| `/help` `/start` | Help |

## Reply

All responses go through `TelegramReplyPort` → `sendTelegramMessage()`.  
Commands never call Bot API themselves.

## Notifications

Event Bus pull → Telegram push:

Mission Started / Completed / Failed · Publish Success / Failed (via JOB_*) · Agent Online / Offline · Browser Error (payload) · Queue Error (JOB_FAILED) · Campaign Started / Completed

## HTTP

| Route | Role |
|-------|------|
| `POST /api/webhooks/telegram` | Webhook ingress |
| `GET /api/agent/telegram/console/status` | Status |
| `POST /api/agent/telegram/console/start\|stop` | Lifecycle |
| `POST /api/agent/telegram/command` | CMS-auth text command (dev/test) |

## Enable

```bash
# .env
TELEGRAM_CONSOLE_ENABLED=1
TELEGRAM_ALLOWED_USER_IDS=<your telegram user id>
TELEGRAM_ALLOWED_CHAT_IDS=<chat id>
# token + chat also from System Settings
```

## Tests

```bash
npx tsx scripts/test-telegram-control-plane.ts
npm run lint
```

## Related

- `docs/architecture/LOCAL-SCHEDULER.md` — Agent local schedule / reclaim
- `docs/telegram/TELEGRAM-AUDIT.md` — T0 audit
