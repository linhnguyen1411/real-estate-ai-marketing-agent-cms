# Hướng Dẫn Xoay Secrets & Credentials Hệ Thống (Key Rotation Runbook)

Tài liệu này hướng dẫn quy trình xoay các khóa bí mật (secrets/tokens/keys) định kỳ hoặc khẩn cấp khi nghi ngờ bị lộ thông tin, tuân thủ nguyên tắc Zero-Downtime và Least-Privilege.

---

## 1. Danh Mục Secrets Cần Quản Lý

| Tên Biến Môi Trường | Độ Dài Tối Thiểu | Mục Đích | Tác Động Khi Xoay |
| :--- | :--- | :--- | :--- |
| `AUTH_SECRET` | ≥ 32 ký tự | Ký và xác thực JWT token của người dùng | Toàn bộ phiên đăng nhập cũ bị hủy; người dùng phải đăng nhập lại |
| `TOKEN_ENCRYPTION_KEY` | ≥ 32 ký tự | Mã hóa AES-256-GCM các token nhạy cảm (Facebook token, OAuth) | Phải chạy script re-encrypt dữ liệu nếu đổi key mới |
| `DATABASE_URL` | URL format | Kết nối cơ sở dữ liệu PostgreSQL | Khởi động lại service để nhận thông tin kết nối mới |
| `AGENT_RUNTIME_TOKEN` | ≥ 32 ký tự | Xác thực API giữa Agent Worker và CMS Server | Cần cập nhật đồng thời trên CMS Server và Worker |
| `FACEBOOK_APP_SECRET` | — | Xác thực chữ ký webhook Meta Graph API | Phải khớp với Meta Developer App Dashboard |
| `TELEGRAM_WEBHOOK_SECRET`| — | Chữ ký bí mật xác thực webhook từ Telegram API | Phải khớp với webhook URL đã đăng ký với BotFather |

---

## 2. Quy Trình Xoay Từng Loại Secret

### 2.1 Xoay `AUTH_SECRET` (JWT Signing Key)

1. **Sinh secret mới ngẫu nhiên và an toàn:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Cập nhật trên Server VPS:**
   - Mở file cấu hình môi trường `.env` trên VPS.
   - Cập nhật dòng `AUTH_SECRET="<SECRET_MỚI_64_KÝ_TỰ>"`.
3. **Khởi động lại tiến trình server:**
   ```bash
   pm2 restart real-estate-ai-cms
   ```
4. **Kiểm tra (Verification):**
   - Đăng nhập lại bằng tài khoản quản trị viên.
   - Thử gửi request với token cũ: Hệ thống phải trả về mã `401 Unauthorized` ngay lập tức.

---

### 2.2 Xoay `TOKEN_ENCRYPTION_KEY` (AES-256-GCM + HKDF + Key ID)

> [!WARNING]
> BẮT BUỘC: Đặt `TOKEN_ENCRYPTION_KEY_PREVIOUS` = khóa cũ TRƯỚC khi xoay để hệ thống giải mã liên tục các token v1/v2 cũ trong quá trình chuyển đổi. Nếu đổi trực tiếp `TOKEN_ENCRYPTION_KEY` mà chưa lưu khóa cũ, toàn bộ Access Token và secrets cấu hình trong database sẽ không thể giải mã được!

**Quy trình chuẩn Zero-Downtime:**
1. Sinh key mới 32 bytes (64 hex characters):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Cập nhật cấu hình môi trường `.env`:
   - **BƯỚC BẮT BUỘC TRƯỚC**: Gán giá trị khóa hiện tại sang `TOKEN_ENCRYPTION_KEY_PREVIOUS="<KHÓA_HIỆN_TẠI>"`.
   - Cập nhật `TOKEN_ENCRYPTION_KEY="<KHÓA_MỚI_VỪA_SINH>"`.
3. Chạy script di trú và mã hóa lại toàn bộ secrets sang Key ID mới (`k1`):
   ```bash
   # Kiểm tra trước không ghi DB:
   npx tsx scripts/security/reencrypt-secrets.ts --dry-run

   # Chạy thực tế:
   npx tsx scripts/security/reencrypt-secrets.ts
   ```
4. Restart service:
   ```bash
   pm2 restart real-estate-ai-cms
   ```
5. Sau khi xác nhận hệ thống ổn định, có thể gỡ bỏ `TOKEN_ENCRYPTION_KEY_PREVIOUS` khỏi `.env`.

---

### 2.3 Xoay Mật Khẩu Cơ Sở Dữ Liệu `DATABASE_URL`

1. **Đổi mật khẩu user trên PostgreSQL:**
   ```sql
   ALTER USER cms_prod WITH PASSWORD '<MẬT_KHẨU_MỚI_AN_TOÀN>';
   ```
2. **Cập nhật biến `DATABASE_URL` trong `.env`:**
   ```env
   DATABASE_URL="postgresql://cms_prod:<MẬT_KHẨU_MỚI>@127.0.0.1:5432/realestate_cms?schema=public"
   ```
3. **Kiểm tra kết nối và restart server:**
   ```bash
   npx prisma db execute --stdin <<< "SELECT 1;"
   pm2 restart real-estate-ai-cms
   ```

---

### 2.4 Xoay `AGENT_RUNTIME_TOKEN` (Worker Authentication)

1. **Sinh token mới:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
2. **Cập nhật đồng bộ trên cả 2 môi trường:**
   - Trên CMS Server: Cập nhật `AGENT_RUNTIME_TOKEN` trong `.env`.
   - Trên Worker Runtime: Cập nhật biến môi trường tương ứng của Worker.
3. **Restart cả 2 tiến trình:**
   ```bash
   pm2 restart real-estate-ai-cms
   pm2 restart real-estate-agent-worker
   ```
4. **Kiểm tra:**
   - Worker gửi heartbeat thành công (`200 OK`).

---

### 2.5 Xoay `FACEBOOK_APP_SECRET` & Webhook Token

1. Vào [Meta App Dashboard](https://developers.facebook.com/) -> **Settings** -> **Basic**.
2. Tại trường **App Secret**, chọn **Reset Secret**.
3. Cập nhật giá trị mới vào `FACEBOOK_APP_SECRET` trong `.env`.
4. Restart CMS server:
   ```bash
   pm2 restart real-estate-ai-cms
   ```
5. Thử gửi 1 webhook test từ Meta Developer Tool để xác nhận chữ ký `sha256` khớp và trả về `200 OK`.

---

## 3. Lịch Trình Khuyến Nghị (Rotation Schedule)

- **AUTH_SECRET**: 90 ngày / lần hoặc sau khi có nhân sự quản trị nghỉ việc.
- **DATABASE_URL**: 180 ngày / lần.
- **AGENT_RUNTIME_TOKEN**: 90 ngày / lần.
- **TOKEN_ENCRYPTION_KEY**: 1 năm / lần hoặc khi có sự cố an ninh.
