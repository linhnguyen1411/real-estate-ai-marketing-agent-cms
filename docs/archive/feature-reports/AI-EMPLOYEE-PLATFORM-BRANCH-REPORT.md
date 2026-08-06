# Báo cáo branch `feature/ai-employee-platform`

> Tổng hợp mọi nội dung đã thực hiện trên branch AI Employee Platform.  
> Ngày báo cáo: **2026-07-11**  
> So với: `master` (merge-base trước các thay đổi agent)  
> Trạng thái: một phần đã commit (`sprint 5.1` + baseline docs); phần lớn sprint 5.2 → 8.1 đang **working tree / untracked** (chưa commit hết).

---

## 1. Mục tiêu branch

Xây nền tảng **AI Employee** trong CMS BĐS Đà Nẵng:

- Quét nguồn (website / Facebook group) → nội dung → finding / lead
- Lịch quét, thông báo nội bộ CMS, mission templates, báo cáo ngày
- Đề xuất phản hồi có duyệt người (chưa tự đăng MXH)

**Không** dùng `cms_records` / `dbHelper` cache cho dữ liệu agent — Prisma-native tables.

---

## 2. Tóm tắt theo phase / sprint

| Phase | Sprint | Nội dung | Trạng thái |
|-------|--------|----------|------------|
| Baseline | — | Audit kiến trúc, data model, API design | Docs + commit |
| 2 | 2.1 | CMS UI Agent Platform (routes, sidebar, pages) | Done |
| 3 | 3.1 | Browser Worker (Playwright, claim job, heartbeat) | Done |
| 3 | 3.2 | Website Reader (`scan_source`, adapter, finding rules) | Done |
| 4 | 4.1 | Lead Analyzer (prefilter → AI → validate) | Done |
| 5 | 5.1 | Facebook Group Reader MVP (defensive, needs_login) | Commit `106b23a` |
| 5 | 5.2 | Incremental scan + checkpoint + dedupe | Done (WT) |
| 6 | 6.1 | Scheduler (enqueue only, advisory lock) | Done (WT) |
| 6 | 6.2 | Notification CMS (service, bell, unread) | Done (WT) |
| 7 | 7.1 | Mission templates + daily report | Done (WT) |
| 8 | 8.1 | Draft reply queue (approve, không auto-post) | Done (WT) |

*(WT = working tree / chưa commit đầy đủ)*

---

## 3. Chi tiết từng sprint

### 3.0 Baseline

- `docs/AI-AGENT-BASELINE.md` — kiến trúc Express+Vite, auth, AI hiện có
- `docs/AI-AGENT-DATA-MODEL.md` — thiết kế bảng agent
- `docs/AI-AGENT-API.md` — hợp đồng API

### 3.1 Sprint 2.1 — CMS UI

- Routes `/admin/agents/*` + submenu sidebar
- `AgentPlatformPage` + panels: Dashboard, Sources, Missions, Jobs, Findings, Notifications, Sessions
- Client API `src/services/agentPlatformApi.ts`, types `src/types/agentPlatform.ts`

### 3.2 Sprint 3.1 — Browser Worker

- Process độc lập: `npm run agent:worker`
- Playwright Chromium, heartbeat, `FOR UPDATE SKIP LOCKED` claim
- Graceful shutdown; job types `health_check` / `visit_url` / sau đó `scan_source`
- Docs: `docs/AI-AGENT-WORKER.md`

### 3.3 Sprint 3.2 — Website Reader

- Adapter `website` / `forum`, content hash dedupe
- Finding rule engine (keywords, minScore, notifyScore)
- `POST /api/agent/sources/:id/run`
- Docs: `docs/AI-AGENT-WEBSITE-READER.md`

### 3.4 Sprint 4.1 — Lead Analyzer

- Prefilter → `generateText` (reuse `aiService`) → JSON validate/sanitize → fallback
- Cost guards qua env (`AGENT_LEAD_ANALYSIS_*`)
- Docs: `docs/AI-AGENT-LEAD-ANALYZER.md`

### 3.5 Sprint 5.1 — Facebook Group Reader MVP

