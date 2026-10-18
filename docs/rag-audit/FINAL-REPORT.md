# BÁO CÁO TỔNG KẾT KIỂM TOÁN HỆ THỐNG BDSDANANG.SITE & BỘ TRI THỨC RAG
**Mã tài liệu:** `AUDIT-FINAL-REPORT`  
**Ngày thực hiện:** 17/10/2026  
**Chuyên gia kiểm toán:** Senior Software Architect, Product Analyst, QA Engineer & RAG Knowledge Engineer  
**Phiên bản hệ thống:** `1.0.0` (Production Live tại `https://bdsdanang.site`)

---

## 1. TÓM TẮT KIẾN TRÚC HỆ THỐNG ĐÃ PHÁT HIỆN

Hệ thống **bdsdanang.site** là một nền tảng phức hợp kết hợp giữa Cổng thông tin tiếp thị bất động sản công khai và Hệ thống điều hành doanh nghiệp (CMS & AI Agent Platform):
- **Frontend:** React `19.0.1` SPA, TypeScript, Vite `6.2.3`, TailwindCSS v4, React Router `7.11.0`. Tách biệt thành Cổng tìm kiếm công khai cho nhà đầu tư và Bảng điều khiển quản trị Admin cho chuyên viên/quản lý.
- **Backend:** Node.js (`v20.19.5`), Express `4.21.2`, Prisma ORM `5.22.0`, ESBuild bundling (`dist/server.cjs`).
- **Cơ sở dữ liệu:** PostgreSQL 18 với 71 bảng mô hình, kết hợp giữa mô hình quan hệ chặt chẽ (`users`, `teams`, `team_members`, `role_permissions`, `entitlements`, `leads`, `license_keys`) và mô hình JSONB linh hoạt (`cms_records`) cho các thực thể tin BĐS và khách hàng.
- **Bảo mật & Phân quyền:** Deny-by-default RBAC Route Guard, giải quyết quyền hiệu lực qua Ma trận 2D trên 5 vai trò (`super_admin`, `team_lead`, `member`, `independent`, `pending_member`) và 30 quyền hạn. Mật khẩu mã hóa bằng `scrypt` kèm salt, token JWT có cơ chế thu hồi phiên tức thì qua `token_version`.
- **Desktop Tool:** Ứng dụng Electron `44.7.0` (`HouseAndLife-Agent-Setup.exe` 175MB) hỗ trợ tự động hóa trình duyệt và đăng bài qua CDP Playwright.
- **Tình trạng Vận hành:** Đang chạy ổn định trên VPS Ubuntu `bdsdanang.site` (PID 2997066, Memory ~196MB, Uptime 100%, SSL Certbot hoạt động tốt).

---

## 2. DANH SÁCH MODULE VÀ TÍNH NĂNG

Hệ thống được chia thành 6 module nghiệp vụ lớn:
1. **Module Cổng Thông Tin Công Khai (Public Site):** Danh mục nhà đất, bộ lọc BĐS, chi tiết tin, landing page chuyên đề, nhận tài liệu đầu tư (Lead Magnet), blog tin tức.
2. **Module Xác Thực & Đội Nhóm (Auth & Teams):** Đăng ký, đăng nhập, mã giới thiệu (Referral Code), quản lý nhóm, duyệt thành viên vào team, cập nhật mã bảo trợ trong hồ sơ cá nhân.
3. **Module Quản Trị Bất Động Sản (Property & Cart):** Đăng tin BĐS, phân loại Môi giới / Chính chủ, bảo vệ quyền sở hữu tin (`owner_user_id` bất biến), phân phối giỏ hàng cho nhân viên bán, cơ chế Optimistic Locking chống xung đột.
4. **Module Khách Hàng & CRM (Leads & CRM):** Quản lý khách hàng, chấm điểm tiềm năng (0-100), ghi chú lịch sử tương tác, phân phễu bán hàng.
5. **Module Quản Trị Phân Quyền & Gói (RBAC & Entitlements):** Ma trận quyền 2 chiều dạng bảng tương tác (checkbox bật/tắt tức thì, chọn scope all/team/own), quản lý gói thuê bao tính năng, cấp License Key kích hoạt phần mềm máy tính.
6. **Module AI & Tiếp Thị Tự Động (AI Agent Platform):** Trợ lý AI nội bộ (Chatbot), Radar quét khách hàng tiềm năng trên mạng xã hội (`AgentFinding`), tự động tạo bài viết tiếp thị, quản lý link rút gọn định danh (`Shortlinks`).

