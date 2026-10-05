# Tài Liệu Kiến Trúc Hệ Thống (System Architecture)

Tài liệu này mô tả kiến trúc tổng thể, mô hình phân tầng, nguyên lý bảo mật và luồng xử lý dữ liệu của hệ thống **Real Estate AI Marketing Agent & Multi-tenant CMS**.

---

## 1. Tổng Quan Kiến Trúc (High-Level Architecture)

Hệ thống được tổ chức theo kiến trúc phân tầng (Layered Architecture) với các rào chắn bảo mật ở từng tầng:

```
┌────────────────────────────────────────────────────────┐
│                   Client Layer                         │
│  - React 19 SPA (Dashboard, Property, CRM, CMS)        │
│  - Public Portal (SEO Landings, Real Estate Catalog)   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / REST / Webhook
┌───────────────────────────▼────────────────────────────┐
│              Security & Gateway Layer                  │
│  - Helmet (CSP, HSTS, NoSniff)                         │
│  - Express Rate Limiter (IP / Auth limiters)           │
│  - SafeFetch & DNS Pinning (Anti-SSRF)                 │
│  - RBAC Deny-by-default Gate (Route Matrix)            │
│  - Token Revocation Gate (token_version)               │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                 Core Application Layer                 │
│  - Auth Service (PBKDF2/scrypt, JWT)                   │
│  - Property Management & Auto-SEO Engine               │
│  - Multi-tenant CRM & Lead Intelligence                │
│  - AI Gateway (Gemini -> OpenAI -> Ollama Local)       │
│  - AI Safety Guardrails & PII Redactor                 │
│  - Action Proposal Engine (Human-in-the-loop Gate)     │
└───────────────────────────┬────────────────────────────┘
                            │ Prisma ORM
┌───────────────────────────▼────────────────────────────┐
│                    Data Storage Layer                  │
│  - PostgreSQL (Relational schema, Migrations, Indexes) │
│  - Optimistic Locking (Record versioning)              │
│  - AES-256-GCM Encrypted Token Storage                 │
└────────────────────────────────────────────────────────┘
```

---

## 2. Mô Hình Phân Quyền & Đa Người Thuê (Multi-tenancy & RBAC)

1. **Cách ly theo Công ty (Tenant Isolation)**:
   - Mọi thực thể nghiệp vụ (`Customer`, `Property`, `AgentFinding`, `AgentActionProposal`) đều có khóa ngoại `company_id`.
   - Hàm `buildCompanyScopeFilter(user)` tự động ép điều kiện `WHERE companyId = user.company_id` cho nhân viên và quản lý.
   - Chỉ người dùng có vai trò `platform_owner` mới có quyền xem xuyên suốt các công ty.
2. **Deny-by-default Access Control**:
   - Tất cả các API nội bộ được đăng ký trong `RBAC_PERMISSIONS_MATRIX` (`server/security/rbac.ts`).
   - Mọi request truy cập tài nguyên theo `:id` đều phải qua hàm kiểm tra `assertRecordAccess` để loại bỏ nguy cơ IDOR.

---

## 3. Kiến Trúc AI Gateway & Agent Safety

### 3.1 AI Gateway
- Quản lý điều hướng cuộc gọi thông minh giữa các mô hình: **Gemini 2.5 Flash / Pro** -> **OpenAI GPT-4** -> **Ollama Local (Qwen 2.5)**.
- Đảm bảo tính khả dụng cao: Tự động chuyển đổi nhà cung cấp dự phòng khi nhà cung cấp chính cạn quota hoặc gặp sự cố mạng.

### 3.2 AI Safety & Guardrails
- **Prompt Injection Sandbox**: Dữ liệu thu thập từ bên ngoài hoặc nhập từ người dùng luôn được bọc trong thẻ `<untrusted_data type="...">` kèm chỉ dẫn hệ thống cấm tuyệt đối việc thực thi lệnh bên trong.
- **PII Masking**: Số điện thoại và địa chỉ email tự động bị che chắn thành `[PHONE_REDACTED]` và `[EMAIL_REDACTED]` trước khi gửi ra ngoài máy chủ.
- **Real Estate Content Guardrails**: Tự động so sánh số liệu giá bán, diện tích và tính pháp lý giữa nội dung AI sinh ra và dữ liệu nguồn trong DB. Nếu phát hiện sai lệch (ví dụ: AI khẳng định "đã có sổ hồng" trong khi nguồn là "đang chờ sổ/HĐMB"), hệ thống lập tức gắn cờ `requires_manual_review: true` và cấm đăng tự động.

### 3.3 Human-in-the-Loop Gate
- Mọi hành động có tác dụng phụ (đăng bài lên fanpage, trả lời tin nhắn khách, đổi trạng thái lead) đều phải tạo bản ghi `ActionProposal` ở trạng thái `proposed`.
- Chỉ khi quản trị viên phê duyệt (`approved`), hệ thống mới cho phép thực thi, kèm theo mã băm SHA-256 của toàn bộ payload được lưu trong audit log.

---

## 4. Quản Lý Phiên & Bảo Vệ Mạng

- **Chống Timing Attacks**: Sử dụng `crypto.timingSafeEqual` cho toàn bộ các phép so sánh webhook secret và authentication tokens.
- **Chống SSRF & DNS Rebinding**: Module `safeFetch` thực hiện phân giải trước địa chỉ IP, kiểm tra với danh sách cấm (Private RFC1918, Loopback, Link-Local, CGNAT) và pin trực tiếp IP đã kiểm tra vào kết nối HTTP.
- **Upload An Toàn**: File ảnh upload được kiểm tra chữ ký nhị phân (Magic Bytes: PNG, JPEG, WEBP), cấm hoàn toàn file SVG và lưu trữ bằng chuỗi hex ngẫu nhiên.
