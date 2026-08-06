# Telegram Operations UX (F5)

Telegram is the day-to-day **AI Operations Center** — thin client over Control Plane Copilot.

## Operator goals

Open Telegram and know immediately:

- Hệ thống đang làm gì
- Máy nào đang làm gì
- Scanner / Publisher / Mission
- Có lỗi gì · cần hành động gì

## Conversation map

| Ask | Reply |
|-----|--------|
| Có gì mới? | AI Briefing (kết luận trước) |
| Có lỗi gì không? | Incident Center + recommendation |
| Máy nào đang bận? | Fleet Summary |
| Scanner sao rồi? | Scanner Summary |
| Publisher thế nào? | Publish Summary |
| Mission nào đang chạy? | Mission Summary |
| Browser nào đang bận? | Browser Detail |
| Lead hôm nay | Lead Summary |

## Presentation order

```
Summary → Incident → Recommendation → Inline Actions
```

Rules:

- Không dump JSON / raw metrics / stack trace
- Kết luận trước, số liệu sau
- Emoji vừa đủ, khoảng trắng rõ
- ≤ ~15 dòng cho Daily Briefing

## Inline actions

Every summary attaches buttons: Refresh · Fleet · Jobs · Mission · Retry · Logs · Release / Restart Browser · Ignore.

Callbacks → Command Engine only.

## Daily briefing

08:00 / 12:00 / 18:00 Asia/Ho_Chi_Minh via Copilot summary scheduler.

## Files

- `copilot/opsSummaries.ts` — presentation
- `copilot/operationalIntelligence.ts` — signals
- `copilot/recommendations.ts` — advice
- `copilot/handlers.ts` / `ruleClassifier.ts` — conversation
- `inlineKeyboard.ts` — actions

## Tests

```bash
npm run test:telegram-copilot
npm run lint
```
