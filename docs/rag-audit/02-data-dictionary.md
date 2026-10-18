# TỪ ĐIỂN DỮ LIỆU BẤT ĐỘNG SẢN & HỆ THỐNG (DATA DICTIONARY)
**Mã tài liệu:** `AUDIT-DATA-02`  
**Ngày thực hiện:** 17/10/2026  
**Chuyên viên kiểm toán:** Senior Database Architect & RAG Knowledge Engineer

---

## 1. NGUYÊN TẮC PHÂN LOẠI DỮ LIỆU TRONG RAG

Để tránh việc Chatbot AI bị ảo giác (hallucination) hoặc trả lời thông tin cũ/sai lệch, toàn bộ thông tin hệ thống được phân thành 2 nhóm rõ rệt:

- **Nhóm A — Tri thức Tương đối Ổn định (Static / Semi-Static Knowledge):**
  - Quy tắc nghiệp vụ, hướng dẫn đăng tin, điều kiện duyệt tài khoản, chính sách phân quyền, quy trình mua bán BĐS, cẩm nang đầu tư, bảng định dạng dữ liệu.
  - *Ứng dụng RAG:* Được nhúng trực tiếp vào Vector Database / Knowledge Base để AI truy xuất trả lời tự nhiên.
- **Nhóm B — Dữ liệu Động Thay Đổi Theo Thời Gian (Dynamic / Real-time Data):**
  - Giá bán cụ thể của từng căn, tình trạng tin (còn hàng hay đã bán), số lượng tin trong kho, thông tin liên hệ của từng chủ nhà, số lượng leads hôm nay.
  - *Ứng dụng RAG:* **TUYỆT ĐỐI KHÔNG** nhúng snapshot dữ liệu động cố định vào văn bản RAG. Khi người dùng hỏi về giá hay tình trạng căn cụ thể, AI phải sử dụng Function Calling / Tool Calling để truy vấn API trực tiếp hoặc hướng dẫn người dùng tra cứu trên website `https://bdsdanang.site`.

---

## 2. TỪ ĐIỂN DỮ LIỆU BẤT ĐỘNG SẢN (`Property` Payload trong `CmsRecord`)

Bảng lưu trữ chính: `cms_records` với `collection = 'properties'`.

