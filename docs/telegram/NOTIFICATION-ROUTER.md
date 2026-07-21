# Telegram Notification Router (H0.3.6)

All outbound Telegram **push notifications** must go through the Notification Router. No module may call `sendMessage(chatId)` directly.

## Flow

```
notification.send({ type, payload })
        ↓
Notification Router (dedup, rate-limit, batch)
        ↓
telegramFormatter (channel header, summary, actions)
        ↓
telegramNotificationService.sendTelegramMessage (transport only)
        ↓
Correct channel chat ID
```

Inbound **console replies** (user commands, inline keyboard callbacks) use `sendNotificationDirect()` via `createTelegramReplyPort()` — same transport, but routed to the user's chat, not a channel.

## Entry points

| API | Use |
|-----|-----|
| `notification.send()` | Routed push notifications by event type |
| `notification.sendDirect()` | Explicit chat ID (console replies) |
| `notification.flushBatches()` | Flush lead/OPS batch buffers |

Source: `server/notifications/notificationRouter.ts`

## Anti-spam

| Rule | Value |
|------|-------|
| Deduplication | Same `dedupeKey` within **60s** → skip |
| Rate limit | **30** messages per channel per minute |
| Lead batch | Coalesce `lead_found` within **8s** → one summary |
| OPS batch | Coalesce runtime bullets within **5s** → one message |

Critical events (`mission_started`, CRITICAL channel) bypass OPS batching and send immediately when `immediate: true`.

## Environment

Channel chat IDs — **do not** use `TELEGRAM_PRIMARY_CHAT_ID` for notifications:

```env
TELEGRAM_OPS_CHAT_ID=-5348392375
TELEGRAM_LEAD_CHAT_ID=-5592400378
TELEGRAM_PUBLISH_CHAT_ID=-5261113042
TELEGRAM_REPORT_CHAT_ID=-5446190511
TELEGRAM_CRITICAL_CHAT_ID=-5132560624
```

Bot token: `telegram_bot_token` in settings or `TELEGRAM_BOT_TOKEN`.

## Format rules

1. No raw JSON dumps
2. No long metric dumps
3. Order: **AI summary** → **recommendation** → **inline actions**

## Tests

```bash
npm run test:notification-router
```

Verifies routing, lead/publish/ops/critical/report channels, dedup, rate limit, and batching.
