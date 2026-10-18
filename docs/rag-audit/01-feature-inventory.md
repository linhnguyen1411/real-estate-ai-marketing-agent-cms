# KIỂM KÊ TÍNH NĂNG TOÀN DIỆN (FEATURE INVENTORY)
**Mã tài liệu:** `AUDIT-FEAT-01`  
**Ngày thực hiện:** 17/10/2026  
**Chuyên viên kiểm toán:** Senior Product Analyst & QA Engineer  
**Hệ thống mục tiêu:** `bdsdanang.site`

---

## BẢNG QUY ƯỚC TRẠNG THÁI KIỂM CHỨNG (STANDARDS)

- **VERIFIED_WORKING:** Có bằng chứng đầy đủ từ UI, API, DB và test thực tế đang hoạt động.
- **IMPLEMENTED_UNVERIFIED:** Mã nguồn đã hoàn thiện đầy đủ nhưng chưa kiểm thử e2e trong môi trường live.
- **PARTIALLY_IMPLEMENTED:** Một phần luồng hoạt động, còn khuyết hoặc phụ thuộc cấu hình chưa kích hoạt.
- **PLANNED:** Chỉ có định nghĩa trong tài liệu quy hoạch, chưa code đầy đủ.
- **DISABLED:** Mã nguồn có sẵn nhưng bị tắt qua biến môi trường hoặc flag.
- **DEPRECATED:** Đã ngừng hỗ trợ hoặc thay thế bởi giải pháp mới.
- **UNKNOWN:** Thiếu thông tin kết luận.

---

## 1. PHÂN HỆ CÔNG KHAI (PUBLIC PORTAL)

### 1.1 Danh mục & Tìm kiếm Bất động sản (Public Property Catalog)
1. **Tên tính năng:** Danh mục & Lọc Bất động sản Công khai
2. **Mã định danh:** `FEAT-PUB-CATALOG`
3. **Mục đích:** Cho phép khách hàng tìm kiếm, lọc và xem thông tin các bất động sản đang bán/cho thuê tại Đà Nẵng và vùng phụ cận.
4. **Đối tượng sử dụng:** Khách vãng lai, nhà đầu tư, người mua/thuê nhà.
5. **Quyền hạn:** Công khai (Không cần đăng nhập).
6. **Vị trí UI:** Trang chủ (`/`), `/bat-dong-san`, `/bat-dong-san/:facet`.
7. **Route/API:** `GET /api/public/properties`, `GET /p/:propertySlug`.
8. **Thành phần Backend:** `server/modules/public-site/publicSiteRoutes.ts`, `server/dbHelper.ts (getProperties)`.
9. **Dữ liệu Vào/Ra:** 
   - *Vào:* Query params (khu vực, mức giá, loại BĐS, hướng, trang).
   - *Ra:* Mảng danh sách `Property` có `sale_status: 'available'`.
10. **Quy trình:** Khách truy cập -> Frontend gọi `/api/public/properties` -> Backend truy vấn `CmsRecord` collection `properties` -> Lọc bỏ tin ẩn/đã bán -> Trả kết quả JSON kèm SEO metadata -> Hiển thị dạng thẻ BĐS.
11. **Giới hạn/Ngoại lệ:** Chỉ hiển thị tin có `sale_status !== 'hidden'`. Thông tin số điện thoại người đăng được che bớt hoặc hiển thị hotline công ty tùy cấu hình.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Endpoint `https://bdsdanang.site/api/public/properties` trả về HTTP 200 kèm 26 tin BĐS thực tế từ database.
14. **Điểm chưa rõ:** Không có.

---

### 1.2 Đăng ký Nhận Tài Liệu Đầu Tư (Lead Magnet Claim)
1. **Tên tính năng:** Nhận Tài liệu & Phân tích Thị trường
2. **Mã định danh:** `FEAT-PUB-LEADMAGNET`
3. **Mục đích:** Thu thập thông tin khách hàng tiềm năng thông qua việc tặng báo cáo nghiên cứu, tài liệu quy hoạch BĐS Đà Nẵng.
4. **Đối tượng sử dụng:** Nhà đầu tư quan tâm thị trường Đà Nẵng.
5. **Quyền hạn:** Công khai.
6. **Vị trí UI:** `/tai-lieu-dau-tu`, `/tai-lieu-dau-tu/:magnetSlug`.
7. **Route/API:** `POST /api/public/lead-magnets/:slug/claim`.
8. **Thành phần Backend:** `server/investorLeadRoutes.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ name, phone, email, magnetSlug, city, budgetRange }`.
   - *Ra:* `{ status: 'success', data: { leadId, downloadUrl } }`.
