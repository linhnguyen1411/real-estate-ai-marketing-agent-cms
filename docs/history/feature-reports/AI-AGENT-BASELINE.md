# AI Agent Baseline Audit

> Sprint baseline only — **không triển khai tính năng AI Agent mới** trong sprint này.  
> Ngày audit: 2026-07-10  
> Branch tham chiếu: `master`  
> Production: https://bdsdanang.site

---

## 1. Kiến trúc hiện tại

### 1.1 Tổng quan stack

| Lớp | Công nghệ | Ghi chú |
|-----|-----------|---------|
| Frontend | React 19 + React Router 7 + Tailwind 4 + Vite 6 | SPA, code-split lazy routes |
| Backend | Express 4 (`server.ts`) | Monolith, ~3.1k dòng |
| ORM | Prisma 5 + PostgreSQL | Bắt buộc `DATABASE_URL` |
| AI hiện có | `@google/genai`, OpenAI HTTP, Ollama HTTP | `server/aiService.ts` |
| Deploy | PM2 + nginx trên VPS | `scripts/deploy.ps1`, port prod ~3025 |

### 1.2 Express + Vite chạy chung

**Development** (`npm run dev` → `tsx server.ts`):

1. `dotenv/config` load biến môi trường.
2. `bootstrap()` gọi `ensureDatabaseReady()` — load toàn bộ CMS vào in-memory cache qua Prisma.
3. `setupViteDevServer()` tạo Vite ở **middleware mode** và gắn vào Express:
   - `app.use(viteServer.middlewares)` — serve HMR, transform module.
   - `app.get('*')` — fallback SPA, `transformIndexHtml()` cho dev.
4. Một HTTP server duy nhất (mặc định `PORT=3000`).

**Production** (`npm run build` + `npm start`):

1. `vite build` → `dist/index.html` + `dist/assets/*`.
2. `esbuild server.ts` → `dist/server.cjs` (bundle Node, `packages: external`).
3. `scripts/start-production.cjs` set `NODE_ENV=production` và `require('../dist/server.cjs')`.
4. Express serve:
   - `public/` — ảnh tĩnh (logo, property-images, blog-covers…).
   - `dist/` — frontend build (`createDistStaticOptions()`).
   - SSR nhẹ cho OG meta: `handlePublicIndex` inject title/description/schema cho property, blog, static pages.
   - `app.get('*')` — SPA fallback `dist/index.html`.

**Luồng request:**

```
Browser → nginx → Express
  ├─ /api/*           → REST handlers (JSON)
  ├─ /webhooks/*      → Facebook webhook (raw body)
  ├─ /s/:slug         → Short link redirect
  ├─ /public/*        → Static uploads
  └─ /*               → Vite (dev) hoặc dist/ + index.html (prod)
```

### 1.3 Routing frontend

**Public** (`src/main.tsx`):

- Layout `PublicSiteLayout` bọc blog, landing, contact, agents, lead magnets…
- Trang chủ + chi tiết BĐS: `PublicListingsShell` → `ListingsPage` tại `/` và `/:propertySlug`.
- Admin lazy-load: `React.lazy(() => import('./App.tsx'))` tại `/admin/*`.

**Admin CMS** (`src/App.tsx`):

- Tab state trong `localStorage` (`real_estate_ai_active_tab`).
- Menu chính: dashboard, CRM, investor leads, Facebook, short links, lead magnet content, properties, projects, AI content generator.
- Submenu SEO: `/admin/seo/posts|categories|tags|audit` (URL riêng, sync với tab).
- Auth guard: chưa login → redirect `/admin/login`.

### 1.4 Auth

| Thành phần | Chi tiết |
|------------|----------|
| Login | `POST /api/auth/login` — email/password so với `users` trong DB |
| Token | HMAC-SHA256 custom JWT-like: `base64url(payload).signature`, TTL **12 giờ** |
| Secret | `AUTH_SECRET` (fallback dev-only nếu thiếu) |
| Client storage | `localStorage` key `real_estate_ai_auth_token` (`src/services/api.ts`) |
| Middleware | `app.use('/api', …)` — mọi route trừ `/health`, `/auth/login`, `/public/*` cần `Authorization: Bearer` |
| Roles | `owner` > `company` > `member` — `scopeCollection()` lọc dữ liệu theo `company_id` / `assigned_member_ids` |
| Profile | `PUT /api/auth/profile` — name, phone, bio, avatar (data URL), public slug |

