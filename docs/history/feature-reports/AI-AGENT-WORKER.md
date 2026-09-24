# AI Agent — Browser Worker (Sprint 3.1)

> Process độc lập, **không** import/khởi động từ `server.ts`.  
> Queue: bảng PostgreSQL `agent_jobs`.  
> MVP: chưa quét Facebook — chỉ `health_check` và `visit_url`.

---

## Kiến trúc

```
┌─────────────────┐     claim (SKIP LOCKED)     ┌──────────────┐
│  npm run        │ ──────────────────────────► │ agent_jobs   │
│  agent:worker   │ ◄────────────────────────── │ (PostgreSQL) │
└────────┬────────┘     complete / retry       └──────────────┘
         │
         │ heartbeat 15–30s
         ▼
┌─────────────────┐
│ browser_sessions│  ◄── CMS /admin/agents/sessions
└─────────────────┘
```

| Thành phần | File |
|------------|------|
| Entry | `server/agent-worker/index.ts` |
| Config | `server/agent-worker/config.ts` |
| Poll + handlers | `server/agent-worker/workerLoop.ts` |
| Atomic claim | `server/agent-worker/jobClaimer.ts` |
| Playwright | `server/agent-worker/browserManager.ts` |
| Heartbeat | `server/agent-worker/heartbeat.ts` |
| SIGINT/SIGTERM | `server/agent-worker/gracefulShutdown.ts` |
| Login headed | `server/agent-worker/login.ts` |

---

## Cài đặt

```bash
npm install
npm run agent:install-browser   # tải Chromium (~150MB)
```

Copy env từ `.env.example`:

| Biến | Mô tả | Mặc định |
|------|--------|----------|
| `DATABASE_URL` | PostgreSQL (bắt buộc) | — |
| `AGENT_WORKER_ID` | ID worker (claim `claimed_by`) | `worker-<host>-<pid>` |
| `AGENT_BROWSER_PROFILE_DIR` | Persistent profile Playwright | `data/browser-profiles/default` |
| `AGENT_HEADLESS` | `true` / `false` | `true` |
| `AGENT_POLL_INTERVAL_MS` | Poll khi không có job | `3000` |
| `AGENT_HEARTBEAT_INTERVAL_MS` | 15–30s khuyến nghị | `20000` |
| `AGENT_COMPANY_ID` | Gắn session vào tenant (tuỳ chọn) | — |
| `AGENT_SESSION_NAME` | Tên hiển thị CMS | `Browser Worker (...)` |
| `AGENT_LOGIN_START_URL` | URL mở khi `agent:login` | Facebook |

**Không commit** profile/cookies — đã gitignore `data/browser-profiles/`, `cookies.json`, screenshots, traces.

---

## Chạy worker

```bash
# Terminal 1 — web CMS (như cũ)
npm run dev

# Terminal 2 — worker
npm run agent:worker
```

Đăng nhập Facebook (hoặc site khác) trước khi worker headless:

```bash
npm run agent:login
```

Mở Chromium **headed**, người dùng tự đăng nhập. Cookies nằm trong profile dir — **không** lưu password vào DB.

---

## Job queue

### Atomic claim

Worker dùng `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)`:

- Chỉ `status = 'queued'`
- `available_at <= now()`
- Sắp xếp: `priority ASC`, `created_at ASC`
- Set `claimed_by`, `claimed_at`, `status = running`, `started_at`

Hai worker song song **không** claim trùng job.

### Handlers (Sprint 3.1)

| `type` | Payload | Kết quả |
|--------|---------|---------|
| `health_check` | `{}` | `{ ok, checkedAt, message }` |
| `visit_url` | `{ "url": "https://..." }` | `{ title, currentUrl, visitedAt }` |
| `scan_source` | `{ "sourceId": "..." }` | `{ pagesVisited, contentsSeen, contentsInserted, findingsCreated, durationMs, ... }` |

Job legacy `source_scan` được xử lý như `scan_source`.

Job khác (vd. Facebook scrape) chưa triển khai.

### Retry / backoff

Khi handler lỗi:

1. `attempts += 1`
2. Nếu `attempts < maxAttempts` → `queued`, `available_at` = now + backoff (1m, 2m, 4m… max 30m)
3. Ngược lại → `failed`, `finished_at`

Graceful shutdown (SIGINT/SIGTERM):

- Job đang chạy → **requeue** (không tăng `attempts`)
- `browser_sessions.status = offline`
- Đóng Chromium

---

## Tạo job test

Qua Prisma Studio hoặc script tùy chỉnh. Ví dụ payload:

```json
{ "type": "health_check", "status": "queued", "priority": 1, "payload": {} }
{ "type": "visit_url", "status": "queued", "priority": 2, "payload": { "url": "https://example.com" } }
```

---

## CMS

`GET /api/agent/sessions` — danh sách `browser_sessions` theo company scope.

UI: **AI Agent → Sessions** (`/admin/agents/sessions`)

- Online: heartbeat &lt; 45s
- Stale: heartbeat quá cũ
- Offline: worker đã shutdown

---

## Production lưu ý

- **Không** cài Chromium trên VPS web nếu không cần worker tại đó.
- Chạy worker trên máy dev/ops có GUI hoặc headed login + headless worker.
- `server.ts` **không** import worker — deploy web không kéo Playwright runtime.

---

## Kiểm tra nhanh

```bash
npm run lint
npm run build
npm run agent:worker    # sau khi có job health_check trong queue
```

Log mong đợi:

```
[agent-worker] Claimed job <id> type=health_check
[agent-worker] Completed job <id>
```