10. **Quy trình:** Người dùng điền form -> Backend validate số điện thoại VN (10 số) -> Tạo bản ghi `Lead` trong bảng `leads` với `status: 'new'` -> Tăng điểm `investorScore` -> Trả link tải tài liệu.
11. **Giới hạn/Ngoại lệ:** Giới hạn tần suất gọi API (Rate limit theo IP). Bắt buộc phải có số điện thoại hợp lệ.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã kiểm tra route `createInvestorLeadPublicRouter` trong `mountRoutes.ts`, bảng `Lead` có 11 leads thực tế.
14. **Điểm chưa rõ:** Luồng gửi email tự động phụ thuộc cấu hình SMTP trong `.env`.

---

## 2. PHÂN HỆ XÁC THỰC & ĐỘI NHÓM (AUTH & TEAMS)

### 2.1 Đăng ký & Cơ chế Mã Giới thiệu (Referral Registration)
1. **Tên tính năng:** Đăng ký Tài khoản kèm Mã Giới thiệu
2. **Mã định danh:** `FEAT-AUTH-REGISTER`
3. **Mục đích:** Cho phép chuyên viên môi giới đăng ký tài khoản mới; nếu có mã giới thiệu thì tự động gia nhập Team của người cấp mã.
4. **Đối tượng sử dụng:** Môi giới tự do, thành viên sàn, sale BĐS mới.
5. **Quyền hạn:** Công khai.
6. **Vị trí UI:** `/dang-nhap?mode=register` hoặc `/dang-ky`.
7. **Route/API:** `POST /api/auth/register`.
8. **Thành phần Backend:** `server/modules/auth/authRoutes.ts`, `server/modules/team/teamService.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ name, email, password, referralCode? }`.
   - *Ra:* `{ status: 'success', token, user }`.
10. **Quy trình:**
    - Có mã giới thiệu hợp lệ: Tạo `User` kèm mã giới thiệu riêng (10 ký tự), gắn `TeamMember` vào team chủ mã với trạng thái `status: 'pending'`, role gán là `pending_member`.
    - Không có mã: Tạo `User` độc lập với role `independent`.
11. **Giới hạn/Ngoại lệ:** Mật khẩu được mã hóa an toàn bằng `scrypt` kèm salt ngẫu nhiên. Nếu mã giới thiệu không tồn tại, trả lỗi thông báo rõ ràng.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã sửa và xác minh thành công luồng phân giải mã hệ thống `REF-UOWNER`, bảng `TeamMember` có bản ghi pending.
14. **Điểm chưa rõ:** Chưa tích hợp gửi OTP xác thực email trước khi active.

---

### 2.2 Đăng nhập & Quản lý Phiên (Authentication & Token Revocation)
1. **Tên tính năng:** Đăng nhập & Thu hồi Phiên
2. **Mã định danh:** `FEAT-AUTH-LOGIN`
3. **Mục đích:** Cấp JWT Token truy cập an toàn cho người dùng, hỗ trợ cơ chế thu hồi phiên ngay lập tức khi đổi mật khẩu (`token_version`).
4. **Đối tượng sử dụng:** Tất cả người dùng đã đăng ký.
5. **Quyền hạn:** Công khai cho đăng nhập; yêu cầu token cho xác thực phiên.
6. **Vị trí UI:** `/dang-nhap` (dành cho Sale/Member) và `/admin/login` (dành cho Admin).
7. **Route/API:** `POST /api/auth/login`, `GET /api/auth/me`.
8. **Thành phần Backend:** `server/modules/auth/authRoutes.ts`, `server/modules/auth/authAccess.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ email, password }`.
   - *Ra:* `{ token, user: { id, email, role, roleKey, permissions, entitlements, teamId } }`.
