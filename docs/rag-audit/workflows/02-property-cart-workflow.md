# TRUY VẾT NGHIỆP VỤ: QUẢN LÝ TIN ĐĂNG BĐS & PHÂN PHỐI GIỎ HÀNG
**Mã tài liệu:** `WF-TRACE-02`  
**Ngày thực hiện:** 17/10/2026  
**Module:** Property Management, Cart & Inventory Distribution

---

## 1. Sơ Đồ Luồng Quản Lý Tin Đăng (Property Lifecycle)

```
[Chuyên viên / Admin bấm "Thêm Bất động sản mới"]
       │
       ▼
[Điền thông tin: Tiêu đề, Giá, Diện tích, Địa chỉ, Pháp lý, Nguồn tin (Môi giới/Chính chủ)]
       │
       ▼
POST /api/properties
       │
       ├──► 1. Xác thực Bearer Token
       ├──► 2. Kiểm tra quyền `property.write` (Phạm vi `own`, `team`, hoặc `all`)
       │
       ├──► 3. Validate dữ liệu đầu vào:
       │      ├── Tiêu đề: bắt buộc
       │      ├── Giá (`price`): số dương (tính theo tỷ VNĐ)
       │      ├── Diện tích (`area`): số dương (m²)
       │      └── `listing_source`: bắt buộc 'broker' (Môi giới) hoặc 'owner' (Chính chủ)
       │
       ├──► 4. Rào chắn bảo mật quyền sở hữu (Anti Mass-Assignment):
       │      ├── Ép gán: `owner_user_id = req.user.id`
       │      ├── Gán: `created_by_user_id = req.user.id`
       │      └── Gán: `team_id = req.user.teamId` (nếu user thuộc team)
       │
       ├──► 5. Tự động sinh `searchText` không dấu + có dấu để tìm kiếm
       ├──► 6. Lưu vào bảng `cms_records` với `collection = 'properties'`
       ▼
[Trả về HTTP 201 Created: { status: 'success', data: Property }]
       │
       ▼
[Hiển thị tin trên danh sách nội bộ và tự động đồng bộ ra Public Catalog nếu sale_status = 'available']
```

---

## 2. Luồng Phân Phối Giỏ Hàng Nội Bộ (Cart Distribution)

```
[Team Lead hoặc Super Admin mở tin BĐS trong kho]
       │
       ▼
[Chọn hành động: "Phân phối cho thành viên bán"]
       │
       ▼
POST /api/properties/:id/assign
       │ Body: { assignedToUserId: "user_xxx" }
       │
       ├──► 1. Kiểm tra quyền `property.distribute`
       ├──► 2. Kiểm tra người được giao (`assignedToUserId`) có cùng team với Leader không
       ├──► 3. Kiểm tra người được giao có trạng thái `approved` không (pending không được nhận)
       │
       ├──► 4. Lưu bản ghi vào bảng `property_assignments`:
       │      ├── `property_id`: ID bất động sản
       │      ├── `assigned_by`: ID người giao (Team Lead / Super Admin)
       │      ├── `assigned_to`: ID người nhận (Sale Member)
       │      └── `assigned_at`: Thời gian giao
       │
       ├──► 5. Cập nhật mảng `assigned_member_ids` trong data của BĐS
       ▼
[Trả về HTTP 200 OK: "Phân phối thành công"]
       │
       ▼
[Sale Member đăng nhập -> Thấy tin BĐS xuất hiện trong giỏ hàng được phép bán của mình]
```

---

## 3. Quy Tắc Phạm Vi Quyền Dữ Liệu (Scope Matrix)

| Vai trò người dùng | Quyền đọc (`property.read`) | Quyền sửa/xóa (`property.write`) | Quyền phân phối (`property.distribute`) |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Toàn bộ hệ thống (`all`) | Toàn bộ hệ thống (`all`) | Toàn bộ hệ thống (`all`) |
| **Team Lead** | Toàn bộ tin trong Team (`team`) | Tin trong Team (`team`) | Tin trong Team (`team`) |
| **Member (Đã duyệt)** | Tin tự đăng + Tin được phân phối + Tin public của Team | Chỉ tin của chính mình (`own`) | Không có quyền (`none`) |
| **Member (Pending)** | Chỉ tin của chính mình (`own`) | Chỉ tin của chính mình (`own`) | Không có quyền (`none`) |
| **Independent (Độc lập)** | Chỉ tin của chính mình (`own`) | Chỉ tin của chính mình (`own`) | Không có quyền (`none`) |

---

## 4. Xử Lý Xung Đột Dữ Liệu (Optimistic Locking)

- Mỗi bản ghi `CmsRecord` có cột `version: Int`.
- Khi client gửi yêu cầu cập nhật (`PUT /api/properties/:id`), bắt buộc gửi kèm trường `version` hiện tại.
- Nếu `version` gửi lên khác với `version` trong DB (do người khác đã sửa trước đó):
  - Backend trả lỗi `409 Conflict`: "Dữ liệu đã bị thay đổi bởi người dùng khác. Vui lòng tải lại trang."
  - Ngăn chặn triệt để tình trạng ghi đè mất dữ liệu (Lost Updates).

---

## 5. Đánh Giá Trạng Thái Kiểm Chứng

- **Mức độ xác minh:** `VERIFIED_WORKING`.
- **Bằng chứng:** Cơ chế Optimistic Lock `version` và trường `listing_source` đã được xác minh trên database và API live.
