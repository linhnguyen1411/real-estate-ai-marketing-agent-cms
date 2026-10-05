# BÁO CÁO KIỂM ĐỊNH BẢO MẬT & HARDENING ĐỘC LẬP
**Dự án:** Real Estate AI Marketing Agent & Multi-tenant CMS  
**Thời điểm kiểm định:** 05/10/2026  
**Vai trò:** Independent Security & Reliability Reviewer  
**Phạm vi:** Kiểm tra toàn bộ mã nguồn local, test suites, chính sách bảo mật và tài liệu vận hành. Tuyệt đối không can thiệp server VPS/Production.

---

## 1. Kết Quả Chạy Kiểm Tra Tự Động (Automated Checks Output)

### 1.1 Git Log & Diff Stat (Rút gọn)
- **Branch:** `fix/p7-p8-ai-safety-cleanup`
- **Baseline commit:** `d3734a2` (`feat(seo): implement quick post one-touch...`)
- **Commits hardening liên tiếp:**
  - `feb4483`: `chore(audit): establish phase 0 safety net, ci workflow, and audit documents`
  - `7cdc27d`: `feat(security): complete phase 1 critical fixes for webhook fail-closed, env fail-fast, and scrypt password hygiene`
  - `a9d7f11`: `feat(security): complete phase 2 http hardening, rate limiting, and token revocation`
  - `a26ce43`: `feat(security): complete phase 3 tenant isolation, rbac matrix, and idor prevention`
  - `aec9313`: `feat(security): complete phase 4 ssrf defense, file upload hardening, and xss prevention`
  - `3214fd2`: `feat(p5-p6): eliminate full-db write bottleneck, add optimistic locking, settings crypto, and operational reliability hardening`
  - `b1bea41`: `feat(p7): implement prompt injection defense, pii redaction, property guardrails, and data retention`
  - `5ef9995`: `feat(p8): repo hygiene, purge hardcoded secrets/ips, setup dependabot, and complete enterprise documentation`
- **Diff Stat so với baseline (`d3734a2..HEAD`):**
  - **109 files changed**, **6,388 insertions(+)**, **2,840 deletions(-)**.

### 1.2 Typecheck & Automated Test Results
- **`npm run lint` (`tsc --noEmit`):**
  - Exit code: `0` (0 errors).
- **`npm test` (`vitest run`):**
  - **9/9 test files passed**, **70/70 tests passed (100%)**, thời lượng 5.76s.
  - Các test suite bảo mật cốt lõi:
    - `tests/security/facebookWebhook.test.ts` (6/6 passed)
    - `tests/security/passwordHygiene.test.ts` (7/7 passed)
    - `tests/security/httpHardening.test.ts` (7/7 passed)
    - `tests/security/tenantIsolation.test.ts` (10/10 passed)
    - `tests/security/ssrfAndFiles.test.ts` (13/13 passed)
    - `tests/reliability/phase56Reliability.test.ts` (6/6 passed)
    - `tests/security/phase7AiSafety.test.ts` (11/11 passed)
    - `tests/baseline/safetyNet.test.ts` (5/5 passed)
- **`npm audit --omit=dev --audit-level=high`:**
  - `found 0 vulnerabilities`.
- **`gitleaks detect`:**
  - *Không thể thực thi* do công cụ `gitleaks` chưa được cài đặt trong môi trường Windows cục bộ.

### 1.3 Kết Quả Kiểm Tra Bằng Grep (Code Pattern Checks)
| Lệnh Kiểm Tra | Kết Quả Thực Tế | Đánh Giá |
| :--- | :--- | :--- |
| `grep -rnE "dev-only-auth-secret\|dev-runtime-token" server` | Phát hiện 1 dòng tại `server/automation-agent/index.ts:43` (`'dev-runtime-token'`) trong runner cũ; `server/config/env.ts` và core server đã loại bỏ hoàn toàn | `PARTIAL` |
| `grep -rnE "\.password\b" server` (trừ password.ts) | Chỉ xuất hiện tại `logger.ts` (redact rule), `authRoutes.ts` (migration hash), `usersRoutes.ts` (xóa trước khi trả DTO) | `DONE` |
| `grep -rnE "limit: *'25mb'" server` | 0 kết quả (body limit đã giảm xuống 1mb/2mb) | `DONE` |
| `grep -rnE "trust proxy.*true" server` | 0 kết quả (chỉ trust proxy loopback/hop 1) | `DONE` |
| `grep -rn "internal_notes" server/modules/public-site` | 0 kết quả (DTO allowlist đã lọc sạch) | `DONE` |
| `grep -rnE "\\\$\{slug\}" server/shortLink` | 0 kết quả (slug đã qua regex allowlist và HTML escape) | `DONE` |
| `grep -rnE "req\.url" server/bootstrap` | Chỉ xuất hiện 1 dòng để trích xuất `rawBody` cho Facebook webhook verification | `DONE` |