| Tên trường thực tế | Kiểu dữ liệu | Ý nghĩa nghiệp vụ | Giá trị hợp lệ | Cho phép Null? | Quy tắc nghiệp vụ | Phân loại |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | String (CUID/UUID) | Mã định danh duy nhất của BĐS | Chuỗi ký tự không trùng lặp | Không | Tự sinh khi tạo mới | A |
| `title` | String | Tiêu đề tin đăng BĐS | Văn bản tiếng Việt có dấu | Không | Bắt buộc nhập, tối đa 255 ký tự | A |
| `type` | String | Phân loại loại hình BĐS | `Đất nền`, `Nhà Phố`, `Căn Hộ`, `Shophouse`, `Kho xưởng`, `Nhà hàng`, `Khách sạn`, `Biệt thự`, `Villa`, `Khác` | Không | Quyết định các trường đặc thù đi kèm (số phòng ngủ, tầng...) | A |
| `transaction_type` | String | Mục đích giao dịch | `Bán`, `Cho thuê` | Có (mặc định 'Bán') | Dùng để phân loại trên bộ lọc tìm kiếm | A |
| `location` | String | Địa chỉ / Khu vực BĐS | Tên quận, huyện, đường phố (Đà Nẵng/Quảng Nam) | Không | Bắt buộc nhập | A |
| `area` | Float / Number | Diện tích đất hoặc tim tường | Số thực dương | Không | Đơn vị tính: mét vuông ($m^2$) | A |
| `floor_area` | Float / Number | Tổng diện tích sàn xây dựng | Số thực dương | Có | Áp dụng cho Nhà phố, Căn hộ, Villa | A |
| `price` | Float / Number | Mức giá niêm yết | Số thực dương | Không | **Đơn vị chuẩn: Tỷ đồng VNĐ** (Ví dụ: `2.5` nghĩa là 2 tỷ 500 triệu) | B (Động) |
| `legal_status` | String | Tình trạng pháp lý của BĐS | `Sổ hồng riêng`, `HĐMB`, `Đang chờ sổ`, `Sổ đỏ chung`, `Khác` | Không | Bắt buộc kiểm tra khi AI sinh bài viết tiếp thị | A |
| `direction` | String | Hướng nhà / đất | `Đông`, `Tây`, `Nam`, `Bắc`, `Đông Nam`, `Tây Nam`, `Đông Bắc`, `Tây Bắc` | Có | Theo phong thủy nhà đất | A |
| `road_width` | Float / Number | Độ rộng đường trước nhà | Số thực dương | Có | Đơn vị: mét (m) | A |
| `bedrooms` | Integer | Số phòng ngủ | Số nguyên $>= 0$ | Có | Áp dụng cho căn hộ, nhà phố | A |
| `bathrooms` | Integer | Số phòng vệ sinh | Số nguyên $>= 0$ | Có | Áp dụng cho căn hộ, nhà phố | A |
| `pool` | Boolean | Có bể bơi riêng hay không | `true`, `false` | Có | Tiện ích BĐS | A |
| `garage` | Boolean | Có chỗ đỗ xe ô tô hay không | `true`, `false` | Có | Tiện ích BĐS | A |
| `description` | Text | Nội dung mô tả chi tiết | Văn bản tiếng Việt | Không | Mô tả vị trí, tiềm năng, kết nối giao thông | A |
| `sale_status` | String | Trạng thái kinh doanh | `available` (Đang bán), `sold` (Đã bán), `hidden` (Ẩn/Tạm ngừng) | Có (mặc định 'available') | Tin chỉ xuất hiện trên public khi là `available` | B (Động) |
| `listing_source` | String | Nguồn gốc tin đăng | `broker` (Môi giới), `owner` (Chính chủ) | Không | **Bắt buộc chọn 1 trong 2 khi tạo tin** | A |
| `owner_user_id` | String | ID người tạo tin (Chủ sở hữu) | Tham chiếu `User.id` | Không | Bất biến, hệ thống tự gán theo người tạo | A |
| `assigned_member_ids` | Array[String] | Danh sách sale được phân phối bán | Mảng ID người dùng | Có | Do Team Lead hoặc Super Admin chỉ định | B (Động) |
| `team_id` | String | ID Team sở hữu tin | Tham chiếu `Team.id` | Có | Tự động gán theo team của người đăng | A |
| `images` | String (URL) | Ảnh đại diện chính | URL ảnh hợp lệ (PNG/JPG/WEBP) | Có | Dùng hiển thị thumbnail | A |
| `gallery_images` | Array[String] | Bộ sưu tập ảnh chi tiết | Mảng URL ảnh | Có | Tối đa 20 ảnh mỗi tin | A |
| `is_featured` | Boolean | Đánh dấu tin nổi bật | `true`, `false` | Có | Ưu tiên hiển thị đầu trang chủ | B (Động) |
| `public_view_count` | Integer | Lượt xem công khai | Số nguyên $>= 0$ | Có | Tự động tăng khi có lượt xem trang | B (Động) |
| `version` | Integer | Phiên bản bản ghi | Số nguyên $>= 0$ | Không | Phục vụ Optimistic Locking chống xung đột | A |

---

## 3. TỪ ĐIỂN DỮ LIỆU KHÁCH HÀNG & LEADS (`Lead`)

Bảng lưu trữ chính: `leads`.

