# KHẢO SÁT TỔNG THỂ HỆ THỐNG BDSDANANG.SITE
**Mã tài liệu:** `AUDIT-SYS-00`  
**Ngày thực hiện:** 17/10/2026  
**Chuyên viên kiểm toán:** Senior Software Architect & QA Engineer  
**Phiên bản hệ thống:** `1.0.0` (Production Live tại `https://bdsdanang.site`)

---

## 1. Ngôn Ngữ & Framework Kiến Trúc

### 1.1 Frontend
- **Framework:** React `19.0.1` Single Page Application (SPA).
- **Ngôn ngữ:** TypeScript.
- **Bundler & Build Tool:** Vite `6.2.3` kết hợp `@tailwindcss/vite` `4.1.14`.
- **Router:** `react-router-dom` `7.11.0` (Hỗ trợ định tuyến Client-side cho Portal công khai và Admin Dashboard).
- **Icons & UI:** `lucide-react` `0.546.0`, TailwindCSS v4, Markdown viewer (`react-markdown`, `remark-gfm`).
- **SEO & Meta:** `react-helmet-async` `3.0.0`.

### 1.2 Backend
- **Nền tảng:** Node.js (Yêu cầu `>= 20.0.0`, hiện đang chạy Node `v20.19.5` trên VPS).
- **Web Framework:** Express `4.21.2`.
- **Ngôn ngữ:** TypeScript, biên dịch chạy qua `tsx` ở môi trường dev và bundle thành `dist/server.cjs` (CommonJS) bằng `esbuild` `0.25.0` cho môi trường production.
- **ORM & Database Client:** Prisma ORM `5.22.0` kết nối PostgreSQL qua `pg` `8.21.0`.
- **Bảo mật:** `helmet` `8.3.0`, `express-rate-limit` `8.7.0`, `argon2` `0.45.1` & `scrypt` hashing mật khẩu, AES-256-GCM token encryption, anti-SSRF/SafeFetch với DNS Pinning.
- **Ghi log:** `pino` `10.4.0` & `pino-http` `11.0.0`.

### 1.3 Desktop Tool & Runtime Agent
- **Framework:** Electron `44.7.0`.
- **Mục đích:** Tool cài đặt Windows (`HouseAndLife-Agent-Setup.exe` 175MB) hỗ trợ tự động hóa trình duyệt cục bộ, login Facebook/Zalo an toàn qua CDP (Chrome DevTools Protocol) và Playwright `1.62.1`.
- **Xác thực:** License Key băm SHA-256 kèm mã kích hoạt thiết bị (`LicenseDevice`).

---

## 2. Kiến Trúc Phân Tầng Thực Tế

Hệ thống được tổ chức theo 4 tầng tách biệt:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Client Layer                                                        │
│ - Public Portal (React SPA): Tìm kiếm BĐS, Chi tiết tin, Dự án,       │
│   Tin tức/Blog, Landing page đầu tư, Đăng ký tư vấn / Lead Magnet.    │
│ - Admin Dashboard (React SPA): CRM, Quản lý tin, Phân phối giỏ hàng,  │
│   Quản lý Team, Ma trận RBAC 2D, Cấu hình AI & Agent.                 │
│ - Desktop Client (Electron Tool): Quét dữ liệu mạng xã hội, CDP Auto.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (bdsdanang.site)
┌───────────────────────────────────▼────────────────────────────────────┐
│ 2. Security & Gateway Layer                                            │
│ - Nginx Reverse Proxy (SSL Certbot, proxy_pass port 3000)              │
│ - Helmet (CSP, HSTS, NoSniff)                                          │
│ - Rate Limiters (Auth limiters, Public lead limiter, API rate limiters)│
│ - SafeFetch (Chống SSRF, DNS Pinning)                                  │
│ - API Auth Gate (Bearer JWT, Token Version Revocation)                 │
│ - Deny-by-default RBAC Route Guard (`server/security/rbac.ts`)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ 3. Core Application Layer                                              │
│ - Module Xác thực & Đội nhóm: Auth, Team, TeamMember, Referral.        │
│ - Module Quản lý BĐS: CmsRecord (properties), Giỏ hàng, Phân phối.     │
│ - Module Khách hàng & Lead: Customers (CRM), Leads đầu tư, Shortlink.   │
│ - Module AI & Tự động hóa: AI Gateway (Gemini/OpenAI/Ollama),         │
│   Social Publishing, Lead Intelligence (Finding), Agent Scheduler.    │
│ - Module Quyền & Bản quyền: RolePermission, Entitlement, LicenseKey.   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Prisma ORM
┌───────────────────────────────────▼────────────────────────────────────┐
│ 4. Storage & Persistence Layer                                         │
│ - PostgreSQL 18: Cơ sở dữ liệu quan hệ chính (71 models).              │
│ - Hybrid Model: Quan hệ truyền thống kết hợp CmsRecord (JSONB payload) │
│   cho các thực thể động (properties, customers, posts, inbox).         │
│ - Local Disk Storage: File tĩnh (`public/downloads`), Media runtime.  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cấu Trúc Thư Mục Dự Án