### 1.4 Kiểm Tra Tương Tác API & Status Codes Thực Tế (Supertest/Vitest)
1. `POST /webhooks/facebook` không header chữ ký: Trả về **`403 Forbidden`** (`tests/security/facebookWebhook.test.ts:53`).
2. `POST /webhooks/facebook` chữ ký sai: Trả về **`403 Forbidden`**; chữ ký đúng: **`200 OK`** (`tests/security/facebookWebhook.test.ts:65, 89`).
3. `GET /api/users`: Trả về `200 OK` và response **KHÔNG** chứa `password` hay `password_hash` (`tests/security/passwordHygiene.test.ts:70`).
4. Đăng nhập sai 6 lần liên tiếp: Lần thứ 6 trả về **`429 Too Many Requests`** (`tests/security/httpHardening.test.ts:29`).
5. `GET /s/%3Cscript%3Ealert(1)%3C%2Fscript%3E`: Trả về **`404 Not Found`**, body được escape thành `&lt;script&gt;` và CSP chặn thực thi script (`tests/security/ssrfAndFiles.test.ts:83`).
6. User vai trò `member` truy cập các route:
   - `POST /api/knowledge/reset` ⇒ **`403 Forbidden`**
   - `GET /api/investor-leads` ⇒ **`403 Forbidden`**
   - `POST /api/ai-gateway/chat` ⇒ **`403 Forbidden`**
   - `POST /api/agent/telegram/console/start` ⇒ **`403 Forbidden`** (`tests/security/tenantIsolation.test.ts:97, 126`).
7. `GET /api/public/properties`: Không rò rỉ `internal_notes`, `company_id`, `owner_user_id`, `created_by_user_id`, `assigned_member_ids`, `contact_phone` (`tests/security/tenantIsolation.test.ts:147`).
8. Khởi động với `NODE_ENV=production` thiếu `AUTH_SECRET`: Bị chặn với ngoại lệ **`[FATAL] Environment validation failed: - [AUTH_SECRET]: Invalid input...`** (`server/config/env.ts:89`).

---

## 2. Đối Chiếu Từng Phát Hiện (Comprehensive Findings Matrix)

