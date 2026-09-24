# Telegram Smart Operations

**Status:** SMART TELEGRAM OPERATIONS COMPLETE  
**Phase:** T3  
**Commit intent:** `feat(telegram): enhance smart operations and link verification`

---

## Architecture

```
Telegram (Operation Client)
        ↓
Command Registry
        ↓
Control Plane (operationsService / reportEngine)
        ↓
Mission / Runtime / Publish APIs
        ↓
Execution Agent
```

Telegram **does not**:

- Call Browser Runtime
- Read DB directly
- Contain business logic

Lead skip / mission request / notify retry go through Control Plane ops façade.

---

## Smart Notifications

Single catalog: `server/modules/control-plane/telegram/smartNotifications.ts`

| Kind | Source |
|------|--------|
| Mission Started / Completed / Failed | Runtime Events |
| Publish Success / Failed | `JOB_*` + publish job type |
| Lead Found | Finding notify path (formatter) |
| Agent Online / Offline | Runtime Events |
| Browser Crash | `BROWSER_*` + crash payload |
| Queue Blocked | `JOB_FAILED` / OPS with queue flag |
| Campaign Completed | Runtime Events |

Ops push: `eventNotifier.ts` (cooldown anti-spam).  
Lead push: `telegramNotificationService.ts` + rich formatter.

---

## Lead Alert

Example:

```
Lead mới (75/100)

👤 Người mua
📍 Hòa Xuân
🏷 Nhà phố
📂 Group:
MUA BÁN BDS ĐÀ NẴNG
```

Inline keyboard:

- Mở bài viết (url)
- Mở Group (url)
- Retry / Bỏ qua / Tạo Mission (callbacks → `/lead …`)

Before send: **normalize → verify** permalinks. If post fails, fallback to group URL. If neither opens → **do not send** (`link_unverified`).

---

## Commands (additions)

| Command | Role |
|---------|------|
| `/report failed` | Failed missions / DLQ / fail events |
| `/lead skip \| mission \| retry <id>` | Lead ops via Control Plane |

Existing: `/dashboard`, `/jobs`, `/mission`, `/publish`, `/agent`, `/browser`, `/report …`, `/retry …`

---

## Job actions

Job / mission / publish keyboards share Retry · Cancel · Pause · Resume · Refresh (no duplicate builders beyond scope helpers in `inlineKeyboard.ts`).

---

## Related modules

| Module | Path |
|--------|------|
| Link normalization | `server/modules/link-normalization/` |
| Smart notifications | `telegram/smartNotifications.ts` |
| Inline keyboards | `control-plane/inlineKeyboard.ts` |
| Lead formatter | `notifications/telegramFormatter.ts` |
| Publish evidence metadata | `publishEvidenceService.ts` |

See also: [LINK-NORMALIZATION.md](../architecture/LINK-NORMALIZATION.md)

---

## Tests

```bash
npm run test:telegram-smart-operations
npm run test:telegram-operations
npx tsc --noEmit
```

Expected: Notification, Lead Alert, Inline Keyboard, Link Verification, Mobile Link, Report, Mission, Publishing, Lint PASS.
