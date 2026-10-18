# TRUY VẾT NGHIỆP VỤ: ĐĂNG KÝ, MÃ GIỚI THIỆU & PHÊ DUYỆT ĐỘI NHÓM
**Mã tài liệu:** `WF-TRACE-01`  
**Ngày thực hiện:** 17/10/2026  
**Module:** Authentication, Referral & Team Management

---

## 1. Sơ Đồ Luồng Nghiệp Vụ (End-to-End Tracing)

```
[Người dùng truy cập /dang-nhap?mode=register]
       │
       ▼
[Nhập: Họ tên, Email, Mật khẩu, Mã giới thiệu (tùy chọn)]
       │
       ▼
POST /api/auth/register
       │
       ├──► 1. Rate Limiter (authLimiter)
       ├──► 2. Kiểm tra Email duy nhất trong bảng `users`
       │      └── Nếu đã tồn tại: 400 "Email đã tồn tại trong hệ thống."
       │
       ├──► 3. Xử lý Mã giới thiệu (`referralCode`):
       │      ├── Trường hợp 1: Có mã giới thiệu
       │      │     ├── Phân giải mã qua `resolveReferralCode(code)`:
       │      │     │     ├── Tìm trong bảng `users` qua `referral_code`
       │      │     │     └── Hỗ trợ fallback mã gốc hệ thống `REF-UOWNER`
       │      │     ├── Nếu không tìm thấy: 400 "Mã giới thiệu không tồn tại."
       │      │     └── Nếu hợp lệ:
       │      │           ├── Tìm hoặc tự động tạo `Team` cho chủ mã (`leadUserId`)
       │      │           ├── Tạo `User` với role `pending_member`
       │      │           └── Tạo bản ghi `TeamMember` với status `pending`
       │      │
       │      └── Trường hợp 2: Không có mã giới thiệu
       │            ├── Tạo `User` độc lập với role `independent`
       │            └── Cấp mã giới thiệu ngẫu nhiên 10 ký tự (`REF-XXXXXX`)
       │
       ├──► 4. Mã hóa mật khẩu an toàn bằng `scrypt` kèm salt ngẫu nhiên
       ├──► 5. Ký JWT Token kèm `token_version`
       ▼
[Trả về HTTP 200 OK: { token, user }]
       │
       ▼
[Frontend lưu localStorage -> Điều hướng vào Dashboard tương ứng với quyền]
```

---

## 2. Luồng Phê Duyệt Thành Viên Của Team Lead

```
[Team Lead đăng nhập -> Vào tab "Quản lý Team"]
       │
       ▼
GET /api/team
       │
       ├──► Xác thực Bearer Token
       ├──► Kiểm tra quyền `team.members.manage`
       ├──► Truy vấn `TeamMember` thuộc `teamId` của Team Lead
       ▼
[Hiển thị danh sách: "Thành viên chính thức" & "Chờ duyệt (Pending)"]
       │
       ▼
[Team Lead bấm "Duyệt" (Approve)]
       │
       ▼
PATCH /api/team/members/:userId
       │ Body: { status: 'approved' }
       │
       ├──► Backend kiểm tra:
       │      ├── Target `userId` có nằm trong `teamId` của Leader không? (Chống IDOR)
       │      └── `status` hợp lệ ('approved' | 'suspended')
       │
       ├──► Cập nhật `TeamMember.status = 'approved'`, `approved_by = req.user.id`
       ├──► Cập nhật `User.role = 'member'`
       ▼
[HTTP 200: Cập nhật thành công]
       │
       ▼
[Thành viên được mở khóa quyền Member: xem giỏ hàng team, nhận BĐS phân phối]
```

---

## 3. Điều Kiện Tiên Quyết & Ràng Buộc Dữ Liệu

1. **Email:** Định dạng chuẩn RFC 5322, không phân biệt hoa thường (`toLowerCase()`), là khóa duy nhất trong bảng `users`.
2. **Mật khẩu:** Tối thiểu 6 ký tự. Bắt buộc mã hóa qua `hashPassword` trước khi lưu vào cột `password_hash`. Không bao giờ lưu plaintext mật khẩu.
3. **Mã giới thiệu:** 
   - Mã hệ thống gốc của Super Admin: `REF-UOWNER` (thuộc tài khoản quản trị tối cao).
   - Mã tự sinh cho mỗi cá nhân: tiền tố `REF-` kết hợp 6-8 ký tự ngẫu nhiên in hoa.
4. **Trạng thái tài khoản (`status`):**
   - `pending`: Đang chờ Leader duyệt vào team.
   - `active`: Đang hoạt động bình thường.
   - `suspended`: Bị tạm dừng hoạt động.

---

## 4. Xử Lý Lỗi & Trường Hợp Ngoại Lệ

| Tình huống | Mã lỗi HTTP | Thông báo người dùng | Hành vi hệ thống |
| :--- | :--- | :--- | :--- |
| Nhập sai mật khẩu | 401 Unauthorized | Email hoặc mật khẩu không chính xác. | Ghi nhận lần sai vào rate limiter, không tiết lộ email có tồn tại hay không. |
| Nhập mã giới thiệu sai | 400 Bad Request | Mã giới thiệu không tồn tại. | Ngăn chặn tạo user rác, giữ nguyên form đăng ký để nhập lại. |
| Tài khoản chưa được duyệt | 200 OK (vào app) | Trạng thái Chờ duyệt | Giới hạn quyền nghiêm ngặt theo role `pending_member` (chỉ xem hồ sơ và tin mình tự đăng). |
| Đổi mật khẩu | 200 OK | Thành công | Tự động tăng `token_version`, vô hiệu hóa toàn bộ token cũ trên các thiết bị khác. |

---

## 5. Đánh Giá Trạng Thái Kiểm Chứng

- **Mức độ xác minh:** `VERIFIED_WORKING`.
- **Bằng chứng:** Đã kiểm thử luồng đăng ký tài khoản với mã `REF-UOWNER`, kiểm tra bảng `teams`, `team_members` và duyệt thành viên trên production.