**Lưu ý bảo mật:** Token không có refresh; `AUTH_SECRET` mặc định dev không an toàn cho production nếu quên set trên VPS.

### 1.5 Prisma & data layer

**Hai mô hình song song:**

1. **CMS legacy JSON-in-Postgres** (`server/dbHelper.ts`):
   - Bảng `cms_records` lưu `customers`, `properties`, `posts`, `inbox`, `automations` dạng JSON blob.
   - `companies`, `users` — JSON + indexed columns.
   - `settings` — `AppSetting` key `app` (AI mode, tone, SEO keywords…).
   - **In-memory cache** sau `ensureDatabaseReady()`; `readDatabase()` clone, `writeDatabase()` flush transaction.

2. **Relational models** (Prisma schema riêng):
   - Blog: `BlogPost`, `Category`, `Tag`, `BlogPostAiDraft`…
   - Leads: `Lead`, `LeadEvent`, `LeadScore`…
   - Short links, Facebook CRM, chat: `ChatHistory`, `PublicChatGuest`, `GeneratedContent`.

**`server/prisma.ts`:** singleton `PrismaClient`, `checkDatabaseConnection()` cho health check.

**Deploy prod:** `npx prisma db push --accept-data-loss` trong `deploy.ps1` — **rủi ro schema drift**.

### 1.6 API & module tổ chức

| Module | File | Prefix |
|--------|------|--------|
| Core CRM/CMS | `server.ts` | `/api/customers`, `/api/properties`, `/api/posts`, … |
| AI | `server/aiService.ts` + routes trong `server.ts` | `/api/ai/*`, `/api/public/chat` |
| Blog | `server/blogRoutes.ts`, `server/blogDb.ts` | `/api/blog/*`, public `/tin-tuc` |
| Investor leads | `server/investorLeadRoutes.ts` | `/api/public/leads`, admin routes |
| Short links | `server/shortLink/*` | `/api/short-links`, `/s/:slug` |
| Facebook | `server/facebookRoutes.ts` | `/webhooks/facebook`, `/api/facebook/*` |
| Public | `server.ts` | `/api/public/properties`, `/api/public/agents`, sitemaps |

### 1.7 AI hiện có (không phải AI Agent sprint)

Đã có trong codebase, dùng cho marketing/CRM:

- `POST /api/ai/chat` — consultant nội bộ admin (context từ `getAllDataForContext()`).
- `POST /api/public/chat` — chat widget khách truy cập (session guest).
- `POST /api/ai/generate-content` — nội dung MXH theo BĐS.
- `POST /api/ai/analyze-customer` — phân tích CRM.
- `GET /api/ai/status` — trạng thái provider.
- Provider chain trong `aiService.ts`: **auto** → Ollama → OpenAI → Gemini.

---

## 2. Điểm tích hợp dự kiến cho AI Agent (sprint sau)

> Chỉ ghi nhận — **chưa implement**.

| Điểm | Vị trí đề xuất | Mục đích |
|------|----------------|----------|
| Agent orchestration API | `server/agent/` module mới + mount trong `server.ts` | Tách route/tool-calling khỏi monolith |
| Tool: đọc CRM | `dbHelper.searchCmsRecords`, `getAllDataForContext` | Agent tra cứu BĐS/khách có phạm vi quyền |
| Tool: ghi có kiểm soát | Wrapper quanh `createProperty`, `updateCustomer`… | Chỉ sau khi có policy + audit log |
| Chat session mở rộng | `ChatHistory`, `PublicChatGuest` | Unified session cho agent đa kênh |
| Blog AI drafts | `BlogPostAiDraft` | Pipeline content agent → human review |
| Generated content | `GeneratedContent` + verify flow | Agent tạo → admin xác minh trước publish |
| Settings | `AppSettings` / `settings` table | Agent tone, model, guardrails |
| Admin UI | Tab mới trong `App.tsx` hoặc route `/admin/agent` | Không đụng public UI trong sprint baseline |
| Webhook ingress | Facebook routes hiện có | Agent phản hồi Messenger có human-in-the-loop |
| Env & secrets | `.env` VPS | API keys, `AUTH_SECRET`, rate limits |