- `server/`: Mã nguồn backend Express & Prisma.
  - `bootstrap/`: Khởi tạo ứng dụng Express (`createApp.ts`), đăng ký định tuyến (`mountRoutes.ts`), middleware xử lý lỗi (`errorHandler.ts`).
  - `modules/`: Các module tính năng chuyên biệt (auth, rbac, team, license, properties, customers, crm, executive-dashboard, ai-gateway, public-site, planning, lead-acquisition, social-publishing...).
  - `security/`: Rào chắn bảo mật (RBAC route guard, mã hóa mật khẩu, kiểm soát IDOR).
  - `agent/`: Bộ lập lịch và tác vụ ngầm của Autonomous Agent (`agentScheduler.ts`).
  - `prisma.ts` & `dbHelper.ts`: Tầng giao tiếp cơ sở dữ liệu và in-memory cache.
- `src/`: Mã nguồn frontend React.
  - `App.tsx`: Khung điều khiển Admin Dashboard, quản lý trạng thái phiên, routing tab nội bộ.
  - `main.tsx`: Khởi tạo React DOM, định tuyến `react-router-dom` cho trang công khai và admin.
  - `features/`: Các màn hình theo nghiệp vụ (auth, crm, properties, dashboard, inbox, users, profile...).
  - `components/`: UI components tái sử dụng (admin, common, layout, seo).
  - `services/api.ts`: API client giao tiếp RESTful backend với token Bearer.
- `desktop/`: Ứng dụng Desktop Electron phục vụ chạy tác vụ crawl & cdp auto login.
- `prisma/`: Định nghĩa `schema.prisma` và lịch sử migrations.
- `scripts/`: Bộ script triển khai, sao lưu, quản trị VPS, kiểm tra an toàn (`deploy-safe.ps1`, `backup-prod.ps1`...).
- `docs/`: Tài liệu kỹ thuật, kiến trúc, kiểm toán bảo mật và tài liệu RAG.

---

## 4. Điểm Khởi Chạy Ứng Dụng (Entrypoints)

- **Backend Development:** `server.ts` chạy qua `npm run dev` (sử dụng `tsx`).
- **Backend Production:** `scripts/start-production.cjs` chạy `dist/server.cjs` dưới sự quản lý của PM2 process `real-estate-ai-cms`.
- **Frontend Build:** `vite build` xuất file tĩnh vào thư mục `dist/`.
- **Desktop App:** `desktop/src/main/index.ts` đóng gói qua `desktop/build.mjs`.

---

## 5. Tác Vụ Nền & Lập Lịch Tự Động (Background Workers)

Khi biến `RUN_WORKERS=true` và `AGENT_ENABLED=true`:
1. **Agent Scheduler (`server/agent/agentScheduler.ts`):** Chu kỳ lặp định kỳ (mặc định 60s) kiểm tra các `AgentSource` đến hạn để tạo `AgentJob`.
2. **Agent Sync Outbox Worker (`server/agentSync/outboxWorker.ts`):** Đồng bộ dữ liệu ra bên ngoài hoặc giữa các môi trường thông qua bảng `AgentSyncOutbox`.
3. **Telegram Control Plane (`server/modules/control-plane`):** Client Telegram Polling nhận lệnh điều khiển và đẩy cảnh báo đến các nhóm Telegram cấu hình trong `.env`.
4. **Operations Metrics Collector:** Chu kỳ 5 phút thu thập chỉ số hiệu năng hệ thống.

---

## 6. Môi Trường Vận Hành Đã Xác Minh

- **Production Live:**
  - Tên miền: `https://bdsdanang.site` (IP: `112.213.87.124`).
  - Hệ điều hành: Ubuntu Linux trên VPS.
  - Trạng thái kiểm tra: HTTP 200 OK trên `/api/health`, PM2 `online`.
  - Cơ sở dữ liệu: PostgreSQL, đã sao lưu thành công tại `data/backups/prod-db-20261017-094543.sql.gz` (517.21 MB).
- **Local Dev:**
  - URL: `http://localhost:3000`
  - Cơ sở dữ liệu: PostgreSQL trên port 5434.

---

## 7. Bảng Tổng Hợp Biến Môi Trường (Chỉ ghi tên biến)

| Tên biến | Mục đích | Yêu cầu bắt buộc |
| :--- | :--- | :--- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL | Bắt buộc |
| `AUTH_SECRET` | Khóa ký JWT (>= 32 ký tự) | Bắt buộc |
| `TOKEN_ENCRYPTION_KEY` | Khóa AES-256-GCM mã hóa bí mật | Bắt buộc |
| `AGENT_RUNTIME_TOKEN` | Khóa bảo vệ giao tiếp Agent Runtime | Bắt buộc |
| `PORT` / `HOST` | Cổng và IP lắng nghe HTTP | Tùy chọn (Mặc định 3000/0.0.0.0) |
| `DEFAULT_AI_MODE` | Provider AI mặc định (`gemini`, `openai`, `ollama`) | Tùy chọn |
| `GEMINI_API_KEY` | Khóa API Google Gemini | Cần khi dùng AI Gemini |
| `OPENAI_API_KEY` | Khóa API OpenAI GPT | Cần khi dùng AI OpenAI |
| `TELEGRAM_BOT_TOKEN` | Token Bot Telegram | Cần cho Control Plane |
| `TELEGRAM_ALLOWED_USER_IDS` | ID người dùng Telegram được phép điều khiển | Cần cho Control Plane |
| `PUBLIC_SITE_URL` | URL trang công khai (`https://bdsdanang.site`) | Bắt buộc cho SEO/Canonical |
