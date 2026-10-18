# TRUY VẾT NGHIỆP VỤ: MA TRẬN PHÂN QUYỀN & QUẢN LÝ GÓI TÍNH NĂNG
**Mã tài liệu:** `WF-TRACE-04`  
**Ngày thực hiện:** 17/10/2026  
**Module:** RBAC Matrix 2D, Entitlements & License Management

---

## 1. Cơ Chế Giải Quyết Quyền Hiệu Lực (Effective Permission Resolution)

Công thức xác định quyền thực tế của một người dùng khi gửi request đến hệ thống:

$$\text{Effective Permission} = \text{Base Matrix (Role)} \cap \text{Team Override (Thu hẹp)} \cap \text{Entitlement Check}$$

```
[Request có Bearer Token]
       │
       ▼
[Middleware: authMiddleware -> rbacRouteGuard / denyByDefaultGuard]
       │
       ├──► 1. Lấy thông tin User, RoleKey, TeamId
       │
       ├──► 2. Kiểm tra nếu là `super_admin` hoặc `isPlatformRootTeam`:
       │      └── Bỏ qua mọi giới hạn -> Full Access (`scope: all`)
       │
       ├──► 3. Truy vấn bảng `role_permissions` lấy quyền gốc của RoleKey:
       │      └── Base Scope: `all` | `team` | `own` | `none`
       │
       ├──► 4. Kiểm tra bảng `team_permission_overrides` của Team:
       │      └── Áp dụng hàm `narrowScope(baseScope, overrideScope)`:
       │            Chỉ được phép THU HẸP, không thể nới rộng quyền vượt trần.
       │
       ├──► 5. Kiểm tra cờ `premiumOnly`:
       │      └── Nếu là tính năng Premium:
       │            Kiểm tra bảng `entitlements` còn hạn của cá nhân hoặc team:
       │            ├── Có gói hợp lệ: Cho phép truy cập.
       │            └── Không có gói: Đánh dấu `requiresPremiumUpgrade = true` -> Trả 403.
       ▼
[Chấp thuận Request hoặc Chặn 403 Forbidden]
```

---

## 2. Luồng Thao Tác Ma Trận Phân Quyền 2D Trên Giao Diện

```
[Super Admin truy cập /admin#rbac]
       │
       ▼
GET /api/rbac/matrix
       │
       ├──► Xác thực quyền `rbac.matrix`
       ├──► Truy vấn toàn bộ 150 quy tắc trong bảng `role_permissions`
       ▼
[Render Bảng 2D: Cột là 5 Vai trò, Dòng là 30 Quyền hạn]
       │
       ▼
[Admin tick / bỏ tick Checkbox hoặc đổi Scope (all/team/own)]
       │
       ▼
PUT /api/rbac/matrix
       │ Body: { rules: [{ roleKey, permissionKey, scope, premiumOnly }] }
       │
       ├──► 1. Kiểm tra quyền Super Admin
       ├──► 2. Bảo vệ các quyền cốt lõi của Super Admin không bị xóa
       ├──► 3. Transaction ghi đè cập nhật vào bảng `role_permissions`
       ├──► 4. Xóa in-memory permission cache của server
       ▼
[Trả về HTTP 200 OK: "Cập nhật ma trận phân quyền thành công"]
       │
       ▼
[Tất cả người dùng trên hệ thống lập tức áp dụng ma trận quyền mới]
```

---

## 3. Luồng Cấp Gói Entitlement & Kích Hoạt Tool Cài Đặt

```
[Super Admin chọn User hoặc Team -> Bấm "Cấp Gói / Gia Hạn"]
       │
       ▼
POST /api/license/issue
       │ Body: { subjectType: 'user'|'team', subjectId, plan, features, durationDays }
       │
       ├──► Tạo bản ghi `Entitlement`:
       │      ├── `plan`: 'trial' (3 ngày) | 'week' | 'month' | 'custom'
       │      ├── `features`: ['crm', 'leads', 'fb_inbox', 'agent.*', 'tool.exe']
       │      ├── `starts_at`: Now
       │      └── `expires_at`: Now + durationDays
       │
       ├──► Tạo `LicenseKey` ngẫu nhiên nếu user chưa có
       ▼
[HTTP 200: Cấp thành công -> Gửi License Key cho User]
       │
       ▼
[User cài đặt HouseAndLife-Agent-Setup.exe trên máy tính Windows]
       │
       ▼
[Khởi động Tool -> Nhập License Key]
       │
       ▼
POST /api/license/activate
       │ Body: { licenseKey, deviceId, deviceName }
       │
       ├──► Băm SHA-256 licenseKey -> So khớp với `LicenseKey.keyHash`
       ├──► Kiểm tra số lượng thiết bị (`max_devices`)
       ├──► Tạo bản ghi `LicenseDevice`
       ├──► Kiểm tra `Entitlement` xem còn hạn không
       ▼
[Tool nhận phản hồi: Active thành công -> Mở khóa các module tự động hóa]
```

---

## 4. Đánh Giá Trạng Thái Kiểm Chứng

- **Mức độ xác minh:** `VERIFIED_WORKING`.
- **Bằng chứng:** Đã kiểm thử lưu ma trận 2D qua `PUT /api/rbac/matrix`, cấp key và kích hoạt device trong bảng `LicenseDevice`.
