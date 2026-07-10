# AI Employee Platform — Admin API (Sprint 1.2)

> Base path: `/api/agent/*`  
> Auth: `Authorization: Bearer <token>` (middleware CMS hiện tại)  
> Data: Prisma trực tiếp — **không** qua `cms_records` / `dbHelper` cache

---

## Phân quyền

| Role | GET (đọc) | POST/PATCH/DELETE sources & missions | POST mission run | PATCH findings |
|------|-----------|--------------------------------------|------------------|----------------|
| `owner` | Tất cả company | ✓ | ✓ | ✓ (kể cả `promoted`) |
| `company` | Company mình | ✓ | ✓ | ✓ (kể cả `promoted`) |
| `member` | Company mình | ✗ | ✗ | ✓ (`reviewed`, `dismissed` — không `promoted`) |

- `companyId` scope: owner thấy mọi tenant; company/member chỉ `companyId === user.company_id`.
- Nguồn/mission `companyId = null` (global) chỉ owner truy cập được.

---

## Response convention

```json
{
  "status": "success",
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

Lỗi:

```json
{ "status": "error", "message": "..." }
```

---

## Endpoints

### Dashboard

`GET /api/agent/dashboard`

```json
{
  "activeSources": 3,
  "queuedJobs": 5,
  "runningJobs": 1,
  "newFindings": 12,
  "unreadNotifications": 4,
  "jobsFailed24h": 0
}
```

---

### Sources

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/agent/sources` | Query: `page`, `limit`, `status`, `type`, `search` |
| POST | `/api/agent/sources` | Owner/company only |
| PATCH | `/api/agent/sources/:id` | Owner/company only |
| DELETE | `/api/agent/sources/:id` | Owner/company only |
| POST | `/api/agent/sources/:id/run` | Enqueue job `scan_source` (Sprint 3.2) |

**POST body:**

```json
{
  "name": "Nhóm BĐS Đà Nẵng",
  "type": "facebook_group",
  "url": "https://facebook.com/groups/example",
  "priority": 5,
  "scanIntervalMinutes": 60,
  "config": {},
  "checkpoint": null
}
```

**DELETE behavior (an toàn):**

- Nếu nguồn có job / scanned content / finding → **soft pause** (`status: paused`), trả `meta.softPaused: true`.
- Nếu không có dependency → hard delete.

**POST `/api/agent/sources/:id/run` body (optional):**

```json
{ "missionId": "clxyz..." }
```

Response:

```json
{ "sourceId": "...", "jobId": "..." }
```

---

### Missions

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/agent/missions` | Query: `page`, `limit`, `status` |
| POST | `/api/agent/missions` | Owner/company only |
| PATCH | `/api/agent/missions/:id` | Owner/company only |
| POST | `/api/agent/missions/:id/run` | **Enqueue jobs only** — không Playwright |

**POST mission body:**

```json
{
  "name": "Quét nhóm VIP",
  "objective": "Tìm lead mua đất Nam Đà Nẵng",
  "rules": { "sourceIds": ["clxyz..."] },
  "schedule": null
}
```

**POST run** — tạo `AgentJob` (`type: scan_source`, `status: queued`) trong transaction:

- Lấy nguồn `active` từ `rules.sourceIds` hoặc tất cả nguồn active của company.
- Cập nhật mission `draft` → `active`.
- **Không** mở browser trong HTTP request.

Response:

```json
{
  "missionId": "...",
  "jobsCreated": 2,
  "jobIds": ["...", "..."]
}
```

---

### Jobs

`GET /api/agent/jobs`

Query: `page`, `limit`, `status`, `type`, `sourceId`, `missionId`

Job queue index: `(status, availableAt, priority)` — worker phase sau sẽ claim.

---

### Findings

| Method | Path |
|--------|------|
| GET | `/api/agent/findings` |
| PATCH | `/api/agent/findings/:id` |

**GET query:** `page`, `limit`, `minScore`, `status`, `type`, `sourceId`

**PATCH body:**

```json
{
  "status": "reviewed",
  "promotedLeadId": "lead-optional-phase-sau"
}
```

Status: `new` | `reviewed` | `promoted` | `dismissed`

`promoted` yêu cầu owner/company admin. `promotedLeadId` là tham chiếu mềm tới bảng `leads` (chưa tạo Lead tự động trong sprint này).

---

### Notifications

| Method | Path |
|--------|------|
| GET | `/api/agent/notifications` |
| PATCH | `/api/agent/notifications/:id/read` |

Member chỉ đọc notification `userId` của mình hoặc broadcast (`userId: null`) trong company.

---

### Browser Sessions (Sprint 3.1)

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/agent/sessions` | Query: `page`, `limit`, `status` |

Worker (`npm run agent:worker`) tự upsert `browser_sessions` + heartbeat — không có POST từ CMS.

---

## Module layout

```
server/agent/
  agentTypes.ts       — constants, deps interface
  agentValidation.ts  — manual validation (không thêm Zod)
  agentDb.ts          — Prisma queries + company scope
  agentJobService.ts  — enqueueMissionRun (transaction)
  agentRoutes.ts      — registerAgentAdminRoutes(app, deps)
```

Đăng ký trong `server.ts`:

```typescript
registerAgentAdminRoutes(app, { getAuthUser, accessDefaults });
```

---

## Validation

Không thêm **Zod** — project chưa dùng; validation thủ công theo convention `blogRoutes` / `investorLeadRoutes` để giảm dependency và diff scope.

---

## Test script

```bash
npm run dev
TEST_EMAIL=you@example.com TEST_PASSWORD=secret node scripts/test-agent-api.mjs
```

Kiểm tra: login → dashboard → CRUD source → mission → run (enqueue) → list jobs → delete source (soft pause).

---

## Không có trong sprint 1.2

- Playwright / `npm run agent:worker`
- Cron / scheduler
- UI admin panel
- Tự động tạo `Lead` từ finding
- `AGENT_ENABLED` gate (phase sau)

---

*Xem data model: [AI-AGENT-DATA-MODEL.md](./AI-AGENT-DATA-MODEL.md)*
