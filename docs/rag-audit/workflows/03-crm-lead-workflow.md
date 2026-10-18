# TRUY VẾT NGHIỆP VỤ: KHÁCH HÀNG CRM & LEADS ĐẦU TƯ
**Mã tài liệu:** `WF-TRACE-03`  
**Ngày thực hiện:** 17/10/2026  
**Module:** CRM, Investor Leads & Lead Acquisition

---

## 1. Nguồn Dẫn Khách Hàng Vào Hệ Thống (Lead Ingestion Channels)

Hệ thống ghi nhận khách hàng từ 3 kênh chính:
1. **Kênh 1 - Website Public:** Khách điền form nhận tài liệu đầu tư hoặc đăng ký tư vấn tại các Landing Page.
2. **Kênh 2 - Lead Intelligence Radar:** AI Agent quét bài viết và bình luận trên mạng xã hội, phát hiện người có nhu cầu mua/thuê BĐS Đà Nẵng.
3. **Kênh 3 - Nhập thủ công (Direct CRM Entry):** Chuyên viên môi giới tạo khách hàng trực tiếp trên giao diện CRM.

---

## 2. Sơ Đồ Chuyển Đổi Lead Từ Radar AI Sang CRM (Lead Promotion)

```
[Mạng xã hội: Bài đăng/Bình luận tìm mua nhà đất]
       │
       ▼
[Desktop Tool / Agent Scheduler quét dữ liệu]
       │
       ▼
[Lưu bản ghi `ScannedContent`]
       │
       ▼
[AI Gateway phân tích trích xuất: Loại BĐS, Ngân sách, Địa bàn, Ý định]
       │
       ▼
[Tạo bản ghi `AgentFinding` kèm `intent_score` (0-100)]
       │
       ▼
[Chuyên viên xem tại Tab "Lead Intelligence" -> Bấm "Chuyển thành Khách CRM"]
       │
       ▼
POST /api/agent/findings/:id/promote
       │ Body: { assignedToUserId?: string }
       │
       ├──► 1. Xác thực quyền `lead.intel` và entitlement `agent.*`
       ├──► 2. Kiểm tra `finding` chưa được promote trước đó (tránh trùng lặp)
       │
       ├──► 3. Trích xuất thông tin liên hệ và nhu cầu
       ├──► 4. Tạo bản ghi mới trong bảng `leads`:
       │      ├── `name`: Tên chủ bài đăng / Tên khách
       │      ├── `phone`: Số điện thoại trích xuất (nếu có)
       │      ├── `budgetMin` / `budgetMax`: Khoảng ngân sách phát hiện
       │      ├── `needSummary`: Tóm tắt nhu cầu phân tích bởi AI
       │      ├── `status`: 'new'
       │      └── `findingId`: Khóa ngoại tham chiếu bản ghi nguồn
       │
       ├──► 5. Cập nhật `AgentFinding.status = 'promoted'`
       ▼
[Trả về HTTP 200 OK: { leadId, message: 'Đã chuyển thành công' }]
       │
       ▼
[Khách hàng xuất hiện ngay lập tức trong bảng "Khách hàng CRM" / "Leads đầu tư"]
```

---

## 3. Trạng Thái Vòng Đời Của Khách Hàng (Lead Lifecycle States)

```
[Mới (New)] ──► [Tiềm năng (Warm)] ──► [Nóng (Hot)] ──► [Thành công (Closed)]
      │                  │                   │
      └──────────────────┴───────────────────┴──────────► [Thất bại (Lost)]
```

- **New:** Khách mới tạo hoặc mới nhận từ web/radar, chưa có chuyên viên liên hệ.
- **Warm:** Đã gọi điện/nhắn tin, khách có nhu cầu thực tế và đang cân nhắc.
- **Hot:** Khách đã đi xem thực tế hoặc đang đàm phán cọc/hợp đồng.
- **Closed:** Giao dịch thành công, đã ký hợp đồng mua bán/cho thuê.
- **Lost:** Khách từ chối, sai số điện thoại hoặc đã mua dự án khác.

---

## 4. Kiểm Soát Quyền Truy Cập CRM Theo Gói Dịch Vụ (Entitlements Gate)

1. **Super Admin & Team Root:** Mặc định có toàn quyền truy cập toàn bộ khách hàng (`scope: all`).
2. **Team Lead & Member thông thường:** 
   - Đòi hỏi phải có gói tính năng Premium `crm` hoặc `investor_leads`.
   - Nếu chưa có gói: Hệ thống trả mã lỗi `403 Forbidden` kèm thông báo `requiresPremiumUpgrade: true`.
   - Khi có gói: Team Lead xem được khách trong team (`scope: team`), Member xem khách do mình phụ trách (`scope: own`).

---

## 5. Đánh Giá Trạng Thái Kiểm Chứng

- **Mức độ xác minh:** `VERIFIED_WORKING`.
- **Bằng chứng:** Database có 11 leads, 19 khách hàng CRM và 1,141 bản ghi findings. Cơ chế chuyển đổi từ finding sang lead đã có mã nguồn xử lý và dữ liệu thực.
