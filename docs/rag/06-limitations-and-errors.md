# GIỚI HẠN KỸ THUẬT & MÃ LỖI THƯỜNG GẶP (LIMITATIONS & ERROR HANDLING)
**Mã tài liệu:** `RAG-LIMIT-06`  
**Ngày cập nhật:** 17/10/2026  
**Trạng thái xác minh:** `VERIFIED_WORKING`

---

## 1. CÁC MÃ LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (ERROR CODES)

| Mã lỗi HTTP | Thông điệp phản hồi | Nguyên nhân kỹ thuật | Hướng dẫn xử lý cho người dùng |
| :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | `"Mã giới thiệu không tồn tại."` | Người dùng nhập mã referral sai chính tả hoặc mã chưa được hệ thống cấp. | Kiểm tra lại từng ký tự mã giới thiệu từ Trưởng nhóm (hoặc dùng mã hệ thống `REF-UOWNER`). |
| **`400 Bad Request`** | `"Vui lòng chọn nguồn tin: broker hoặc owner."` | Bỏ trống trường phân loại Môi giới / Chính chủ khi đăng tin BĐS mới. | Tick chọn vào 1 trong 2 ô **Môi giới** hoặc **Chính chủ** trước khi bấm Lưu. |
| **`401 Unauthorized`** | `"Phiên đăng nhập đã hết hạn."` | JWT token hết hạn, bị thu hồi do đổi mật khẩu, hoặc chưa đăng nhập. | Đăng xuất và đăng nhập lại bằng email/mật khẩu hiện tại. |
| **`403 Forbidden`** | `"Bạn không có quyền thực hiện thao tác này."` | Quyền hạn tương ứng trong ma trận phân quyền đang là `none` hoặc ngoài phạm vi (`scope`). | Liên hệ Super Admin hoặc Trưởng nhóm để được mở quyền hoặc nâng cấp vai trò. |
| **`403 Forbidden`** | `"requiresPremiumUpgrade: true"` | Tính năng này thuộc gói dịch vụ nâng cao (CRM, Leads đầu tư, Radar AI) mà tài khoản chưa có gói. | Liên hệ Quản trị viên để được cấp gói thuê bao tính năng tương ứng. |
| **`409 Conflict`** | `"Dữ liệu đã bị thay đổi bởi người khác."` | Xung đột phiên bản (Optimistic Locking): Hai người cùng chỉnh sửa một tin tại một thời điểm. | Tải lại trang (F5) để lấy bản cập nhật mới nhất trước khi chỉnh sửa tiếp. |
| **`429 Too Many Requests`** | `"Quá nhiều yêu cầu, vui lòng thử lại sau."` | Rate Limiter kích hoạt do gửi liên tục quá nhiều request trong thời gian ngắn. | Đợi 1 - 5 phút trước khi thực hiện thao tác tiếp theo. |
| **`503 Service Unavailable`**| `"AI Agent API đang tắt."` | Biến môi trường `AGENT_ENABLED=false` trên máy chủ. | Báo kỹ thuật viên kiểm tra file `.env` và khởi động lại dịch vụ backend. |

---

## 2. GIỚI HẠN THỰC TẾ CỦA HỆ THỐNG

1. **Giao dịch tài chính:** Nền tảng không phải là cổng thanh toán giao dịch BĐS trực tuyến. Không hỗ trợ thanh toán tiền mua nhà, tiền cọc qua cổng ngân hàng trên website.
2. **Xác thực tự động tài khoản mạng xã hội:** Việc quét bài viết mạng xã hội (Facebook/Zalo) phụ thuộc vào công cụ Desktop Tool hoặc proxy; nếu tài khoản Facebook bị checkpoint thì luồng quét tự động sẽ tạm ngừng cho đến khi đăng nhập lại.
3. **Dung lượng file tải lên:** Tối đa 10MB cho mỗi tệp hình ảnh. Định dạng được chấp thuận: PNG, JPEG, WEBP (chặn hoàn toàn SVG để phòng ngừa mã độc XSS).
