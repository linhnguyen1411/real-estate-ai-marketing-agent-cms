# AI Agent — Scheduler (Sprint 6.1)

> Scheduler **chỉ tạo `AgentJob`** — không mở browser.  
> Worker (`npm run agent:worker`) mới claim và chạy job.

---

## Bật / tắt

```env
AGENT_SCHEDULER_ENABLED=true
```

Khi `false` (mặc định): không start interval; health báo `enabled: false`.

---

## Hành vi

1. Tick mỗi **60 giây**
2. Lấy `AgentSource` `status=active` và `nextScanAt <= now` (hoặc `null`)
3. Bỏ qua nếu đã có job `scan_source` với status `queued|claimed|running` cho source đó
4. Tạo job `scan_source` + cập nhật `nextScanAt = now + scanIntervalMinutes`
5. **PostgreSQL `pg_try_advisory_xact_lock`** trong transaction — nhiều instance web chỉ một instance enqueue mỗi tick

---

## Module

`server/agent/agentScheduler.ts`

| Export | Vai trò |
|--------|---------|
| `startAgentScheduler` / `stopAgentScheduler` | Lifecycle |
| `runAgentSchedulerTick` | Một tick (testable) |
| `shouldEnqueueSourceScan` | Pure duplicate-prevention |
| `getAgentSchedulerStatus` | Health / debug |

Đăng ký trong `server.ts` sau bootstrap DB; dừng trên SIGINT/SIGTERM.

---

## Health

`GET /api/health` → `data.scheduler`:

```json
{
  "enabled": true,
  "running": true,
  "tickIntervalMs": 60000,
  "lastTickAt": "…",
  "lastError": null,
  "lastTickResult": {
    "skipped": false,
    "sourcesDue": 2,
    "jobsCreated": 1,
    "jobsSkippedDuplicate": 1
  }
}
```

---

## UI

**AI Agent → Nguồn**: cột **Lịch quét** (`scanIntervalMinutes`) + **Last / Next**.

Form tạo/sửa nguồn có field lịch quét (phút).

---

## Test

```bash
npm run test:agent-scheduler
```

Kiểm tra: không enqueue khi đã có job active; không enqueue khi chưa đến `nextScanAt`.

---

## Lưu ý production

- Bật scheduler trên **một** (hoặc nhiều) web instance — advisory lock chống trùng enqueue.
- Vẫn cần **worker riêng** để xử lý job.
- Không import Playwright trong scheduler.
