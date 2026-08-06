# AI Agent — CMS Notifications (Sprint 6.2)

> Kênh chính: **notification nội bộ CMS**. Chưa bắt buộc Telegram/Zalo.

---

## Service duy nhất

`server/agent/agentNotificationService.ts`

| Helper | Trigger |
|--------|---------|
| `notifyFindingHighScore` | Finding score ≥ notifyScore |
| `notifyJobFailed` | Job failed sau hết retry |
| `notifyBrowserNeedsLogin` | Facebook login/checkpoint |
| `notifyScanHotLeads` | Scan xong có finding |
| `notifyScanSummary` | Scan hoàn thành (tùy config) |
| `notifySessionHeartbeatLost` | Session mất heartbeat |
| `checkStaleBrowserSessions` | Scheduler tick (90s stale) |

Deduplicate: `eventKey` + unique `(companyId, eventKey)`.

Mỗi notification gắn `data.link` → finding / job / session / source.

---

## API

| Method | Path |
|--------|------|
| GET | `/api/agent/notifications` |
| GET | `/api/agent/notifications/unread-count` → `{ unread }` |
| PATCH | `/api/agent/notifications/:id/read` |
| PATCH | `/api/agent/notifications/read-all` → `{ updated }` |

---

## CMS UI

- **Chuông** trên header (`AgentNotificationBell`) — badge unread
- Dropdown **10** notification mới
- Click → mark read + navigate tới finding/jobs/sessions/sources
- Poll unread count mỗi **45 giây**
- Trang `/admin/agents/notifications` — mark all read + link

---

## Không làm

- Không Telegram/Zalo trong sprint này
- Không polling &lt; 30s
