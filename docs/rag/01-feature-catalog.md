# DANH MỤC TÍNH NĂNG CHI TIẾT (FEATURE CATALOG)
**Mã tài liệu:** `RAG-FEAT-01`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`  
**Nguồn bằng chứng:** Audit thực tế trên `bdsdanang.site`

---

## 1. BẢNG TỔNG HỢP CÁC TÍNH NĂNG HỆ THỐNG

| Mã tính năng | Tên tính năng | Đối tượng | Phân quyền cần có | Trạng thái xác minh |
| :--- | :--- | :--- | :--- | :--- |
| `FEAT-CATALOG` | Tìm kiếm & Lọc BĐS Công khai | Khách vãng lai, Nhà đầu tư | Công khai | `VERIFIED_WORKING` |
| `FEAT-MAGNET` | Đăng ký Nhận Tài liệu Quy hoạch/Đầu tư | Khách hàng tiềm năng | Công khai | `VERIFIED_WORKING` |
| `FEAT-AUTH-REG` | Đăng ký Thành viên & Mã Giới thiệu | Môi giới, Thành viên mới | Công khai | `VERIFIED_WORKING` |
| `FEAT-AUTH-LOG` | Đăng nhập & Thu hồi Phiên Token | Người dùng đã đăng ký | Công khai / Bearer | `VERIFIED_WORKING` |
| `FEAT-TEAM-MGR` | Quản lý Đội nhóm & Duyệt Thành viên | Team Lead, Super Admin | `team.members.manage` | `VERIFIED_WORKING` |
| `FEAT-PROP-MGR` | Đăng & Quản trị Bất động sản | Super Admin, Leader, Sale | `property.write` | `VERIFIED_WORKING` |
| `FEAT-PROP-DIST` | Phân phối Giỏ hàng Cho Thành viên | Team Lead, Super Admin | `property.distribute` | `IMPLEMENTED_UNVERIFIED` |
| `FEAT-CRM-MGR` | Quản lý Khách hàng & Phễu Chăm sóc | Super Admin, Leader, Sale | `crm` (Kèm gói Premium) | `VERIFIED_WORKING` |
| `FEAT-AI-CHAT` | Trợ lý Chatbot AI Nội bộ | Toàn bộ thành viên | `chatbot.use` | `VERIFIED_WORKING` |
| `FEAT-LEAD-RADAR` | Radar Quét Khách Hàng Tiềm Năng (Finding) | Admin, Sale có gói AI | `lead.intel` (Kèm gói) | `VERIFIED_WORKING` |
| `FEAT-RBAC-2D` | Ma trận Phân quyền Bảng 2D | Super Admin | `rbac.matrix` | `VERIFIED_WORKING` |
| `FEAT-LIC-TOOL` | Cấp Gói & Kích hoạt Desktop Tool EXE | Super Admin, Chuyên viên | `license.manage`, `tool.download` | `VERIFIED_WORKING` |
| `FEAT-EXEC-DASH` | Dashboard Chỉ Huy Trực Tuyến | Toàn bộ thành viên | `dashboard` | `VERIFIED_WORKING` |
| `FEAT-SHORTLINK` | Quản lý Link Tiếp Thị Ngắn (Shortlinks) | Chuyên viên môi giới | `shortlink.manage` | `VERIFIED_WORKING` |

---

## 2. CHI TIẾT TỪNG TÍNH NĂNG TIÊU BIỂU

### 2.1 FEAT-CATALOG: Tìm kiếm & Lọc Bất Động Sản Công Khai
- **Mục đích:** Hỗ trợ người mua và nhà đầu tư tìm kiếm chính xác nhà đất theo nhu cầu thực tế tại Đà Nẵng.
- **Vị trí:** Trang chủ (`/`), `/bat-dong-san`, `/bat-dong-san/:facet`.
- **Đầu vào:** Loại hình (Đất nền, Nhà phố, Căn hộ, Shophouse, Villa), khoảng giá (tính theo tỷ đồng), hướng nhà, diện tích tối thiểu/tối đa, từ khóa tìm kiếm.
- **Đầu ra:** Danh sách thẻ BĐS hiển thị hình ảnh đại diện, giá bán, diện tích, vị trí, số phòng, pháp lý và số điện thoại chuyên viên phụ trách.
- **Lưu ý:** Chỉ các tin ở trạng thái `available` mới hiển thị. Các tin ở trạng thái `sold` (đã bán) hoặc `hidden` (tạm ẩn) sẽ tự động bị loại khỏi danh mục công khai.

---

### 2.2 FEAT-AUTH-REG: Đăng Ký Tài Khoản Kèm Mã Giới Thiệu
- **Mục đích:** Kết nối chuyên viên môi giới mới vào mạng lưới đội nhóm của sàn.
- **Vị trí:** `/dang-nhap?mode=register` hoặc `/dang-ky`.
- **Đầu vào:** Họ tên, email, mật khẩu (tối thiểu 6 ký tự), mã giới thiệu (ví dụ: `REF-UOWNER` hoặc mã riêng của Team Lead).
- **Quy trình:**
  - Nếu nhập mã hợp lệ: Tài khoản được xếp vào trạng thái `pending_member` trong team của chủ mã.
  - Nếu không có mã: Tài khoản trở thành `independent` (Môi giới độc lập).
- **Lưu ý:** Thành viên chờ duyệt (`pending_member`) chỉ có thể đăng và xem tin của chính mình, chưa thể xem giỏ hàng nội bộ của Team cho đến khi được Trưởng nhóm duyệt.

---

### 2.3 FEAT-TEAM-MGR: Quản Lý Đội Nhóm & Phê Duyệt Thành Viên
- **Mục đích:** Trao quyền cho Trưởng nhóm quản lý nhân sự cấp dưới.
- **Vị trí:** Tab `Quản lý Team` (`/admin#team`).
- **Thao tác chính:**
  - Xem danh sách thành viên đang chờ duyệt.
  - Bấm nút **Duyệt (Approve)** để kích hoạt tài khoản thành viên chính thức (`member`).
  - Tạm dừng/Khóa thành viên vi phạm quy chế (`suspended`).
  - Thu hẹp quyền hạn của cả nhóm nếu cần (không được vượt quá trần quyền của Super Admin).