| ID | Nhóm & Mô Tả | Trạng Thái | Bằng Chứng (File:Dòng / Test Suite) | Ghi Chú |
| :--- | :--- | :---: | :--- | :--- |
| **#1** | **Critical:** Webhook Facebook fail-open | **DONE** | `server/facebookRoutes.ts:14-48`<br>`tests/security/facebookWebhook.test.ts` (6 tests) | Fail-closed khi thiếu secret hoặc sai chữ ký; so sánh `timingSafeEqual`. |
| **#2** | **Critical:** Mật khẩu plaintext & lộ qua API | **DONE** | `server/modules/auth/password.ts`<br>`server/modules/auth/authRoutes.ts:68-80`<br>`server/modules/users/usersRoutes.ts:108`<br>`tests/security/passwordHygiene.test.ts` | Tự động nâng cấp sang scrypt khi login; xóa bỏ `password` và `password_hash` khỏi serializer response. |
| **#3** | **Critical:** Secret mặc định & fail-fast | **PARTIAL** | `server/config/env.ts:55-96`<br>`server/automation-agent/index.ts:43` | Server chính fail-fast chặn đứng production boot thiếu key; còn sót fallback `'dev-runtime-token'` ở script automation-agent cũ. |
| **A** | **Critical:** Thiếu RBAC (Route Matrix) | **DONE** | `server/security/rbac.ts:46-123`<br>`tests/security/tenantIsolation.test.ts:97, 198` | Đã khai báo 35+ routes nội bộ trong `RBAC_PERMISSIONS_MATRIX`, deny-by-default qua `rbacRouteGuard()`. |
| **B** | **Critical:** XSS qua short-link `/s/:slug` | **DONE** | `server/shortLink/shortLinkRoutes.ts:35-85`<br>`tests/security/ssrfAndFiles.test.ts:83-105` | Slug validate regex `^[a-zA-Z0-9_-]+$`; escape HTML 404 response kèm CSP `default-src 'none'`. |
| **#4** | **High:** Helmet, CORS, Rate Limit, Body Limit | **DONE** | `server/bootstrap/middleware.ts:15-58`<br>`server/middleware/cors.ts`<br>`server/middleware/rateLimiter.ts`<br>`tests/security/httpHardening.test.ts:12-45` | Bật CSP/HSTS/NoSniff, origin allowlist, body limit 1mb/2mb, rate limit 5 lần/cửa sổ. |
| **#5** | **High:** Cache toàn DB & Optimistic Lock | **DONE** | `server/dbHelper.ts`<br>`server/prisma.ts`<br>`prisma/schema.prisma:103, 137`<br>`tests/reliability/phase56Reliability.test.ts:18` | Bỏ bottleneck full-db write; thêm optimistic lock (cột `version` phát hiện conflict 409). |
| **#6** | **High:** Endpoint Public Hardening | **DONE** | `server/modules/public-site/publicSiteRoutes.ts:74`<br>`tests/security/tenantIsolation.test.ts:173` | Session ID sinh phía server (HttpOnly cookie); số điện thoại chat guest bị mask `090****567`. |
| **#7** | **High:** Tenant Deny-by-default & IDOR | **DONE** | `server/modules/auth/authAccess.ts:105-180`<br>`tests/security/tenantIsolation.test.ts:14, 50` | Record thiếu `company_id` mặc định bị chặn; IDOR giữa các tenant trả về 403/404. |
| **#8** | **High:** SSRF safeFetch & DNS Pinning | **DONE** | `server/security/safeFetch.ts`<br>`tests/security/ssrfAndFiles.test.ts:10-53` | Chặn private IP (RFC1918), link-local 169.254, CGNAT, loopback; pin IP ngăn chặn DNS rebinding. |
| **C/D**| **High:** Rò rỉ dữ liệu nội bộ ra Public | **DONE** | `server/modules/public-site/publicSiteRoutes.ts:40-65`<br>`tests/security/tenantIsolation.test.ts:147` | Lọc sạch `internal_notes`, `company_id`, `owner_user_id` trước khi trả về client. |
| **E**  | **High:** Khóa route `/api/ai-gateway/chat` | **DONE** | `server/security/rbac.ts:66`<br>`tests/security/tenantIsolation.test.ts:111` | Yêu cầu vai trò `owner`; thành viên thường (`member`) bị từ chối 403. |
| **F**  | **High:** Gán `company_id` cho các thực thể | **DONE** | `server/database/backfillCompanyId.ts`<br>`tests/reliability/phase56Reliability.test.ts` | Script backfill tự động gán tenant mặc định; bảo đảm cách ly dữ liệu. |
| **#9** | **Medium:** Log Query & Secret Telegram | **DONE** | `server/middleware/logger.ts:6-24`<br>`tests/security/httpHardening.test.ts:86` | Redact headers chứa token, query secrets và body passwords. |
| **#10**| **Medium:** ACL Telegram Control Plane | **DONE** | `server/modules/telegram/telegramConsole.ts`<br>`.env.example:74` | Kiểm tra bắt buộc user ID và chat ID trong allowlist. |
| **#11**| **Medium:** Evidence-file theo Tenant | **DONE** | `server/socialRoutes.ts:98-140`<br>`tests/security/tenantIsolation.test.ts:77` | Chặn raw path, tra cứu DB xác thực quyền tenant trước khi sendFile. |
| **#12**| **Medium:** Tách riêng khóa mã hóa token | **DONE** | `server/facebook/tokenCrypto.ts`<br>`server/config/env.ts:17` | `TOKEN_ENCRYPTION_KEY` tách biệt với `AUTH_SECRET`; mã hóa AES-256-GCM. |
| **#13**| **Medium:** Graceful Shutdown & Tách Worker | **DONE** | `server.ts:65-90`<br>`server/agent-worker/` | Bắt các tín hiệu SIGINT/SIGTERM, đóng kết nối DB sạch sẽ. |
| **G**  | **Medium:** `GET /api/public/seo` không ghi DB | **DONE** | `server/modules/public-site/seoPublicRoutes.ts:120`<br>`tests/security/tenantIsolation.test.ts:165` | Chuyển thành thuần truy vấn đọc, không gọi hàm update settings ngầm. |
| **#14**| **Low:** Hardcoded IP VPS, Chat ID, Dọn repo | **DONE** | `scripts/*.ps1`<br>`.env.example`<br>`.gitignore`<br>`package.json`<br>`docs/audit/ROTATION.md` | Xóa triệt để IP `112.213.87.124` và Telegram ID; cấu hình dependabot, loại bỏ files rác runtime. |
| **H**  | **Low:** Quản lý số điện thoại công khai | **DONE** | `server/config/env.ts:25`<br>`.env.example` | Đọc danh sách hotline công khai từ cấu hình `PUBLIC_CONTACTS`. |