- Adapter Playwright defensive; login/checkpoint → `needs_login`
- Không like / comment / bypass
- Docs: `docs/AI-AGENT-FACEBOOK-READER.md`

### 3.6 Sprint 5.2 — Incremental scan

- Checkpoint schema, pinned-aware stop streak
- Dedup: `externalId` > `canonicalUrl` > `contentHash`
- Checkpoint chỉ cập nhật khi scan thành công
- Scan report + summary notify
- Test: `npm run test:facebook-checkpoint`

### 3.7 Sprint 6.1 — Scheduler

- `server/agent/agentScheduler.ts` — tick 60s, `AGENT_SCHEDULER_ENABLED`
- `pg_try_advisory_xact_lock` — một instance enqueue
- Chỉ enqueue `scan_source` (không mở browser); skip nếu đã có job active
- Cập nhật `nextScanAt`; UI Sources hiện interval / last / next
- Test: `npm run test:agent-scheduler`
- Docs: `docs/AI-AGENT-SCHEDULER.md`

### 3.8 Sprint 6.2 — Notification CMS

- Service duy nhất `agentNotificationService.ts` + dedupe `eventKey`
- Triggers: finding score ≥ notifyScore, job failed hết retry, needs_login, scan hot leads, heartbeat mất
- API unread-count + mark-all-read
- Chuông header (`AgentNotificationBell`), dropdown 10 item, poll 45s
- Docs: `docs/AI-AGENT-NOTIFICATIONS.md`

### 3.9 Sprint 7.1 — Mission templates & daily report

- 5 templates (quỹ đất Nam ĐN, thuê MB, căn hộ, chủ đề group, website BĐS)
- Fields: objective, sourceIds, ±keywords, minFindingScore, notifyScore, maxItemsPerRun, schedule, analysisInstructions
- `GET /api/agent/missions/templates`, `POST .../from-template`
- Daily report DB-only metrics + AI tóm tắt (cấm bịa số)
- `GET /api/agent/reports/daily`, UI `/admin/agents/reports`
- Docs: `docs/AI-AGENT-DAILY-REPORT.md`

### 3.10 Sprint 8.1 — Draft reply queue

- Models: `AgentActionProposal`, `AgentActionAuditLog`
- Flow: Finding → Tạo phản hồi → AI 1–3 draft → duyệt / sửa / reject / copy
- **Không** tự comment/inbox/post Facebook
- UI `/admin/agents/proposals`
- Docs: `docs/AI-AGENT-ACTION-PROPOSALS.md`
- **Lưu ý:** cần `npx prisma db push` (hoặc migrate) khi DB local chạy để tạo bảng mới

---

## 4. Data model (Prisma)

Bảng chính (snake_case `@@map`):

| Model | Bảng | Vai trò |
|-------|------|---------|
| AgentSource | agent_sources | Nguồn quét + checkpoint |
| AgentMission | agent_missions | Mission + rules/schedule JSON |
| AgentJob | agent_jobs | Hàng đợi job |
| BrowserSession | browser_sessions | Worker session / heartbeat |
| ScannedContent | scanned_contents | Nội dung đã quét (dedupe) |
| AgentFinding | agent_findings | Lead/finding scored |
| AgentNotification | agent_notifications | Thông báo CMS |
| AgentActionProposal | agent_action_proposals | Draft phản hồi (8.1) |
| AgentActionAuditLog | agent_action_audit_logs | Audit thao tác proposal |

Migration gốc: `prisma/migrations/20260710103000_add_ai_agent_platform/`  
Migration 8.1: `prisma/migrations/20260711040000_add_agent_action_proposals/`

---

## 5. API chính (`/api/agent/*`)

| Nhóm | Endpoint tiêu biểu |
|------|-------------------|
| Dashboard | `GET /dashboard` |
| Sources | CRUD + `POST /sources/:id/run` |
| Missions | CRUD + run + templates + from-template |
| Jobs / Findings / Sessions | list + patch finding |
| Notifications | list, unread-count, read, read-all |
| Reports | `GET /reports/daily` |
| Action proposals | create from finding, list, patch, approve, reject, copy, audits |