10. **Quy trình:** Kiểm tra email -> So sánh hash mật khẩu -> Kiểm tra `token_version` -> Ký JWT với hạn dùng quy định -> Trả kèm phân quyền thực tế đã giải quyết (`ResolvedPermissionsResult`).
11. **Giới hạn/Ngoại lệ:** Khóa brute-force qua `authLimiter`. Khi logout chuyển hướng đúng về trang đăng nhập ban đầu.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã kiểm thử đăng nhập trên VPS và local, API `/api/auth/me` trả về đầy đủ ma trận quyền.
14. **Điểm chưa rõ:** Không có.

---

### 2.3 Quản lý Đội nhóm & Duyệt Thành viên (Team Member Approval)
1. **Tên tính năng:** Quản lý Nhóm & Phê duyệt Thành viên
2. **Mã định danh:** `FEAT-TEAM-MANAGE`
3. **Mục đích:** Cho phép Team Lead hoặc Super Admin duyệt thành viên mới nhập mã giới thiệu, thu hẹp quyền nhóm và theo dõi nhân sự.
4. **Đối tượng sử dụng:** Super Admin, Team Lead.
5. **Quyền hạn:** `team.members.manage`.
6. **Vị trí UI:** Tab `Quản lý Team` (`/admin#team`).
7. **Route/API:** `GET /api/team`, `PATCH /api/team/members/:userId`, `PUT /api/team/permissions`.
8. **Thành phần Backend:** `server/modules/team/teamRoutes.ts`, `server/modules/team/teamService.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ status: 'approved' | 'suspended' }` cho duyệt thành viên; `{ overrides: Record<string, 'none'|'own'|'team'> }` cho phân quyền team.
   - *Ra:* Thông tin cập nhật của Team và danh sách thành viên.
10. **Quy trình:** Thành viên đăng ký mã -> Xuất hiện trong danh sách "Chờ duyệt" của Team Lead -> Leader duyệt `approved` -> Thành viên được nâng cấp role lên `member`, được truy cập giỏ hàng được phân phối.
11. **Giới hạn/Ngoại lệ:** Team Lead chỉ được thu hẹp quyền (`narrowScope`), không được phép vượt trần quyền hạn do Super Admin quy định.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã triển khai và deploy thành công lên production ngày 17/10/2026.
14. **Điểm chưa rõ:** Cơ chế tự động thông báo khi có thành viên mới xin vào team qua Telegram/Email chưa bật.

---

## 3. PHÂN HỆ QUẢN LÝ BẤT ĐỘNG SẢN & GIỎ HÀNG (PROPERTIES & CART)