| Tên trường thực tế | Kiểu dữ liệu | Ý nghĩa nghiệp vụ | Giá trị hợp lệ | Cho phép Null? | Quy tắc nghiệp vụ | Phân loại |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | String (CUID) | Mã định danh duy nhất của Lead | Chuỗi ký tự | Không | Tự sinh | A |
| `name` | String | Họ và tên khách hàng | Văn bản | Không | Bắt buộc | B (Động) |
| `phone` | String | Số điện thoại liên lạc | Định dạng SĐT Việt Nam (10 số) | Không | Bắt buộc, được che chắn (PII Masking) khi cần | B (Động) |
| `email` | String | Địa chỉ thư điện tử | Email hợp lệ | Có | Dùng gửi tài liệu tự động | B (Động) |
| `city` | String | Khu vực / Tỉnh thành của khách | Hà Nội, TP.HCM, Đà Nẵng, Khác... | Có | Phân tích tệp nhà đầu tư theo vùng miền | B (Động) |
| `interestType` | String | Loại BĐS khách quan tâm | Đất nền, Căn hộ, Shophouse... | Có | Ghép cặp với giỏ hàng | B (Động) |
| `budgetRange` | String | Khoảng ngân sách dự kiến | Dưới 2 tỷ, 2-5 tỷ, 5-10 tỷ, Trên 10 tỷ | Có | Đánh giá năng lực tài chính | B (Động) |
| `investorScore` | Integer | Điểm số tiềm năng nhà đầu tư | 0 đến 100 | Có (mặc định 0) | Càng cao càng ưu tiên gọi trước | B (Động) |
| `status` | String | Trạng thái xử lý Lead | `new`, `warm`, `hot`, `closed`, `lost` | Không (mặc định 'new') | Theo dõi tiến độ chăm sóc | B (Động) |
| `source` | String | Kênh tiếp cận ban đầu | `website`, `lead_magnet`, `facebook`, `agent_radar` | Có | Đo lường hiệu quả kênh marketing | A |
| `findingId` | String | Tham chiếu bài quét AI | ID bản ghi trong `agent_findings` | Có | Chỉ có nếu nguồn từ Radar AI | A |
| `callCount` | Integer | Số lần đã gọi chăm sóc | Số nguyên $>= 0$ | Không (mặc định 0) | Theo dõi tần suất tương tác | B (Động) |
| `lastCalledAt` | DateTime | Thời điểm gọi gần nhất | ISO 8601 Timestamp | Có | Đánh giá độ tươi của việc follow-up | B (Động) |
| `lastCalledBy` | String | Chuyên viên thực hiện cuộc gọi | ID của User | Có | Phân công trách nhiệm | B (Động) |

---

## 4. TỪ ĐIỂN DỮ LIỆU ĐỘI NHÓM & PHÂN QUYỀN (`Team`, `TeamMember`, `RolePermission`, `Entitlement`)

### 4.1 Bảng `teams`
- `id` (String): Mã định danh duy nhất của Team.
- `leadUserId` (String, Unique): ID của Trưởng nhóm (Team Lead).
- `referralCode` (String, Unique): Mã giới thiệu riêng của Team để tuyển thành viên.
- `isPlatformRoot` (Boolean): Đánh dấu Team quản trị gốc của nền tảng (duy nhất 1 team sở hữu bởi Super Admin).

### 4.2 Bảng `team_members`
- `teamId` (String): ID Team tham gia.
- `userId` (String, Unique): ID thành viên (Mỗi user chỉ thuộc tối đa 1 team).
- `status` (String): Trạng thái thành viên (`pending`: Chờ duyệt; `approved`: Đã duyệt; `suspended`: Bị khóa).
- `approvedBy` (String, Nullable): ID của Leader hoặc Super Admin đã duyệt.

### 4.3 Bảng `role_permissions`
- `roleKey` (String): Vai trò áp dụng (`super_admin`, `team_lead`, `member`, `pending_member`, `independent`).
- `permissionKey` (String): Mã quyền trong 30 quyền hạn chuẩn.
- `scope` (String): Phạm vi dữ liệu được phép thao tác (`all`, `team`, `own`, `none`).
- `premiumOnly` (Boolean): Có yêu cầu gói dịch vụ trả phí (Entitlement) hay không.

### 4.4 Bảng `entitlements`
- `id` (String): Khóa chính.
- `subjectType` (String): Đối tượng hưởng quyền (`user` hoặc `team`).
- `subjectId` (String): ID tương ứng của User hoặc Team.
- `plan` (String): Loại gói (`trial`, `week`, `month`, `custom`).
- `features` (JSON): Mảng các mã tính năng được kích hoạt (Ví dụ: `["crm", "leads", "fb_inbox", "agent.*", "tool.exe"]`).
- `startsAt` / `expiresAt` (DateTime): Thời hạn hiệu lực của gói.