---

### Bảng Con Mục A: Route Registry vs Ma Trận Quyền RBAC

| Route Pattern | Role Yêu Cầu | Test Chứng Minh 403 Forbidden |
| :--- | :---: | :--- |
| `POST /api/knowledge/reset` | `owner` | `tests/security/tenantIsolation.test.ts:98-102` |
| `POST /api/knowledge/import` | `owner` | `tests/security/tenantIsolation.test.ts:198` |
| `POST /api/decision-center/rules/reset` | `owner` | `tests/security/tenantIsolation.test.ts:105-108` |
| `POST /api/decision-center/rules` | `owner` | `tests/security/tenantIsolation.test.ts:198` |
| `POST /api/agent/telegram/console/start` | `owner` | Khai báo trong `RBAC_PERMISSIONS_MATRIX` (`rbac.ts:62`) |
| `POST /api/agent/telegram/console/stop` | `owner` | Khai báo trong `RBAC_PERMISSIONS_MATRIX` (`rbac.ts:63`) |
| `POST /api/ai-gateway/chat` | `owner` | `tests/security/tenantIsolation.test.ts:111-115` |
| `PUT /api/settings` | `owner` | `tests/security/tenantIsolation.test.ts:118-122` |
| `GET /api/investor-leads` | `company` | `tests/security/tenantIsolation.test.ts:128-131` |
| `GET /api/users` | `company` | `tests/security/tenantIsolation.test.ts:134-137` |
| `GET /api/admin/short-links` | `company` | `tests/security/tenantIsolation.test.ts:140-143` |
| `GET /api/facebook/inbox` | `company` | Khai báo trong `RBAC_PERMISSIONS_MATRIX` (`rbac.ts:86`) |
| `POST /api/properties/batch-import` | `company` | Khai báo trong `RBAC_PERMISSIONS_MATRIX` (`rbac.ts:103`) |
| `GET /api/executive/dashboard` | `company` | Khai báo trong `RBAC_PERMISSIONS_MATRIX` (`rbac.ts:106`) |

---

## 3. Rủi Ro Còn Lại & Việc Người Dùng Phải Tự Làm (Checklist)

### 3.1 Checklist Xoay Secrets Cần Thực Hiện Ngay Trên VPS
- [ ] `AUTH_SECRET`: Sinh chuỗi ngẫu nhiên mới (≥32 bytes) và cập nhật `.env` trên VPS.
- [ ] `TOKEN_ENCRYPTION_KEY`: Sinh key mới và re-encrypt lại token Facebook cũ nếu đã lưu.
- [ ] `DATABASE_URL`: Đổi mật khẩu tài khoản PostgreSQL trên máy chủ VPS.
- [ ] `AGENT_RUNTIME_TOKEN`: Đặt token ngẫu nhiên mới đồng bộ giữa server và worker.
- [ ] `FACEBOOK_APP_SECRET`: Đặt lại secret trong Meta Developer Console.
- [ ] `TELEGRAM_BOT_TOKEN` & `TELEGRAM_WEBHOOK_SECRET`: Xoay token qua BotFather và cập nhật URL webhook.
- [ ] `GEMINI_API_KEY` / `OPENAI_API_KEY`: Đổi key trên Google AI Studio / OpenAI Platform.

### 3.2 Migrations & Dữ Liệu
- [ ] Chạy migration trên VPS: Chạy lệnh `npx prisma migrate deploy` (TUYỆT ĐỐI KHÔNG dùng `db push`).
- [ ] Chạy script backfill gán tenant: `node scripts/archive/...` hoặc backfill script với cờ `--dry-run` trước khi áp dụng chính thức.
- [ ] Mật khẩu cũ: Buộc toàn bộ người dùng đổi mật khẩu hoặc thông báo đăng nhập lại để hệ thống tự động băm lại mật khẩu sang chuẩn scrypt.

### 3.3 Hạ Tầng & Bên Thứ Ba
- [ ] Cấu hình Nginx reverse proxy: Thiết lập giới hạn `client_max_body_size 10M;` và chuyển tiếp đúng header `X-Forwarded-For`.
- [ ] Telegram Webhook: Đăng ký lại Webhook với Telegram API kèm tham số `secret_token` tương ứng với `TELEGRAM_WEBHOOK_SECRET`.
- [ ] Lịch sử Git: Cài đặt công cụ `gitleaks` hoặc `git-filter-repo` để quét và thanh tẩy các commit cũ trong quá khứ nếu từng commit nhầm token test.

---

## 4. Kiểm Tra Hồi Quy Nghiệp Vụ (Regression Assessment)

