# QUY TẮC NGHIỆP VỤ CỐT LÕI (CORE BUSINESS RULES)
**Mã tài liệu:** `RAG-RULE-04`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`  
**Nguồn bằng chứng:** Mã nguồn backend `server/security/`, `server/modules/`, `prisma/schema.prisma`

---

## 1. QUY TẮC ĐĂNG TIN & QUẢN TRỊ BẤT ĐỘNG SẢN

### 1.1 Quy Định Về Quyền Sở Hữu Tin (Owner Immutability)
- Khi một chuyên viên tạo tin đăng mới, trường `owner_user_id` sẽ được backend tự động gán cứng bằng ID của người tạo (`req.user.id`).
- Hệ thống **tuyệt đối không cho phép** client tự ý gửi `owner_user_id` trong payload nhằm triệt tiêu nguy cơ chiếm đoạt tin đăng của người khác.
- Quyền sở hữu tin là **bất biến**, chỉ có duy nhất Quản trị viên tối cao (Super Admin) mới có thẩm quyền chuyển giao quyền sở hữu tin trong trường hợp nhân sự nghỉ việc.
- Quyền sở hữu tin này là cơ sở duy nhất để tính toán và chia hoa hồng khi phát sinh giao dịch thành công.

### 1.2 Bắt Buộc Phân Loại Nguồn Tin (Broker vs Owner)
- Mọi tin đăng tạo mới trên hệ thống bắt buộc phải được đánh dấu:
  - **`owner` (Chính chủ):** Nhà đất do chính chủ gửi trực tiếp cho chuyên viên hoặc sàn.
  - **`broker` (Môi giới):** Nhà đất liên kết qua đầu chủ hoặc sàn liên kết khác.
- Không được phép để trống trường thông tin này.

### 1.3 Quy Chuẩn Đơn Vị Đo Lường
- **Đơn vị Giá bán/Thuê:** Luôn luôn quy đổi và lưu trữ dưới dạng **Tỷ đồng VNĐ**.
  - Ví dụ: 850 triệu đồng nhập là `0.85`. 3 tỷ 200 triệu đồng nhập là `3.2`. 15 tỷ nhập là `15`.
- **Đơn vị Diện tích:** Luôn tính bằng **Mét vuông ($m^2$)**.
- **Độ rộng đường:** Luôn tính bằng **Mét (m)** (Ví dụ: đường 5.5m, đường 7.5m, đường 10.5m).

### 1.4 Quy Tắc Hiển Thị Công Khai (Public Visibility)
- Tin BĐS chỉ được xuất hiện trên Cổng thông tin công khai (`https://bdsdanang.site`) khi thỏa mãn đồng thời:
  1. Trạng thái kinh doanh `sale_status` là `available` (Đang mở bán).
  2. Bất động sản có đầy đủ tiêu đề, vị trí và ít nhất một mức giá hợp lệ.
- Nếu BĐS được chuyển sang `sold` (Đã bán) hoặc `hidden` (Tạm ẩn): Tin sẽ lập tức bị gỡ khỏi sitemap công khai và trả về mã chuyển hướng phù hợp.

---

## 2. QUY TẮC ĐỘI NHÓM & MÃ GIỚI THIỆU (REFERRAL & TEAMS)

### 2.1 Tính Duy Nhất Của Đội Nhóm
- Mỗi người dùng chỉ được phép thuộc về **tối đa một Đội nhóm (Team)** tại một thời điểm (`TeamMember.userId` là trường `unique`).
- Không được phép tham gia nhiều nhóm khác nhau để tránh xung đột lợi ích nội bộ.

### 2.2 Quy Chế Thành Viên Chờ Duyệt (Pending Member Policy)
- Khi đăng ký tài khoản có nhập mã giới thiệu:
  - Tài khoản không được mở quyền xem toàn bộ giỏ hàng của nhóm ngay lập tức.
  - Phải trải qua bước phê duyệt chính thức (`approved`) của Trưởng nhóm hoặc Super Admin.
  - Trong thời gian chờ duyệt, thành viên chỉ có quyền đăng tin của chính mình và xem hồ sơ cá nhân.

### 2.3 Cơ Chế Mã Giới Thiệu
- Mỗi tài khoản khi tạo ra đều được cấp một mã giới thiệu ngẫu nhiên duy nhất gồm 10 ký tự (Ví dụ: `REF-K8J2M9`).
- Riêng tài khoản Quản trị tối cao có mã cố định hệ sinh thái: `REF-UOWNER`.
- Người dùng nhập mã của ai thì tự động trở thành thành viên cấp dưới trong Team của người đó. Người sở hữu mã tự động được phong hàm Trưởng nhóm (Team Lead) khi có thành viên đầu tiên kích hoạt.

---

## 3. QUY TẮC AN TOÀN TRÍ TUỆ NHÂN TẠO (AI SAFETY GUARDRAILS)

### 3.1 Chống Sai Lệch Thông Tin BĐS (Fact Checking Guardrail)
- Khi AI tự động sinh bài viết tiếp thị cho bất động sản, hệ thống sẽ thực hiện kiểm tra chéo (Cross-verification) giữa văn bản AI sinh ra và dữ liệu gốc trong DB:
  - **Pháp lý:** Nếu DB ghi "Đang chờ sổ" hoặc "HĐMB", cấm tuyệt đối AI tự ý viết "Đã có sổ đỏ/sổ hồng riêng".
  - **Giá bán & Diện tích:** Số liệu trong bài viết bắt buộc phải trùng khớp 100% với giá và diện tích trong DB.
  - Nếu phát hiện sai lệch, hệ thống lập tức gắn cờ `requires_manual_review: true` và cấm đăng tự động lên mạng xã hội.

### 3.2 Che Chắn Dữ Liệu Cá Nhân (PII Masking)
- Số điện thoại cá nhân và email của khách hàng được tự động che chắn trước khi đưa vào các prompt gửi lên mô hình ngôn ngữ lớn (LLM), bảo vệ quyền riêng tư theo tiêu chuẩn bảo mật dữ liệu.

### 3.3 Cơ Chế Con Người Phê Duyệt (Human-in-the-Loop)
- Mọi hành động đăng bài tự động lên Fanpage, Zalo OA hay gửi tin nhắn hàng loạt bắt buộc phải được tạo dưới dạng bản đề xuất (`AgentActionProposal`) ở trạng thái `proposed`.
- Chỉ khi chuyên viên hoặc quản trị viên bấm duyệt (`approved`), hành động mới được thực thi ngoài thực tế.