---

## 3. CÁC TÍNH NĂNG ĐÃ XÁC MINH HOẠT ĐỘNG (VERIFIED_WORKING)

1. **Tìm kiếm & Lọc BĐS Công khai (`FEAT-PUB-CATALOG`):** API `GET /api/public/properties` trả về 26 tin BĐS thực tế, giao diện lọc mượt mà.
2. **Đăng ký kèm Mã Giới thiệu (`FEAT-AUTH-REG`):** Phân giải chuẩn xác mã hệ sinh thái `REF-UOWNER` và mã riêng của từng Lead, tự động gán trạng thái `pending_member`.
3. **Cập nhật Mã Giới thiệu trong Hồ sơ (`FEAT-PROFILE-REF`):** Đã bổ sung ô nhập mã bảo trợ tại `/admin#profile` và kiểm thử thành công.
4. **Phê duyệt Thành viên Đội nhóm (`FEAT-TEAM-MGR`):** Team Lead xem danh sách chờ duyệt và bấm Approve để chuyển role lên `member`.
5. **Ma trận Phân quyền 2D Dạng Bảng (`FEAT-RBAC-2D`):** Super Admin tick checkbox lưu ngay lập tức vào database (đủ 150 quy tắc trong bảng `role_permissions`).
6. **Bộ Cài Đặt Desktop Tool (`FEAT-LIC-TOOL`):** Tệp `HouseAndLife-Agent-Setup.exe` (175MB) tải thành công HTTP 200 tại đường dẫn chính thức.
7. **Đăng Tin & Kiểm Soát Nguồn Tin (`FEAT-PROP-CRUD`):** Ép buộc chọn Môi giới hoặc Chính chủ, tự động gán `owner_user_id` chống hack quyền sở hữu.
8. **Dọn Dẹp Executive Command Center (`FEAT-EXEC-DASH`):** Đã loại bỏ hoàn toàn số liệu rác/ảo, hiển thị chỉ số thời gian thực từ database.
9. **Điều Hướng Đăng Xuất (`FEAT-AUTH-LOG`):** Logout từ `/dang-nhap` chuyển hướng chính xác về `/dang-nhap`.

---

## 4. CÁC TÍNH NĂNG CHƯA XÁC MINH HOẶC TRIỂN KHAI MỘT PHẦN

1. **Phân phối giỏ hàng hàng loạt (`FEAT-PROP-DIST` - `PARTIALLY_IMPLEMENTED`):** Backend và bảng `property_assignments` đã sẵn sàng, nhưng giao diện phân phối mới hỗ trợ từng căn đơn lẻ, chưa có giao diện tick chọn phân phối nhiều căn cùng lúc.
2. **Thanh toán tự động gói Entitlement (`PLANNED`):** Hiện tại việc cấp gói và gia hạn thời gian sử dụng đều do Super Admin thao tác thủ công trên giao diện quản trị; chưa tích hợp cổng thanh toán trực tuyến tự động kích hoạt gói.
3. **Gửi OTP Email khi đăng ký (`PLANNED`):** Tài khoản đăng ký xong có thể đăng nhập ngay; chưa bắt buộc xác thực mã OTP qua email.

---

## 5. NHỮNG MÂU THUẪN ĐÃ PHÁT HIỆN VÀ ĐÃ ĐƯỢC GIẢI QUYẾT