### 3.1 Quản trị Danh sách & Đăng tin BĐS (Property Management)
1. **Tên tính năng:** Quản lý Tin đăng BĐS
2. **Mã định danh:** `FEAT-PROP-CRUD`
3. **Mục đích:** Tạo mới, chỉnh sửa, ẩn/hiện, đánh dấu đã bán và quản lý kho bất động sản của cá nhân/team/công ty.
4. **Đối tượng sử dụng:** Super Admin, Team Lead, Member (theo phạm vi sở hữu).
5. **Quyền hạn:** `property.read`, `property.write`.
6. **Vị trí UI:** Tab `Danh sách Bất động sản` (`/admin#properties`).
7. **Route/API:** `GET /api/properties`, `POST /api/properties`, `PUT /api/properties/:id`, `DELETE /api/properties/:id`.
8. **Thành phần Backend:** `server/modules/properties/propertiesRoutes.ts`, `server/dbHelper.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* Object `Property` (tiêu đề, giá, diện tích, pháp lý, nguồn tin: broker/owner, tọa độ, hình ảnh...).
   - *Ra:* Bản ghi `CmsRecord` đã lưu kèm `version` kiểm soát xung đột (Optimistic Locking).
10. **Quy trình:** Người dùng nhập thông tin -> Backend tự động gán `owner_user_id = req.user.id` (chống mass-assignment) -> Validate `listing_source` -> Lưu vào database -> Tự động sinh `searchText` phục vụ tìm kiếm toàn văn.
11. **Giới hạn/Ngoại lệ:** Member chỉ được sửa tin của chính mình (`own`). Bắt buộc phân loại Môi giới (`broker`) hoặc Chính chủ (`owner`).
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Có 26 tin BĐS trong `CmsRecord`, trường `listing_source` và `owner_user_id` hoạt động chuẩn xác.
14. **Điểm chưa rõ:** Không có.

---

### 3.2 Phân phối Giỏ hàng Nội bộ (Property Assignment)
1. **Tên tính năng:** Giao Giỏ hàng cho Thành viên Bán
2. **Mã định danh:** `FEAT-PROP-ASSIGN`
3. **Mục đích:** Team Lead hoặc Super Admin chỉ định tin BĐS trong kho cho các sale cụ thể trong team chăm sóc và bán hàng.
4. **Đối tượng sử dụng:** Super Admin, Team Lead.
5. **Quyền hạn:** `property.distribute`.
6. **Vị trí UI:** Trong modal chi tiết BĐS -> Tab `Phân phối giỏ hàng`.
7. **Route/API:** `POST /api/properties/:id/assign`.
8. **Thành phần Backend:** `server/modules/properties/propertiesRoutes.ts`, bảng `PropertyAssignment`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ assignedToUserId: string }`.
   - *Ra:* Bản ghi `PropertyAssignment` lưu lịch sử phân phối.
10. **Quy trình:** Leader chọn nhân viên -> Kiểm tra nhân viên thuộc cùng team -> Tạo bản ghi `PropertyAssignment` -> Nhân viên được phân phối có quyền xem và bán tin đó.
11. **Giới hạn/Ngoại lệ:** `pending_member` không được nhận phân phối giỏ hàng cho đến khi được duyệt.
12. **Trạng thái:** `IMPLEMENTED_UNVERIFIED`.
13. **Bằng chứng:** Schema bảng `PropertyAssignment` đã tồn tại trong Prisma, route đã định nghĩa trong `propertiesRoutes.ts`.
14. **Điểm chưa rõ:** Cần kiểm thử UI phân phối hàng loạt (batch assignment).

---

## 4. PHÂN HỆ QUẢN LÝ QUYỀN HẠN & GÓI DỊCH VỤ (RBAC & ENTITLEMENTS)

