# QUY TRÌNH CHUYỂN TIẾP HỖ TRỢ CON NGƯỜI (ESCALATION POLICY)
**Mã tài liệu:** `RAG-ESCAL-08`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`

---

## 1. NGUYÊN TẮC CHUYỂN TIẾP (HUMAN ESCALATION TRIGGERS)

Chatbot AI phải chủ động chuyển tiếp cuộc hội thoại cho chuyên viên tư vấn con người trong các trường hợp sau:

1. **Khách hàng bày tỏ ý định giao dịch thực tế:**
   - Yêu cầu đi xem nhà đất thực tế ngoài đời thực.
   - Yêu cầu xem bản photo sổ đỏ, sổ hồng hoặc hợp đồng mua bán pháp lý.
   - Thương lượng giảm giá, hỏi thủ tục đặt cọc và phương thức thanh toán.
2. **Các tình huống ngoài phạm vi tri thức của AI:**
   - Khiếu nại về chất lượng dịch vụ của môi giới hoặc sàn.
   - Tranh chấp ranh giới đất đai, thủ tục thừa kế phức tạp.
   - Người dùng hỏi lặp đi lặp lại một vấn đề mà AI không tìm thấy dữ liệu trong Knowledge Base (sau 2 lần trả lời không thỏa đáng).
3. **Phát hiện dấu hiệu rủi ro hoặc cảm xúc tiêu cực:**
   - Khách hàng bày tỏ bức xúc, nghi ngờ về độ minh bạch hoặc dùng từ ngữ gay gắt.

---

## 2. KÊNH TIẾP NHẬN CHUYỂN TIẾP HỆ THỐNG

- **Kênh 1: Form Đăng Ký Tư Vấn Trực Tuyến**
  - AI hiển thị form thu thập: Họ tên, Số điện thoại (Zalo), Khung giờ rảnh để chuyên viên gọi lại.
  - Dữ liệu tự động đẩy vào bảng `leads` với cờ ưu tiên `priority = 'high'`.
- **Kênh 2: Hotline / Zalo Chuyên Viên Phụ Trách**
  - Cung cấp số điện thoại của chuyên viên đang phụ trách tin đăng BĐS tương ứng.
- **Kênh 3: Nhóm Hỗ Trợ Kỹ Thuật (Dành cho Chuyên viên / Nội bộ)**
  - Nếu gặp lỗi hệ thống, quyền hạn hoặc tài khoản: Liên hệ trực tiếp Super Admin qua kênh Telegram Control Plane hoặc email quản trị.

---

## 3. CHÍNH SÁCH XỬ LÝ YÊU CẦU TẤN CÔNG BẢO MẬT & PHÁ HOẠI (SECURITY GUARDRAILS)

1. **Tuyệt đối từ chối:** Hệ thống và Trợ lý AI từ chối dứt khoát mọi yêu cầu liên quan đến hành vi xâm nhập, tấn công trái phép, khai thác lỗ hổng, hack tài khoản admin, đánh cắp danh sách khách hàng hoặc can thiệp dữ liệu trái phép.
2. **Cơ chế an ninh:** Hệ thống bdsdanang.site được trang bị cơ chế giám sát an ninh mạng nghiêm ngặt, bao gồm tường lửa bảo mật, Rate Limiter (HTTP 429), mã hóa dữ liệu, phân quyền RBAC và hệ thống Audit Log ghi nhận toàn bộ địa chỉ IP và phiên truy cập khả nghi để xử lý theo quy định pháp luật.