**Không nên tích hợp trực tiếp sprint đầu:**

- Thay đổi `writeDatabase()` full-transaction (dễ race, flush toàn DB).
- Auto `prisma db push` trên prod khi thêm model agent.
- Browser automation trong process Express chính (tách worker/service).

---

## 3. Rủi ro làm hỏng production

| Rủi ro | Mức | Mô tả |
|--------|-----|-------|
| `prisma db push --accept-data-loss` | **Cao** | Deploy script có thể alter/drop column nếu schema lệch |
| In-memory cache stale | **Cao** | `readDatabase`/`writeDatabase` — nhiều instance PM2 = inconsistent |
| `AUTH_SECRET` yếu/thiếu | **Cao** | Forge token admin |
| AI API keys trên VPS | **Trung bình** | Chi phí, leak qua log/env backup |
| `JSON_BODY_LIMIT=25mb` | **Trung bình** | Avatar upload data URL — DoS memory |
| OG/index handler | **Trung bình** | Sửa `handlePublicIndex` có thể break SEO/crawler |
| Facebook webhook | **Trung bình** | Raw body middleware — sai signature = miss events |
| Chat public không rate limit | **Trung bình** | Spam `/api/public/chat` |
| Ollama auto-fallback | **Thấp** | Prod không chạy Ollama — fallback sang OpenAI/Gemini |
| Lint gate trong deploy | **Thấp** | `deploy.ps1` chạy `tsc --noEmit` — fail = không deploy |

**Production hiện tại:** https://bdsdanang.site — PM2 `real-estate-ai-cms`, PostgreSQL local trên VPS, backup tại `/var/www/real-estate-ai-cms/backups/`.

---

## 4. Biến môi trường hiện có

### 4.1 Database & server

| Biến | Bắt buộc | Mặc định / ghi chú |
|------|----------|-------------------|
| `DATABASE_URL` | **Có** | PostgreSQL connection string |
| `PORT` | Không | `3000` (prod VPS: ~3025 qua PM2/env) |
| `HOST` | Không | `0.0.0.0` |
| `NODE_ENV` | Không | `production` khi `npm start` |
| `JSON_BODY_LIMIT` | Không | `25mb` |
| `APP_URL` | Không | Canonical URL, email, short links |
| `AUTH_SECRET` | **Prod: Có** | Fallback dev-only trong code |
| `PRISMA_LOG` | Không | `1` = log query |

### 4.2 AI providers

| Biến | Ghi chú |
|------|---------|
| `GEMINI_API_KEY` | Google Gemini |
| `GEMINI_MODEL` | Mặc định `gemini-2.5-flash` |
| `OPENAI_API_KEY` | OpenAI fallback |
| `OPENAI_MODEL` | Mặc định `gpt-5-mini` |
| `OPENAI_TIMEOUT_MS` | `60000` |
| `DEFAULT_AI_MODE` | `auto` \| `gemini` \| `openai` \| `ollama` |
| `OLLAMA_ENDPOINT` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `qwen3:8b` (dbHelper) / `qwen2.5` (aiService default) |
| `OLLAMA_TIMEOUT_MS` | `45000` |
| `AGENT_TONE` | Tone mặc định cho prompt |

### 4.3 Facebook

| Biến | Ghi chú |
|------|---------|
| `FACEBOOK_APP_ID` | |
| `FACEBOOK_APP_SECRET` | |
| `FACEBOOK_VERIFY_TOKEN` | Webhook verify |
| `FACEBOOK_PAGE_ID` | |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | |
| `FACEBOOK_GRAPH_VERSION` | `v25.0` |
| `FACEBOOK_TOKEN_ENCRYPTION_KEY` | Fallback `AUTH_SECRET` |

### 4.4 Email & misc