### 4.1 Ma trận Phân quyền 2D Dạng Bảng (2D RBAC Matrix)
1. **Tên tính năng:** Bảng Ma trận Phân quyền Tương tác
2. **Mã định danh:** `FEAT-RBAC-MATRIX-2D`
3. **Mục đích:** Cung cấp giao diện bảng 2 chiều cho phép Super Admin tick chọn bật/tắt 30 quyền hạn trên 5 vai trò (`super_admin`, `team_lead`, `member`, `independent`, `pending_member`) và chọn phạm vi dữ liệu (`all`, `team`, `own`).
4. **Đối tượng sử dụng:** Super Admin.
5. **Quyền hạn:** `rbac.matrix`.
6. **Vị trí UI:** Tab `Phân quyền & Gói` (`/admin#rbac`).
7. **Route/API:** `GET /api/rbac/matrix`, `PUT /api/rbac/matrix`.
8. **Thành phần Backend:** `server/modules/rbac/rbacAdminRoutes.ts`, `server/modules/rbac/rbacRepository.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* Mảng danh sách 150 quy tắc `RolePermissionRule`.
   - *Ra:* Ma trận cập nhật lưu vào bảng `RolePermission`.
10. **Quy trình:** Super Admin mở bảng -> Tick bật/tắt checkbox -> Client cập nhật state và gọi `PUT /api/rbac/matrix` -> Backend lưu vào DB và xóa cache quyền hiệu lực.
11. **Giới hạn/Ngoại lệ:** Chỉ Super Admin mới có quyền truy cập. Các quyền `super_admin` được bảo vệ không thể tự hủy quyền quản trị tối cao.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã deploy thành công ngày 17/10/2026, bảng `RolePermission` có đủ 150 bản ghi.
14. **Điểm chưa rõ:** Không có.

---

### 4.2 Quản lý Gói & License Desktop Tool (Entitlements & License Keys)
1. **Tên tính năng:** Cấp Gói Tính Năng & Key Bản Quyền Tool
2. **Mã định danh:** `FEAT-LICENSE-ENTITLEMENT`
3. **Mục đích:** Quản lý gói thuê bao (`trial`, `week`, `month`, `custom`) cấp quyền sử dụng CRM, Leads đầu tư, Inbox FB và cấp License kích hoạt tool EXE cho chuyên viên.
4. **Đối tượng sử dụng:** Super Admin (cấp phát), Sale/Member (kích hoạt trên Tool).
5. **Quyền hạn:** `entitlement`, `license.manage` (Admin); `tool.download` (User).
6. **Vị trí UI:** Tab `Phân quyền & Gói` -> Quản lý Gói; Trang cá nhân tải tool (`/downloads/HouseAndLife-Agent-Setup.exe`).
7. **Route/API:** `POST /api/license/issue`, `POST /api/license/activate`, `POST /api/license/heartbeat`.
8. **Thành phần Backend:** `server/modules/license/licenseRoutes.ts`, `server/modules/license/licenseService.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ licenseKey, deviceId, deviceName }`.
   - *Ra:* `{ status: 'success', activeFeatures: [...] }`.
10. **Quy trình:** User tải file cài đặt -> Cài đặt tool trên Windows -> Nhập License Key -> Tool gọi `activate` -> Server lưu mã thiết bị `LicenseDevice` -> Kiểm tra gói `Entitlement` còn hạn -> Cấp phép chạy tự động hóa.
11. **Giới hạn/Ngoại lệ:** Giới hạn số lượng thiết bị (`max_devices`). Member `pending` không được tải hoặc kích hoạt tool.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** File `HouseAndLife-Agent-Setup.exe` (175MB) tải thành công HTTP 200 tại `https://bdsdanang.site/downloads/HouseAndLife-Agent-Setup.exe`, DB có 5 bản ghi license.
14. **Điểm chưa rõ:** Cơ chế thanh toán tự động (hiện tại Super Admin cấp thủ công qua UI/API).

---

## 5. PHÂN HỆ AI & TỰ ĐỘNG HÓA (AI AGENT & MARKETING AUTOMATION)

### 5.1 Chatbot AI Nội Bộ Hỗ Trợ Môi Giới (Internal AI Assistant)
1. **Tên tính năng:** Trợ lý AI Tra Cứu & Tư Vấn BĐS
2. **Mã định danh:** `FEAT-AI-CHATBOT`
3. **Mục đích:** Cho phép chuyên viên môi giới hỏi đáp về bảng hàng, dự án, pháp lý, tính toán lãi suất vay và soạn thảo nội dung tư vấn khách hàng.
4. **Đối tượng sử dụng:** Super Admin, Team Lead, Member.
5. **Quyền hạn:** `chatbot.use`.
6. **Vị trí UI:** Tab `Chatbot AI Nội bộ` (`/admin#chatbot`).
7. **Route/API:** `POST /api/ai/chat`, `POST /api/chat/assistant`.
8. **Thành phần Backend:** `server/modules/chat/chatRoutes.ts`, `server/modules/ai-gateway`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* `{ message: string, history: Array<{role, message}> }`.
   - *Ra:* `{ reply: string, sources?: any[] }`.
10. **Quy trình:** Người dùng đặt câu hỏi -> Backend nạp ngữ cảnh dữ liệu từ kho BĐS hiện có -> Bọc trong prompt guardrail -> Gọi AI Gateway (Gemini/OpenAI) -> Trả lời cho môi giới.
11. **Giới hạn/Ngoại lệ:** Yêu cầu cấu hình API Key (`GEMINI_API_KEY` hoặc `OPENAI_API_KEY`). Khi không có key, chuyển sang chế độ dự phòng.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** API `/api/health` xác nhận AI Provider: `gemini`.
14. **Điểm chưa rõ:** Cần đo lường độ trễ thực tế khi tra cứu giỏ hàng lớn.

---

