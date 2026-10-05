# Real Estate AI Marketing Agent & Multi-tenant CMS

Hệ thống quản trị nội dung (CMS), quản lý khách hàng (CRM) và Tự động hóa tiếp thị tích hợp **AI Marketing Agent chuyên sâu cho Bất động sản** tại Việt Nam.

Hệ thống được thiết kế theo tiêu chuẩn Enterprise-grade với kiến trúc đa người thuê (Multi-tenant), phân quyền nghiêm ngặt (RBAC deny-by-default), kiểm soát an toàn AI (Prompt Injection Defense, Guardrails, Human-in-the-loop) và hỗ trợ cơ sở dữ liệu quan hệ PostgreSQL với Prisma ORM.

---

## 🚀 Tính Năng Nổi Bật

1. **Multi-tenant CRM & Phân Quyền RBAC**:
   - Cách ly dữ liệu chặt chẽ theo `company_id`.
   - Phân quyền theo vai trò (`owner`, `admin`, `manager`, `staff`) với mô hình deny-by-default. Chống triệt để các lỗ hổng IDOR.
2. **AI Marketing Engine & Content Generator**:
   - Tự động sinh nội dung truyền thông đa kênh (Facebook, Zalo, TikTok, Website SEO) cho từng bất động sản.
   - Hỗ trợ đa nhà cung cấp qua AI Gateway: Gemini, OpenAI, Ollama (Local LLM).
   - Tự động tạo SEO Title, Meta Description, Schema Markup JSON-LD và OpenGraph tags.
3. **AI Safety & Real Estate Content Guardrails**:
   - **Chống Prompt Injection**: Toàn bộ dữ liệu người dùng, bài viết cào được cô lập trong sandbox `<untrusted_data>` với chỉ dẫn hệ thống nghiêm ngặt.
   - **Tự động che chắn PII**: Tự động phát hiện và mask số điện thoại, email trước khi gửi tới LLM bên ngoài.
   - **Real Estate Guardrails**: Kiểm tra chéo thông số giá, diện tích và tính pháp lý giữa nội dung AI sinh với bản ghi gốc trong DB; tự động chặn và yêu cầu duyệt thủ công khi phát hiện sai lệch.
4. **Action Proposal & Human-in-the-loop**:
   - Mọi hành động có tác dụng phụ (đăng bài MXH, gửi tin nhắn khách, đổi trạng thái) bắt buộc phải qua cơ chế đề xuất (`ActionProposal`) và được con người phê duyệt trước khi thực thi.
   - Nhật ký kiểm toán (Audit Trail) ghi lại mã băm SHA-256 của toàn bộ payload.
5. **Lead Intelligence & Auto Mining**:
   - Bóc tách tự động nhu cầu khách hàng từ các nhóm mạng xã hội, phân loại Buyer/Seller/Broker và tính toán Lead Score.
6. **Bảo Mật Hệ Thống & Vận Hành Bền Vững**:
   - Kiểm soát SSRF với IP/DNS pinning và chặn private subnet.
   - Đăng nhập bảo mật chống timing-attack, tự động nâng cấp hash mật khẩu sang PBKDF2/scrypt an toàn.
   - Rate limiting, token revocation tức thì khi đổi mật khẩu, cơ chế fail-fast khi thiếu secrets môi trường.

---

## 🛠 Kiến Trúc Công Nghệ

- **Backend**: Node.js (>=20), Express.js, TypeScript, Zod.
- **Database & ORM**: PostgreSQL, Prisma ORM (với migrations có thể review và optimistic locking).
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons.
- **AI & Automation**: Google Gemini, OpenAI, Ollama, Playwright (isolated CDP profiles).
- **Logging & Security**: Pino logger, Helmet, express-rate-limit.

```text
├── server/
│   ├── agent/                 # Lead intelligence, action proposal, dedup & scoring
│   ├── ai/                    # AI prompt sanitizer, PII redaction & property guardrails
│   ├── modules/               # AI gateway, social publishing, auth, public site & SEO
│   ├── security/              # RBAC matrix, SSRF safeFetch, rate limiters, token revocation
│   ├── dataLifecycle/         # Data retention jobs (cleanup chat messages cũ)
│   ├── prisma.ts              # Prisma database client
│   └── aiService.ts           # Marketing content & customer analysis service
├── src/                       # Frontend React 19 SPA dashboard
├── prisma/                    # Database schema & migrations
├── scripts/                   # Scripts vận hành, backup, setup local cluster
├── docs/                      # Tài liệu kiến trúc, runbook, hướng dẫn xoay key
└── tests/                     # Test suites bảo mật (P0 -> P7) với Vitest
```

---

## ⚡ Hướng Dẫn Cài Đặt & Chạy Cục Bộ (Local Quickstart)

### 1. Yêu Cầu Môi Trường
- Node.js >= 20.0.0
- npm >= 10.0.0
- PostgreSQL (hoặc chạy local script)

### 2. Cài Đặt Dependencies
```bash
npm install
```

### 3. Cấu Hình Môi Trường
Sao chép file `.env.example` thành `.env` và thiết lập các biến cơ bản:
```bash
cp .env.example .env
```
*(Lưu ý: Ở môi trường development, hệ thống sẽ tự sinh khóa bí mật ngẫu nhiên nếu chưa khai báo `AUTH_SECRET`).*

### 4. Khởi Tạo Cơ Sở Dữ Liệu
```bash
# Khởi động PostgreSQL và đồng bộ schema
npm run db:setup-local
# Hoặc sinh Prisma Client và chạy migration
npx prisma migrate dev
```

### 5. Khởi Chạy Ứng Dụng
```bash
# Chạy cả server và client
npm run dev
```
Hệ thống sẽ chạy tại `http://localhost:3000`.

---

## 🧪 Kiểm Thử & Đảm Bảo Chất Lượng

Dự án trang bị bộ test suite tự động kiểm tra toàn bộ các rào chắn bảo mật và luồng nghiệp vụ:

```bash
# Chạy toàn bộ test
npm test

# Chạy riêng các bài test bảo mật (P1 -> P7)
npm run test:security

# Kiểm tra static typing
npm run lint
```

---

## 📚 Tài Liệu Bổ Sung

- [Tài Liệu Kiến Trúc Hệ Thống (Architecture)](docs/ARCHITECTURE.md)
- [Sổ Tay Vận Hành & Khắc Phục Sự Cố (Runbook)](docs/RUNBOOK.md)
- [Chính Sách & Quy Trình Xoay Secret (Rotation Guide)](docs/audit/ROTATION.md)
- [Chính Sách Bảo Mật (Security Policy)](SECURITY.md)
- [Hướng Dẫn Scripts Vận Hành](scripts/README.md)
