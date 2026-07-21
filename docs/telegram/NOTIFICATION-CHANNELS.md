# Telegram Notification Channels (H0.3.6)

Five dedicated channels. Each maps to one env var and one Telegram group.

| Channel | Label | Env var | Chat ID |
|---------|-------|---------|---------|
| **OPS** | 🤖 AI Ops | `TELEGRAM_OPS_CHAT_ID` | `-5348392375` |
| **LEAD** | 🎯 Lead Alerts | `TELEGRAM_LEAD_CHAT_ID` | `-5592400378` |
| **PUBLISH** | 📢 Publishing | `TELEGRAM_PUBLISH_CHAT_ID` | `-5261113042` |
| **REPORT** | 📊 Daily Reports | `TELEGRAM_REPORT_CHAT_ID` | `-5446190511` |
| **CRITICAL** | 🚨 Critical Alerts | `TELEGRAM_CRITICAL_CHAT_ID` | `-5132560624` |

## Event routing

### OPS (`TELEGRAM_OPS_CHAT_ID`)

| Event | Router type |
|-------|-------------|
| Fleet | `fleet` |
| Runtime | `runtime` |
| Health | `health` |
| Agent Online | `agent_online` |
| Browser Lease | `browser_lease` |
| Planner | `planner` |
| Mission Started | `mission_started` |
| Mission Finished | `mission_finished` |

### LEAD (`TELEGRAM_LEAD_CHAT_ID`)

| Event | Router type |
|-------|-------------|
| Lead Found | `lead_found` |
| Lead Score | `lead_score` |
| Lead AI Insight | `lead_ai_insight` |

### PUBLISH (`TELEGRAM_PUBLISH_CHAT_ID`)

| Event | Router type |
|-------|-------------|
| Publish Scheduled | `publish_scheduled` |
| Publishing | `publishing` |
| Publish Success | `publish_success` |
| Publish Failed | `publish_failed` |
| Retry Publish | `retry_publish` |

### REPORT (`TELEGRAM_REPORT_CHAT_ID`)

| Event | Router type |
|-------|-------------|
| Daily 08:00 | `daily_08` |
| Daily 12:00 | `daily_12` |
| Daily 18:00 | `daily_18` |
| Weekly | `weekly` |

### CRITICAL (`TELEGRAM_CRITICAL_CHAT_ID`)

| Event | Router type |
|-------|-------------|
| CPU > 90% | `cpu_high` |
| RAM > 90% | `ram_high` |
| Scheduler Down | `scheduler_down` |
| Browser Crash | `browser_crash` |
| Execution Agent Offline | `execution_agent_offline` |
| Heartbeat Lost | `heartbeat_lost` |
| Fleet = 0 | `fleet_zero` |

## Inline actions by channel

| Channel | Actions |
|---------|---------|
| **OPS** | Dashboard, Runtime, Fleet, Health |
| **LEAD** | Open Post, Open Group, CRM, Skip |
| **PUBLISH** | Retry, Cancel, Open Evidence |
| **REPORT** | Dashboard, Runtime |
| **CRITICAL** | Recover, Restart Browser, Restart Agent |

Keyboards: `keyboardForChannel()` in `server/notifications/telegramFormatter.ts`.

## Lead batching example

20 `lead_found` events within 8 seconds → **one** message:

```
🎯 Lead Alerts
🎯 20 Lead mới

• f1 (88/100) — Cần đất…
• f2 (75/100) — …
… và 15 lead khác

Mở CRM để xem chi tiết.
```

## Source of truth

Event → channel map: `EVENT_CHANNEL_MAP` in `server/notifications/notificationTypes.ts`.