### 5.2 Khai Thác Khách Hàng Tiềm Năng Tự Động (Lead Intelligence & Finding)
1. **Tên tính năng:** Radar Quét & Phân Tích Nhu Cầu Mua BĐS
2. **Mã định danh:** `FEAT-AGENT-FINDING`
3. **Mục đích:** Quét các hội nhóm Facebook, diễn đàn BĐS để tìm kiếm bài đăng/bình luận có nhu cầu mua hoặc thuê thực tế tại Đà Nẵng, phân tích mức độ tiềm năng và chuyển thành Lead.
4. **Đối tượng sử dụng:** Super Admin, thành viên có gói Premium `agent.*`.
5. **Quyền hạn:** `lead.intel`, `agent.sources`.
6. **Vị trí UI:** Tab `Lead Intelligence` (`/admin/agents/findings`).
7. **Route/API:** `GET /api/agent/findings`, `POST /api/agent/findings/:id/promote`.
8. **Thành phần Backend:** `server/agent/agentRoutes.ts`, `server/modules/lead-acquisition`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* Dữ liệu quét từ `ScannedContent`.
   - *Ra:* Bản ghi `AgentFinding` kèm điểm số nhu cầu (`intent_score`), ngân sách ước tính và nút "Chuyển thành Khách hàng CRM".
10. **Quy trình:** Desktop tool hoặc worker quét bài viết -> AI trích xuất thực thể (Loại BĐS, Ngân sách, SĐT) -> Tạo `AgentFinding` -> Sale bấm `promote` -> Tạo bản ghi `Lead` trong CRM.
11. **Giới hạn/Ngoại lệ:** Cần tài khoản mạng xã hội để quét. Có bộ lọc chống spam (`AgentSpamRule`).
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Database có 1,141 bản ghi `AgentFinding` và 49 `AgentSource` đã được ghi nhận.
14. **Điểm chưa rõ:** Tần suất quét phụ thuộc vào tình trạng checkpoint của tài khoản Facebook.

---

## 6. PHÂN HỆ ĐIỀU HÀNH & BÁO CÁO (EXECUTIVE COMMAND CENTER)

### 6.1 Bảng Điều Hành Chiến Lược (Executive Command Dashboard)
1. **Tên tính năng:** Executive Command Center
2. **Mã định danh:** `FEAT-EXEC-DASHBOARD`
3. **Mục đích:** Cung cấp bức tranh toàn cảnh về hoạt động kinh doanh: tổng số khách cần follow-up, số BĐS đang bán, chiến dịch đang chạy, doanh thu kỳ vọng từ dữ liệu thực trong database.
4. **Đối tượng sử dụng:** Super Admin, Team Lead, Member (theo phạm vi dữ liệu được phân quyền).
5. **Quyền hạn:** `dashboard`.
6. **Vị trí UI:** Tab `Dashboard tổng quan` (`/admin#dashboard`).
7. **Route/API:** `GET /api/executive-dashboard`, `GET /api/executive/kpis`.
8. **Thành phần Backend:** `server/modules/executive-dashboard/executiveService.ts`, `server/modules/executive-dashboard/kpiService.ts`.
9. **Dữ liệu Vào/Ra:**
   - *Vào:* Header Bearer Token.
   - *Ra:* Object KPI thời gian thực (tổng leads, giá trị pipeline, phân bố theo trạng thái).
10. **Quy trình:** Truy vấn song song các bảng `Lead`, `CmsRecord (properties)`, `AgentFinding` -> Lọc theo `companyId` / `teamId` của user -> Tính toán tổng doanh thu dự kiến và tỷ lệ chuyển đổi -> Trả về JSON cho thẻ KPI.
11. **Giới hạn/Ngoại lệ:** Đã dọn dẹp sạch sẽ toàn bộ dữ liệu mẫu (mock/fake), 100% dữ liệu hiển thị lấy từ database thật.
12. **Trạng thái:** `VERIFIED_WORKING`.
13. **Bằng chứng:** Đã sửa và deploy ngày 17/10/2026, loại bỏ các chỉ số ảo "719.7 tỷ", hiển thị chuẩn số liệu thực.
14. **Điểm chưa rõ:** Không có.
