# RUNBOOK — real-estate-ai-marketing-agent-cms

Đây là **1 doc duy nhất** trả lời "vào dự án/cần chạy tay thì làm gì" — gộp từ 5 file rời trước đây (`POSTGRES_SETUP.md`, `docs/engineering/RELEASE_PROCESS.md`, `docs/refactor/DATA-RETENTION-POLICY.md`, `scripts/fleet/README.md`, `docs/runtime/BROWSER-LIFECYCLE.md`). 5 file gốc **giữ nguyên tại chỗ** làm tài liệu chi tiết — file này là bản tóm tắt, đi thẳng vào lệnh cần chạy.

---

## 1. Chạy local lần đầu

```bash
# 1) Postgres local — ưu tiên cluster dev của repo (port 5434):
npm run db:setup-local
# (hoặc tự cài Postgres service port 5432 rồi tạo DB thủ công)

# 2) Tạo .env ở root
cp .env.example .env
# sửa DATABASE_URL, GEMINI_API_KEY, PORT trong .env
# DATABASE_URL phải bắt đầu đúng postgresql:// (không thêm chữ/prefix trước URL)
# ví dụ cluster local: postgresql://real_estate_ai:localdev@localhost:5434/real_estate_ai?schema=public

# 3) Cài deps + generate Prisma client + tạo bảng
npm install
npx prisma generate
npx prisma migrate dev --name init

# 4) Chạy (xem mục 2)
npm run dev

```

→ http://localhost:3000. Prisma Studio: `npx prisma studio` → http://localhost:5555

## 2. Chạy lại local + agent (hàng ngày)

Mở **3 terminal** ở root repo. CDP Chrome giữ mở sau khi login Facebook.

**Terminal A — CMS (local DB):**

```bash
npm run db:pg-start    # nếu Postgres cluster local (5434) đang tắt
npm run dev            # free port + ensure PG + start server → http://localhost:3000
```

**Terminal B — Chrome CDP (chỉ cần khi agent cần browser):**

```powershell
.\scripts\fleet\start-cdp-chrome.ps1
# giữ cửa sổ Chrome mở; login Facebook nếu chưa login
```

**Terminal C — Agent** (chọn **một** mode):

```powershell
# Mode 1 — Agent local (DB-direct, scheduler local): scan/publish trên máy này
.\scripts\fleet\start-scan-worker.ps1

# Mode 2 — Execution agent gắn VPS Runtime (claim job từ production):
$env:EXECUTION_AGENT_STATELESS='1'
$env:AGENT_BROWSER_MODE='cdp'
$env:AGENT_WORKER_ID='worker-linhmsc'          # giữ ổn định theo máy
$env:AGENT_CDP_ENDPOINT='http://127.0.0.1:9222'
$env:AGENT_RUNTIME_URL='https://bdsdanang.site'
npm run automation-agent
```

Linux/macOS (CDP + local worker):

```bash
bash scripts/fleet/start-cdp-chrome.sh
bash scripts/fleet/start-scan-worker.sh
```

**Healthy khi:**

- CMS log: `[DB] PostgreSQL sẵn sàng` + `listening on port 3000`
- Agent mode 1: worker loop poll
- Agent mode 2: `Registered session=…` + `Loop started`
- CDP sống: mở `http://127.0.0.1:9222/json/version` thấy JSON Chrome

**Lỗi hay gặp:**

| Triệu chứng | Cách xử lý |
|-------------|------------|
| `URL must start with the protocol postgresql://` | Sửa `.env`: `DATABASE_URL="postgresql://…"` — không prefix/`"` thừa |
| CMS chạy nhưng `[DB] Không kết nối` | `npm run db:pg-start`; kiểm tra port trong URL (5434 cluster vs 5432 service) |
| Agent: `CDP unreachable` | Chạy lại Terminal B |
| Port 3000 bận | `npm run dev` đã gọi `free-dev-ports`; hoặc tắt process cũ rồi chạy lại |

Tắt Postgres khi xong: `npm run db:pg-stop`

## 3. Build & kiểm tra trước khi build production

