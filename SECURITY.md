# Chính Sách Bảo Mật (Security Policy)

Hệ thống Real Estate AI Marketing Agent CMS cam kết duy trì tiêu chuẩn bảo mật cao nhất nhằm bảo vệ dữ liệu khách hàng, tài sản doanh nghiệp và đảm bảo tính toàn vẹn của các chiến dịch truyền thông.

---

## 1. Báo Cáo Lỗ Hổng Bảo Mật (Reporting a Vulnerability)

Nếu bạn phát hiện bất kỳ vấn đề hoặc lỗ hổng bảo mật nào trong hệ thống, xin vui lòng **KHÔNG tạo public issue trên GitHub**.

Vui lòng thực hiện theo quy trình báo cáo có trách nhiệm (Responsible Disclosure):
1. Gửi email thông báo chi tiết đến đội ngũ bảo mật tại: `security@bdsdanang.site` (hoặc thông qua kênh nội bộ khẩn cấp).
2. Bao gồm các thông tin cần thiết:
   - Mô tả lỗ hổng và phạm vi ảnh hưởng.
   - Các bước tái hiện chi tiết (Proof of Concept - PoC).
   - Đánh giá mức độ nghiêm trọng và gợi ý phương án khắc phục (nếu có).
3. Đội ngũ kỹ thuật sẽ phản hồi xác nhận trong vòng **24 giờ** và cam kết đưa ra bản vá trong vòng **72 giờ** đối với các lỗ hổng nghiêm trọng (Critical/High).

---

## 2. Tiêu Chuẩn & Rào Chắn Bảo Mật Được Áp Dụng

Hệ thống áp dụng các nguyên tắc phòng thủ theo chiều sâu (Defense-in-depth):

### 2.1 Quản Lý Danh Tính & Xác Thực (Authentication & Credentials)
- **Mật khẩu an toàn**: Toàn bộ mật khẩu được băm bằng thuật toán an toàn PBKDF2/scrypt kèm salt ngẫu nhiên; tự động nâng cấp mật khẩu cũ khi người dùng đăng nhập.
- **Fail-closed & Timing Attack**: Mọi phép so sánh token/chữ ký đều dùng `crypto.timingSafeEqual`.
- **Token Revocation**: Cơ chế `token_version` cho phép hủy bỏ tức thì mọi JWT token khi người dùng đổi mật khẩu hoặc bị thu hồi quyền.

### 2.2 Phân Quyền & Cách Ly Đa Người Thuê (Multi-tenant RBAC)
- **Deny-by-default**: Mọi API nội bộ đều mặc định từ chối truy cập trừ khi được khai báo quyền rõ ràng trong `RBAC_PERMISSIONS_MATRIX`.
- **Chống IDOR**: Mọi thao tác truy vấn và chỉnh sửa theo ID bản ghi đều kiểm tra quyền sở hữu tenant (`company_id`).

### 2.3 Phòng Chống Tấn Công Mạng (Network & Input Hardening)
- **Chống SSRF**: Tất cả các yêu cầu tải URL từ người dùng hoặc mạng xã hội đều đi qua `safeFetch` với cơ chế phân giải DNS, chặn dải IP Private/Loopback/Link-local/CGNAT và áp dụng IP Pinning để ngăn chặn DNS Rebinding.
- **Xử lý tệp tin tải lên**: Kiểm tra Magic Bytes nhị phân thực tế của file ảnh (chặn hoàn toàn SVG để phòng ngừa XSS lưu trữ).
- **Rate Limiting**: Giới hạn tần suất request theo IP và user ID đối với các endpoint nhạy cảm (auth, webhooks).

### 2.4 An Toàn AI & Vận Hành Agent
- **Chống Prompt Injection**: Dữ liệu đầu vào không tin cậy được bọc trong thẻ XML `<untrusted_data>` và kèm chỉ thị hệ thống nghiêm ngặt cấm LLM thực hiện lệnh ghi đè.
- **Redaction PII**: Tự động che chắn số điện thoại và email trước khi gọi LLM bên ngoài.
- **Human-in-the-loop**: Cấm tuyệt đối LLM tự động thực thi các hành động có tác dụng phụ (đăng bài, nhắn tin) mà chưa qua phê duyệt của con người (`ActionProposal`).
- **Real Estate Content Guardrails**: Tự động kiểm tra giá trị thực của giá, diện tích và pháp lý so với cơ sở dữ liệu để loại bỏ hiện tượng bịa đặt thông tin (AI hallucination).

---

## 3. Các Phiên Bản Được Hỗ Trợ (Supported Versions)

| Phiên Bản | Được Hỗ Trợ Vá Lỗi Bảo Mật |
| :--- | :--- |
| `1.0.x` | ✅ Có (Hiện tại) |
| `< 1.0.0` | ❌ Không |