- **Mâu thuẫn 1 (Mã giới thiệu hệ thống):** Trước đây nhập `REF-UOWNER` bị báo không tồn tại do query tìm theo `id` thay vì mã referral. *Đã sửa và xác minh hoàn tất.*
- **Mâu thuẫn 2 (Dữ liệu Dashboard ảo):** Dashboard từng hiển thị doanh thu dự kiến 719.7 tỷ từ dữ liệu mẫu hardcode. *Đã dọn dẹp sạch sẽ, chuyển sang truy vấn trực tiếp từ database.*
- **Mâu thuẫn 3 (Dung lượng ổ cứng VPS & Deploy):** VPS bị đầy ổ cứng (100%) do chứa các bản sao lưu cũ và gói deploy bị đóng gói nhầm file rác (973MB). *Đã tối ưu script đóng gói xuống còn 175MB, thiết lập cơ chế tự động xoay vòng bản sao lưu và dọn dẹp giải phóng 2.7GB ổ cứng trên VPS.*

---

## 6. VẤN ĐỀ VỀ DỮ LIỆU & ĐỘ MỚI (DATA & FRESHNESS)

- **Tri thức ổn định:** Đã được hệ thống hóa đầy đủ vào 11 tệp tài liệu trong `docs/rag/`.
- **Dữ liệu động:** Đã ban hành chính sách `RAG-DATA-07`. Toàn bộ dữ liệu giá bán, tình trạng căn hộ, số điện thoại chủ nhà **tuyệt đối không được nhúng cứng vào vector database**, mà phải được truy vấn qua API realtime hoặc chuyển tiếp sang chuyên viên tư vấn.

---

## 7. DANH SÁCH BỘ TÀI LIỆU RAG ĐÃ XÂY DỰNG

Toàn bộ tài liệu được viết bằng tiếng Việt chuẩn mực, cấu trúc markdown chuẩn hóa phục vụ chia chunk và embedding tối ưu trong thư mục `docs/rag/`:

1. [`docs/rag/00-product-overview.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/00-product-overview.md): Tổng quan sản phẩm, kiến trúc và giá trị nghiệp vụ.
2. [`docs/rag/01-feature-catalog.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/01-feature-catalog.md): Danh mục 14 tính năng chi tiết kèm mã định danh và trạng thái.
3. [`docs/rag/02-user-roles-and-permissions.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/02-user-roles-and-permissions.md): Đặc tả 5 vai trò và bảng ma trận 30 quyền hạn kèm phạm vi dữ liệu (Scope).
4. [`docs/rag/03-user-guides/user-guide.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/03-user-guides/user-guide.md): Hướng dẫn thao tác từng bước cho Khách hàng, Chuyên viên, Team Lead và Super Admin.
5. [`docs/rag/04-business-rules/business-rules.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/04-business-rules/business-rules.md): Quy tắc nghiệp vụ cốt lõi (Sở hữu tin, Broker/Owner, AI Fact-checking).
6. [`docs/rag/05-faq.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/05-faq.md): Bộ câu hỏi thường gặp đa dạng cách diễn đạt theo 5 nhóm chủ đề.
7. [`docs/rag/06-limitations-and-errors.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/06-limitations-and-errors.md): Bảng mã lỗi HTTP, thông điệp người dùng và hướng xử lý.
8. [`docs/rag/07-data-and-freshness-policy.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/07-data-and-freshness-policy.md): Chính sách phân định tri thức tĩnh vs dữ liệu động và quy tắc phát ngôn của AI.
9. [`docs/rag/08-escalation-policy.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/08-escalation-policy.md): Quy trình chuyển tiếp cuộc hội thoại cho chuyên viên con người.
10. [`docs/rag/09-glossary.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/09-glossary.md): Thuật ngữ chuyên ngành BĐS Đà Nẵng và thuật ngữ kỹ thuật hệ thống.
11. [`docs/rag/10-source-registry.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/10-source-registry.md): Bảng đối chiếu nguồn gốc bằng chứng từ code, DB và kiểm thử live.
12. [`docs/rag/tests/rag-evaluation.md`](file:///F:/workspace/real-estate-ai-marketing-agent-cms/docs/rag/tests/rag-evaluation.md): Bộ 10 nhóm test case đánh giá chất lượng phản hồi của RAG.

---

## 8. CÁC RỦI RO NẾU TRIỂN KHAI CHATBOT NGAY LẬP TỨC (RISK ASSESSMENT)

- **Rủi ro 1 (P0 - Báo giá ảo nếu dùng Static Embedding):** Nếu vector hóa trực tiếp giá của các căn nhà vào cơ sở tri thức tĩnh, khi căn nhà đổi giá hoặc đã bán, AI sẽ trả lời sai cho khách hàng.
  *Biện pháp giải quyết:* Áp dụng triệt để chính sách `RAG-DATA-07`, bắt buộc AI trả lời kèm điều khoản tham khảo hoặc gọi Tool API realtime.
- **Rủi ro 2 (P1 - Người dùng chưa duyệt đòi hỏi quyền hạn):** Môi giới mới đăng ký thắc mắc tại sao không thấy giỏ hàng sàn.
  *Biện pháp giải quyết:* Chatbot được huấn luyện dựa trên `RAG-FAQ-05` (Câu 2.2) để giải thích rõ ràng về trạng thái `pending_member` và nhắc liên hệ Trưởng nhóm bấm duyệt.
- **Rủi ro 3 (P1 - Giả mạo giao dịch trực tuyến):** Khách hàng hỏi số tài khoản chuyển tiền cọc.
  *Biện pháp giải quyết:* Quy định cấm trong `RAG-RULE-04` và `RAG-ESCAL-08` yêu cầu AI khẳng định dứt khoát hệ thống không thu tiền online và chỉ hỗ trợ giao dịch công chứng trực tiếp.

---

## 9. DANH SÁCH CÔNG VIỆC ƯU TIÊN TIẾP THEO (NEXT STEPS)

- **Ưu tiên P0 (Khởi tạo Hạ tầng RAG):**
  1. Cấu hình bảng lưu trữ Vector Embeddings (khuyến nghị kích hoạt extension `pgvector` ngay trên PostgreSQL hiện có để tận dụng chung hạ tầng).
  2. Viết script nạp dữ liệu (Ingestion Pipeline) tự động chia chunk các file trong `docs/rag/` và sinh vector embeddings (dùng `text-embedding-004` của Gemini hoặc OpenAI).
- **Ưu tiên P1 (Đánh giá & Kiểm thử tự động):**
  1. Xây dựng test runner tự động chạy qua 10 test case trong `docs/rag/tests/rag-evaluation.md`.
  2. Đo lường tỷ lệ trả lời đúng và khả năng từ chối câu hỏi ngoài phạm vi trước khi bật cho người dùng cuối.
- **Ưu tiên P2 (Tích hợp Tool Realtime):**
  1. Xây dựng hàm Function Calling `/api/public/properties/search` để Chatbot tra cứu giỏ hàng và giá mới nhất tại thời điểm nói chuyện.

---

## 10. ĐỀ XUẤT KIẾN TRÚC TÍCH HỢP RAG Ở GIAI ĐOẠN SAU (RECOMMENDED RAG ARCHITECTURE)

```
[Khách hàng / Môi giới gửi câu hỏi]
                 │
                 ▼
       ┌───────────────────┐
       │ AI Gateway Router │
       └─────────┬─────────┘
                 │
                 ├──► 1. Intent Classification & Guardrail Filter (Kiểm tra PII / Rủi ro)
                 │
                 ├──► 2. Semantic Search (Truy xuất từ pgvector Knowledge Base docs/rag/)
                 │      └── Lấy Top-K chunks liên quan (Cosine Similarity >= 0.78)
                 │
                 ├──► 3. Dynamic Tool Calling (Nếu hỏi về giá / tình trạng BĐS cụ thể)
                 │      └── Gọi trực tiếp API Database /api/public/properties
                 │
                 ├──► 4. Context Assembly & System Prompt (Bọc ngữ cảnh vào Prompt an toàn)
                 │
                 ▼
       ┌───────────────────┐
       │ LLM (Gemini/GPT)  │
       └─────────┬─────────┘
                 │
                 ▼
[Phản hồi chuẩn xác, tự nhiên, kèm nguồn tham chiếu & hotline tư vấn con người]
```