| Luồng Nghiệp Vụ | Trạng Thái Kiểm Tra | Bằng Chứng / Ghi Chú |
| :--- | :---: | :--- |
| Đăng nhập 3 roles (`owner`, `company`, `member`) | **ĐÃ TEST** | Pass 100% trong `tests/security/passwordHygiene.test.ts` & `tenantIsolation.test.ts`. |
| CRUD Bất động sản & Khách hàng CRM | **ĐÃ TEST** | Pass trong `safetyNet.test.ts` và `tenantIsolation.test.ts`. |
| Chat tư vấn Public & Lưu Guest Session | **ĐÃ TEST** | Pass trong `tenantIsolation.test.ts:173`. |
| Webhook Facebook (Xác thực chữ ký & Challenge) | **ĐÃ TEST** | Pass 100% trong `facebookWebhook.test.ts`. |
| Đề xuất AI & Content Guardrails BĐS | **ĐÃ TEST** | Pass 100% trong `phase7AiSafety.test.ts`. |
| Đóng gói Build Frontend (Vite) + Backend Bundle | **ĐÃ TEST** | Lệnh `npm run build` hoàn thành trong 8.6s, file `dist/server.cjs` (2.9 MB). |
| Agent Worker cào bài trực tiếp qua Browser | **CHƯA TEST LIVE** | Môi trường test chỉ mock browser session; cần chạy thử lệnh `npm run agent:worker` trên môi trường thực tế kèm Chrome profile. |
| Đăng bài Facebook thực tế (Graph API / Browser) | **CHƯA TEST LIVE** | Tắt legacy graph webhook trong test; cần test kết nối Fanpage thật khi deploy. |

---

## 5. Chấm Điểm & Kết Luận

### 5.1 Tỷ Lệ Hoàn Thành Theo Mức Độ
- **Critical:** **4.5 / 5** (Đạt 90% — Vẫn còn chuỗi fallback `'dev-runtime-token'` tại file cũ `server/automation-agent/index.ts`).
- **High:** **9 / 9** (Đạt 100%).
- **Medium:** **6 / 6** (Đạt 100%).
- **Low:** **2 / 2** (Đạt 100%).

### 5.2 Kết Luận Triển Khai
> **CÓ THỂ DEPLOY LÊN PRODUCTION NẾU ĐÁP ỨNG CÁC ĐIỀU KIỆN SAU:**
> 1. Xóa nốt chuỗi fallback `'dev-runtime-token'` trong file `server/automation-agent/index.ts`.
> 2. Cung cấp đầy đủ các biến môi trường bắt buộc (≥32 ký tự) trên VPS: `AUTH_SECRET`, `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `AGENT_RUNTIME_TOKEN`.
> 3. Triển khai bằng lệnh chuẩn `npm run deploy:safe` (`prisma migrate deploy`), tuyệt đối không dùng `prisma db push`.

### 5.3 Top 5 Rủi Ro Hàng Đầu Còn Lại
1. **Lộ Secret trong Lịch sử Git cũ:** Các commit trước đợt hardening có thể chứa token hoặc IP cũ trong git history nếu chưa chạy `git filter-repo`.
2. **Fallback Token trong file phụ:** File `server/automation-agent/index.ts:43` vẫn chứa chuỗi `dev-runtime-token` nếu biến môi trường bị bỏ trống.
3. **Mật khẩu người dùng chưa đăng nhập:** Những user chưa đăng nhập lại vẫn lưu mật khẩu dạng plaintext cũ trong DB cho đến khi thực hiện login lần đầu để tự động nâng cấp.
4. **Mất phiên đăng nhập đồng loạt:** Sau khi nạp `AUTH_SECRET` mới chuẩn 32 ký tự trên prod, toàn bộ nhân viên sẽ bị đăng xuất và phải đăng nhập lại.
5. **Cấu hình Reverse Proxy Nginx:** Nếu Nginx trên VPS không chuyển tiếp header IP chính xác, rate limiter có thể chặn nhầm IP của Nginx nội bộ (`127.0.0.1`).

### 5.4 Đề Xuất Bước Kế Tiếp Theo Thứ Tự Ưu Tiên
1. Xóa chuỗi fallback `'dev-runtime-token'` tại `server/automation-agent/index.ts:43`.
2. Hợp nhất (Merge) branch `fix/p7-p8-ai-safety-cleanup` vào branch chính.
3. Chuẩn bị file `.env` trên VPS theo tài liệu `docs/audit/ROTATION.md`.
4. Chạy backup cơ sở dữ liệu VPS bằng script `scripts/backup-prod.ps1`.
5. Thực hiện triển khai qua script an toàn: `npm run deploy:safe`.