Chi tiết: `docs/AI-AGENT-API.md` + docs từng sprint.

---

## 6. CMS UI routes

| Path | Màn hình |
|------|----------|
| `/admin/agents` | Dashboard |
| `/admin/agents/sources` | Nguồn |
| `/admin/agents/missions` | Mission + templates |
| `/admin/agents/jobs` | Jobs |
| `/admin/agents/findings` | Findings (+ Tạo phản hồi) |
| `/admin/agents/proposals` | Hàng chờ duyệt phản hồi |
| `/admin/agents/notifications` | Thông báo |
| `/admin/agents/sessions` | Browser sessions |
| `/admin/agents/reports` | Báo cáo cuối ngày |

Header: chuông notification agent.

---

## 7. Scripts & env

```bash
npm run agent:worker
npm run agent:login
npm run agent:install-browser
npm run agent:debug-facebook
npm run test:agent-api
npm run test:website-reader
npm run test:lead-analyzer
npm run test:facebook-checkpoint
npm run test:agent-scheduler
```

Env tiêu biểu (xem `.env.example`):

- `AGENT_SCHEDULER_ENABLED`
- `AGENT_LEAD_ANALYSIS_*`
- Worker / Playwright related vars

---

## 8. Tài liệu đã thêm

| File | Sprint / chủ đề |
|------|-----------------|
| `docs/AI-AGENT-BASELINE.md` | Baseline |
| `docs/AI-AGENT-DATA-MODEL.md` | Data model |
| `docs/AI-AGENT-API.md` | API |
| `docs/AI-AGENT-WORKER.md` | 3.1 |
| `docs/AI-AGENT-WEBSITE-READER.md` | 3.2 |
| `docs/AI-AGENT-LEAD-ANALYZER.md` | 4.1 |
| `docs/AI-AGENT-FACEBOOK-READER.md` | 5.1–5.2 |
| `docs/AI-AGENT-SCHEDULER.md` | 6.1 |
| `docs/AI-AGENT-NOTIFICATIONS.md` | 6.2 |
| `docs/AI-AGENT-DAILY-REPORT.md` | 7.1 |
| `docs/AI-AGENT-ACTION-PROPOSALS.md` | 8.1 |
| `docs/AI-EMPLOYEE-PLATFORM-BRANCH-REPORT.md` | Báo cáo này |

---

## 9. Nguyên tắc đã giữ

1. Agent data **không** đi qua `cms_records` / in-memory CMS cache.
2. Worker **không** chạy trong process web; scheduler **chỉ enqueue** job.
3. Facebook: defensive, không bypass login/checkpoint; không auto-engage.
4. Notification: một service, dedupe `eventKey`; poll 30–60s.
5. Daily report: số liệu từ DB; AI chỉ viết tóm tắt từ metrics.
6. Action proposal: human-in-the-loop; sprint 8.1 chưa thực thi trên Facebook.

---

## 10. Việc còn lại / lưu ý vận hành

1. **Commit** phần working tree (5.2 → 8.1) nếu chưa gộp vào history.
2. **`npx prisma db push`** (hoặc migrate deploy) trên môi trường có DB — bảng proposal/audit cần apply.
3. Bật scheduler: `AGENT_SCHEDULER_ENABLED=true` + chạy `agent:worker`.
4. Phase sau (ngoài scope đã làm): thực thi comment/message đã approved; Telegram/Zalo; mission.schedule điều khiển scheduler.

---

## 11. Git snapshot (lúc báo cáo)

```
Branch: feature/ai-employee-platform
Commits trên branch (tiêu biểu):
  3d43411 docs: add AI agent baseline audit
  106b23a sprint 5.1

Working tree: nhiều file modified + untracked (scheduler, notifications,
  daily report, action proposals, facebook incremental, …)
```

So với `master` (diff đã commit + tracked): ~65 files, ~+8.7k dòng (ước lượng lúc so sánh); phần untracked làm tăng thêm đáng kể.

---

*File này là báo cáo tổng hợp nội bộ cho review / handoff — không thay thế docs kỹ thuật từng sprint.*