```bash
npm run lint            # tsc --noEmit — bắt lỗi type trước
npm run build            # prisma generate + vite build + esbuild server.ts -> dist/server.cjs
npm run start             # chạy bản đã build (node scripts/start-production.cjs)

```

Không build/deploy nếu `npm run lint` còn lỗi.

## 4. Database — sync/pull từ production về local

```bash
npm run db:pull-prod          # kéo schema/data prod về
npm run db:setup-local        # setup lại local db
npm run prisma:push
npm run db:sync-prod          # hoặc gộp cả 3 bước trên bằng:
npm run db:pull-and-sync

```

## 5. Backup & Restore

**Backup thủ công (local):**

```bash
pg_dump -U postgres real_estate_ai > backup.sql
psql -U postgres real_estate_ai < backup.sql   # restore

```

**Backup production (script chính thức):**

```bash
npm run backup:prod
# hoặc download về máy local luôn:
powershell -ExecutionPolicy Bypass -File scripts/backup-prod.ps1 -DownloadLocal

```

**Chính sách retention (tự động dọn data cũ, không đụng data quan trọng):**

```bash
npm run cleanup:db-tech-retention              # dry-run mặc định — chỉ xem sẽ xoá gì
npm run cleanup:db-tech-retention -- --apply    # xoá thật
npm run cleanup:agent-runtime                   # dọn debug screenshots/files sau 7-14d

```

Không bao giờ tự xoá: `ScannedContent`, `AgentFinding`, CRM `Lead`, External/Official Inventory. Chi tiết đầy đủ bảng retention từng table: `docs/refactor/DATA-RETENTION-POLICY.md`.

## 6. Chrome CDP + Scan/Publish worker (chi tiết)

Lệnh start hàng ngày → **mục 2**. Env overrides / checklist session → `scripts/fleet/README.md`.

Vòng đời browser (debug lease treo): `idle → lease(job) → active → heartbeat ~10s → job xong → release → idle`. Hết heartbeat >45s → reclaim idle. Chi tiết: `docs/runtime/BROWSER-LIFECYCLE.md`.

## 7. Deploy production

**Trước khi deploy** (checklist rút gọn — bản đầy đủ ở `docs/engineering/RELEASE_PROCESS.md`):

- [ ] `npm run lint` pass
- [ ] Cleanup xong (dọn code/test data/script rác — xem mục "Clean Repository" trong Constitution)
- [ ] Biết cách rollback (commit/tag trước đó)
- [ ] Nếu đổi schema: backup DB trước khi `prisma migrate deploy`

**Deploy (luôn dùng bản safe, không dùng** `deploy.ps1` **— xem ghi chú rủi ro bên dưới):**

```bash
npm run deploy:safe

```

**Health check sau deploy:**

```bash
curl -sS https://bdsdanang.site/api/health

```

Không phải HTTP 200 → dừng → rollback (redeploy commit tốt gần nhất, `no force-push to main`).

⚠️ `scripts/deploy.ps1` (chạy qua `npm run deploy`, không phải `deploy:safe`) dùng `prisma db push --accept-data-loss` — rủi ro mất dữ liệu, chưa được sửa. Dùng `npm run deploy:safe` cho tới khi việc này được xử lý dứt điểm (xem mục rules mới — Clean Repository check).

---

## Tài liệu chi tiết đầy đủ (giữ nguyên, không xoá)

- `scripts/README.md` — danh sách script ops còn giữ ở root `scripts/`
- `POSTGRES_SETUP.md` — cài đặt Postgres, troubleshooting kết nối
- `docs/engineering/RELEASE_PROCESS.md` — quy trình release đầy đủ, template Release Report
- `docs/refactor/DATA-RETENTION-POLICY.md` — bảng retention từng table
- `scripts/fleet/README.md` — bootstrap Chrome CDP chi tiết
- `docs/runtime/BROWSER-LIFECYCLE.md` — state machine browser lease
- Lịch sử audit/refactor hệ thống → xem `docs/history/INDEX.md`
- Probe / test / one-off cũ → `scripts/archive/` (không gắn npm)