| Biến | Ghi chú |
|------|---------|
| `RESEND_API_KEY` | `server/leadEmailService.ts` |
| `BREVO_API_KEY` | Fallback email |
| `EMAIL_FROM` | Default Estoria contact |
| `IP_HASH_SALT` | Short link click hashing |
| `POSTGRES_PASSWORD` | Chỉ local setup (`.env.postgres`) |
| `ALLOW_SEO_SEED` | Guard seed script |
| `ANALYZE` | Vite bundle analyzer |
| `DISABLE_HMR` | Vite config |
| `API_BASE` | Test scripts only |

**File mẫu:** `.env.example`, `.env.postgres.example` — `.env` và `.env.*` đã gitignore (trừ example).

---

## 5. Kết quả lint / build (baseline audit)

Chạy trên Windows, 2026-07-10:

```bash
npm install    # OK — 391 packages, postinstall prisma generate
npm run lint   # OK — tsc --noEmit, exit 0
npm run build  # OK — prisma generate + vite build + esbuild server.cjs
```

**Build artifacts:**

- `dist/index.html` + `dist/assets/*` (~1.1 MB JS/CSS gzip ~170 KB largest chunk `admin-app`)
- `dist/server.cjs` ~878 KB

**Cảnh báo (không fail):**

- Vite: `MultiStepInvestorForm.tsx` vừa dynamic import vừa static import.
- npm audit: 3 vulnerabilities (1 low, 2 moderate).
- Prisma CLI: update 5.22.0 → 7.8.0 available (chưa nâng).

---

## 6. Kế hoạch rollback

### 6.1 Trước khi deploy sprint AI Agent

```powershell
# Backup production (DB + dist + .env trên VPS)
npm run backup:prod
# Hoặc tải về local:
powershell -File scripts/backup-prod.ps1 -DownloadLocal
```

Backup lưu tại: `/var/www/real-estate-ai-cms/backups/db-YYYYMMDD-HHmmss.sql`

### 6.2 Rollback code

```bash
# Trên VPS — restore dist từ backup tar (nếu có)
cd /var/www/real-estate-ai-cms
tar -xzf backups/dist-YYYYMMDD-HHmmss.tar.gz

# Hoặc redeploy commit/tag trước từ máy dev
git checkout <previous-tag>
npm run deploy:safe
```

### 6.3 Rollback database

```bash
# Trên VPS — CHỈ khi schema/data hỏng sau migrate
cd /var/www/real-estate-ai-cms
set -a && . ./.env && set +a
psql "$DATABASE_URL" < backups/db-YYYYMMDD-HHmmss.sql
pm2 restart real-estate-ai-cms --update-env
```

### 6.4 Xác minh sau rollback

```bash
curl https://bdsdanang.site/api/health
# Expect: status success, database postgresql
```

### 6.5 Khuyến nghị sprint AI Agent

1. Dùng `prisma migrate deploy` thay vì `db push --accept-data-loss` khi có migration thật.
2. Feature-flag agent routes (`AGENT_ENABLED=false` default).
3. Không ghi production từ agent cho đến khi có audit log + role check.
4. Test local: `npm run db:pg-start` → `npm run dev` → `npm run lint && npm run build`.

---

## 7. Hướng dẫn chạy local

```bash
# 1. Cài dependency
npm install

# 2. Cấu hình DB (copy .env.example → .env, chỉnh DATABASE_URL)
npm run db:setup-local
npm run db:pg-start

# 3. Kiểm tra chất lượng
npm run lint
npm run build

# 4. Dev server (Express + Vite HMR)
npm run dev
# → http://localhost:3000
# Admin → http://localhost:3000/admin/login
```

---

## 8. Phạm vi sprint baseline

| Đã làm | Chưa làm (cố ý) |
|--------|-----------------|
| Audit kiến trúc | Triển khai AI Agent |
| Document baseline | Refactor server.ts |
| Chạy lint/build | Đổi UI |
| Cập nhật `.gitignore` cho artifacts nhạy cảm | Thay đổi Prisma schema |
| | Sửa business logic |

---

*Tài liệu này là snapshot baseline; cập nhật khi bắt đầu sprint implementation.*
