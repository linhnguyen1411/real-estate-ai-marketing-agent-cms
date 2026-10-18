# CHÍNH SÁCH ĐỘ MỚI DỮ LIỆU & TRUY VẤN ĐỘNG CHO RAG (DATA & FRESHNESS POLICY)
**Mã tài liệu:** `RAG-DATA-07`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`

---

## 1. NGUYÊN TẮC CỐT LÕI VỀ ĐỘ MỚI DỮ LIỆU

Trong kiến trúc RAG của `bdsdanang.site`, dữ liệu được phân định thành 2 tầng với cơ chế cập nhật khác biệt:

### 1.1 Tầng Tri Thức Tĩnh / Ổn Định (Static Knowledge Base)
- **Bao gồm:** Quy định pháp lý, hướng dẫn sử dụng, phân quyền RBAC, quy tắc đăng tin, cấu trúc sản phẩm, cẩm nang đầu tư, tài liệu nghiên cứu quy hoạch.
- **Chu kỳ cập nhật:** Định kỳ hàng tháng hoặc mỗi khi có bản release tính năng mới.
- **Cơ chế lưu trữ:** Vector Database / Markdown Chunking phục vụ Semantic Search cho Chatbot AI.

### 1.2 Tầng Dữ Liệu Biến Động (Dynamic Real-Time Data)
- **Bao gồm:** Mức giá bán cụ thể của từng căn, tình trạng tin (còn hàng hay đã bán), thông tin liên hệ của chủ nhà, danh sách khách hàng mới hôm nay.
- **Chu kỳ thay đổi:** Từng giây, từng phút theo tương tác thực tế của người dùng.
- **Cơ chế phục vụ:** **KHÔNG LƯU DẠNG EMBEDDING TĨNH**. Thay vào đó, AI bắt buộc phải:
  1. Trả lời kèm điều khoản miễn trừ trách nhiệm thời gian thực (Disclaimers).
  2. Sử dụng API trực tiếp (Real-time Tool Calling) nếu có hỗ trợ.
  3. Hướng dẫn khách hàng truy cập trực tiếp link sản phẩm trên website `https://bdsdanang.site` hoặc kết nối với chuyên viên tư vấn.

---

## 2. QUY ĐỊNH PHÁT NGÔN CỦA CHATBOT AI VỀ GIÁ & TÌNH TRẠNG KHO HÀNG

Khi người dùng hỏi Chatbot các câu hỏi mang tính chất dữ liệu động, AI phải tuân thủ nghiêm ngặt các mẫu phản hồi sau:

- **Câu hỏi:** *"Căn nhà phố Nam Hòa Xuân mã số ABC giá bao nhiêu, đã bán chưa?"* hoặc *"Có bao nhiêu căn nhà bán dưới 3 tỷ ở Sơn Trà và số điện thoại chủ nhà là gì?"*
- **Hành vi ĐƯỢC PHÉP:**
  - Giải thích rõ: Số lượng tin đăng và giá bán bất động sản thay đổi liên tục theo thời gian thực dựa trên các giao dịch phát sinh.
  - Hướng dẫn người dùng truy cập trực tiếp bộ lọc tại danh mục công khai `https://bdsdanang.site/bat-dong-san` để cập nhật danh sách chính xác nhất tại thời điểm tra cứu.
  - Về số điện thoại chủ nhà: Nhắc nhở người dùng bấm "Gọi tư vấn" hoặc để lại thông tin liên hệ để chuyên viên môi giới hỗ trợ kết nối trực tiếp, nhằm bảo mật thông tin liên hệ của chủ nhà.
- **Hành vi BỊ CẤM:**
  - Tự ý bịa ra số lượng tin BĐS cụ thể hoặc cam kết giá bán khi không có dữ liệu truy vấn trực tiếp từ database tại thời điểm đó.
  - Tiết lộ trái phép thông tin liên hệ riêng tư của chủ nhà nếu chưa được kết nối hợp lệ.
  - Tự ý cam kết mức chiết khấu hoặc hứa hẹn khả năng sinh lời không có căn cứ trong tài liệu.