---

### 2.4 FEAT-PROP-MGR: Đăng Tin & Quản Lý Giỏ Hàng
- **Mục đích:** Xây dựng kho hàng bất động sản phong phú và chính xác cho cá nhân và toàn sàn.
- **Vị trí:** Tab `Danh sách Bất động sản` (`/admin#properties`).
- **Đầu vào bắt buộc:** Tiêu đề, loại hình, giá bán (tỷ đồng), diện tích ($m^2$), vị trí địa chỉ, pháp lý, phân loại nguồn tin: **Môi giới** hoặc **Chính chủ**.
- **Cơ chế bảo vệ:** Hệ thống tự động gán `owner_user_id` theo ID của người đang đăng nhập. Quyền sở hữu tin là bất biến để phục vụ ghi nhận công sức và chia hoa hồng sau này.
- **Xử lý xung đột:** Ứng dụng kỹ thuật Optimistic Locking qua trường `version`, tự động báo lỗi nếu có hai người cùng chỉnh sửa một tin tại một thời điểm.

---

### 2.5 FEAT-RBAC-2D: Ma Trận Phân Quyền Bảng 2 Chiều
- **Mục đích:** Giúp Quản trị viên tối cao tùy biến linh hoạt quyền hạn của 5 nhóm vai trò người dùng trong hệ thống mà không cần sửa code.
- **Vị trí:** Tab `Phân quyền & Gói` (`/admin#rbac`).
- **Đặc điểm giao diện:**
  - Bảng 2 chiều trực quan gồm 30 dòng (30 quyền hạn) và 5 cột (5 vai trò: Super Admin, Team Lead, Member, Independent, Pending Member).
  - Checkbox bật/tắt tức thì. Khi bật, cho phép chọn phạm vi dữ liệu: `Toàn hệ thống (all)`, `Trong Team (team)`, `Cá nhân (own)`.
  - Có các nút tiện ích: **Bật hết (✓)** hoặc **Tắt hết (✕)** theo từng cột vai trò.
  - Tích hợp bộ lọc theo nhóm tính năng và ô tìm kiếm quyền hạn theo từ khóa.
