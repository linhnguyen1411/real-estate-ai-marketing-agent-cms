# TỔNG QUAN SẢN PHẨM BDSDANANG.SITE
**Mã tài liệu:** `RAG-PROD-00`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`  
**Nguồn bằng chứng:** Mã nguồn `server/`, `src/`, `prisma/schema.prisma` và hệ thống production `https://bdsdanang.site`.

---

## 1. Giới Thiệu Chung

**bdsdanang.site** là nền tảng tiếp thị số và quản trị kinh doanh bất động sản chuyên sâu tại thị trường Đà Nẵng và miền Trung (House & Life). Hệ thống kết hợp giữa **Cổng thông tin bất động sản công khai (Public Portal)** và **Hệ thống điều hành trung tâm (Enterprise CMS & AI Agent Platform)** nhằm giải quyết trọn vẹn quy trình:

1. **Tiếp cận & Thu hút (Attract):** Cung cấp danh mục nhà đất chuẩn xác, bản đồ quy hoạch, cẩm nang đầu tư và tài liệu phân tích thị trường (Lead Magnet).
2. **Khai thác & Chăm sóc (Nurture):** Hệ thống Radar AI quét dữ liệu mạng xã hội tự động phát hiện người có nhu cầu mua/thuê BĐS, tích hợp CRM đa kênh và phân loại tiềm năng khách hàng.
3. **Phân phối Giỏ hàng & Quản trị Đội nhóm (Distribute & Team):** Quản lý kho hàng nội bộ, phân quyền theo mô hình Team Lead - Member, phân phối giỏ hàng độc quyền, phòng chống trùng lặp và bảo vệ quyền sở hữu của chuyên viên môi giới.
4. **Hỗ trợ Chuyên sâu với Trợ lý AI (Assist):** Chatbot AI nội bộ hỗ trợ tra cứu bảng hàng, phân tích pháp lý, so sánh quy hoạch và soạn thảo tin đăng tiếp thị tự động.

---

## 2. Đối Tượng Phục Vụ Của Nền Tảng

1. **Khách hàng Mua / Thuê & Nhà Đầu tư (Public Users & Investors):**
   - Tìm kiếm bất động sản theo vị trí, ngân sách, hướng và loại hình tại Đà Nẵng.
   - Nhận tài liệu quy hoạch, báo cáo nghiên cứu thị trường miễn phí.
   - Đặt lịch hẹn đi xem nhà đất thực tế hoặc kết nối trực tiếp với chuyên viên tư vấn.
2. **Chuyên viên Môi giới Bất động sản (Sale Members / Independent Agents):**
   - Đăng và quản lý kho bất động sản cá nhân (Môi giới hoặc Chính chủ).
   - Nhận giỏ hàng phân phối từ Trưởng nhóm để chào bán cho khách.
   - Quản lý tệp khách hàng tiềm năng, lịch sử cuộc gọi và nhắc lịch follow-up.
   - Sử dụng Trợ lý AI và công cụ Desktop Tool tự động hóa.
3. **Trưởng nhóm Kinh doanh (Team Leads):**
   - Tuyển dụng chuyên viên qua mã giới thiệu riêng của Team.
   - Phê duyệt thành viên gia nhập đội ngũ.
   - Phân phối tin BĐS trong kho cho các thành viên trong nhóm.
   - Theo dõi tiến độ chăm sóc khách hàng và hiệu quả của từng nhân viên.
4. **Quản trị viên Cấp cao (Super Admin):**
   - Điều hành toàn bộ nền tảng qua Executive Command Center.
   - Điều chỉnh ma trận phân quyền 2D dạng bảng tương tác.
   - Cấp phát các gói dịch vụ (Entitlements) và mã kích hoạt bản quyền (License Keys).
   - Giám sát luồng vận hành của AI Agent và hạ tầng hệ thống.

---

## 3. Các Phân Hệ Chức Năng Cốt Lõi

| Phân hệ | Thành phần chính | Lợi ích nghiệp vụ |
| :--- | :--- | :--- |
| **Cổng Thông Tin Công Khai** | Danh mục BĐS, Chi tiết tin, Landing Pages dự án, Tài liệu đầu tư, Blog tin tức. | Tối ưu hóa SEO Google, thu hút khách hàng tự nhiên (Organic Leads). |
| **Quản Trị Bất Động Sản** | Kho BĐS cá nhân & công ty, Bộ lọc nâng cao, Phân phối giỏ hàng, Kiểm soát nguồn tin. | Quản lý bảng hàng tập trung, minh bạch nguồn gốc môi giới/chính chủ. |
| **Khách Hàng & CRM** | Quản lý Lead, Chấm điểm tiềm năng (0-100), Ghi chú lịch hẹn, Lịch sử cuộc gọi. | Tránh thất thoát khách hàng, gia tăng tỷ lệ chuyển đổi giao dịch. |
| **AI Marketing & Tự Động Hóa** | Lead Intelligence Radar, AI Content Generator, Shortlinks định danh, Desktop Tool. | Tự động quét nhu cầu mua nhà, giảm 80% thời gian viết bài quảng cáo. |
| **Phân Quyền & Đội Nhóm** | Ma trận quyền 2D, Duyệt thành viên theo mã giới thiệu, Quản lý gói tính năng. | Bảo mật đa cấp, mở rộng mạng lưới kinh doanh an toàn và linh hoạt. |

---

## 4. Những Giới Hạn & Nguyên Tắc Vận Hành Thực Tế

- Hệ thống **không** can thiệp trực tiếp vào giao dịch chuyển tiền hay đặt cọc online; các giao dịch pháp lý đều thực hiện ngoài đời thực giữa các bên.
- Thông tin giá và tình trạng còn/hết của bất động sản là **dữ liệu biến động theo thời gian**; khách hàng luôn được khuyến nghị liên hệ chuyên viên để nhận bảng hàng mới nhất tại thời điểm quan tâm.
- Việc sử dụng các module nâng cao (CRM toàn diện, Radar quét Facebook, Desktop Tool) yêu cầu tài khoản được cấp gói tính năng tương ứng từ Super Admin.
