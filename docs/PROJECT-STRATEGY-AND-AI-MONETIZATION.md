# CHIẾN LƯỢC PHÁT TRIỂN NỀN TẢNG HOUSE & LIFE (BDSDANANG.SITE)
## TỔNG QUAN Ý TƯỞNG, KIẾN TRÚC KỸ THUẬT, ỨNG DỤNG AI & MÔ HÌNH KINH DOANH PREMIUM

*Phiên bản:* 2.0  
*Ngày lập:* 19/10/2026  
*Căn cứ dữ liệu:* Toàn bộ source code nền tảng (`server/`, `src/`, `desktop/`, `prisma/schema.prisma`).

---

## 1. TỔNG QUAN Ý TƯỞNG CỐT LÕI (EXECUTIVE SUMMARY)

### 1.1. Bối cảnh & Điểm đau của thị trường BĐS (Problem)
Thị trường bất động sản truyền thống đang đối mặt với những rào cản lớn:
1. **Môi giới kiệt sức vì tìm kiếm khách hàng:** Hơn 70% thời gian của chuyên viên môi giới bị lãng phí vào việc đăng tin dạo trên hàng trăm hội nhóm Facebook, Zalo một cách thủ công, tỷ lệ tiếp cận khách nét cực thấp.
2. **Thông tin giỏ hàng phân mảnh & loạn giá:** Không có cơ chế xác thực nguồn tin (chính chủ vs môi giới), dẫn đến việc trùng tin, cướp khách, lộ thông tin cá nhân.
3. **Tỷ lệ chuyển đổi thấp:** Khách hàng vào website chỉ xem lướt qua rồi rời đi do thiếu sự tương tác tư vấn tức thì theo thời gian thực (real-time).
4. **Quản trị đội nhóm lỏng lẻo:** Các sàn giao dịch và Team Lead khó kiểm soát data khách hàng của nhân viên, dễ thất thoát nguồn tài nguyên khi môi giới nghỉ việc.

### 1.2. Giải pháp House & Life (Solution & Value Proposition)
**House & Life (`bdsdanang.site`)** không đơn thuần là một website bất động sản hay một trang tin đăng, mà là **Hệ sinh thái tiếp thị số & vận hành BĐS tự động hóa (Autonomous Real Estate Growth Platform)** tích hợp:
- **Cổng thông tin BĐS công khai tối ưu SEO:** Thu hút lưu lượng truy cập tự nhiên (Organic Traffic) từ Google với bộ từ khóa ngách địa phương (Đà Nẵng & miền Trung).
- **Hệ thống AI Radar & Desktop Agent:** Tự động lắng nghe và trích xuất nhu cầu mua/thuê từ mạng xã hội (Facebook Groups, Zalo) theo thời gian thực.
- **Trợ lý ảo RAG AI (Lily):** Tư vấn, giải đáp pháp lý và điều hướng giỏ hàng chuẩn xác 24/7.
- **Hệ thống Quản trị Doanh nghiệp & Ví Token:** Quản lý giỏ hàng đa cấp, phân phối hoa hồng, bảo mật bản quyền desktop qua chữ ký số PEM và mô hình bán gói Premium bằng Token nội bộ.

```
                             KIẾN TRÚC TỔNG THỂ HỆ THỐNG
┌────────────────────────────────────────────────────────────────────────┐
│               1. CỔNG THÔNG TIN CÔNG KHAI (bdsdanang.site)             │
│  • Danh mục BĐS chuẩn SEO   • Landing Pages dự án   • Lead Magnet Hub │
│  • Form lọc thông minh      • Trợ lý AI Lily tư vấn • Profile Môi giới│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│              2. HỆ THỐNG ĐIỀU HÀNH TRUNG TÂM (ENTERPRISE CMS)          │
│  • Kho giỏ hàng tập trung   • Phân quyền RBAC 2D    • Ví Wallet Token │
│  • Quản lý Team & Referral  • Lead Intelligence CRM • License Key Server│
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
┌──────────────────▼───────────────┐ ┌───────────────▼───────────────────┐
│ 3. DESKTOP AI AGENT (ELECTRON)   │ │ 4. LÕI TRÍ TUỆ NHÂN TẠO (AI ENGINE)│
│ • Chạy ngầm trên máy tính Sale   │ │ • RAG Knowledge Base BĐS          │
│ • Lắng nghe CDP Facebook & Zalo  │ │ • Guardrails chống ảo giác pháp lý│
│ • Trích xuất & Chấm điểm Lead hot│ │ • AI Content Generator Đa kênh    │
│ • Push Toast Windows & Sync VPS  │ │ • Smart Recommendation giỏ hàng   │
└──────────────────────────────────┘ └───────────────────────────────────┘
```

---

## 2. KIẾN TRÚC PHÂN HỆ & HƯỚNG TRIỂN KHAI KỸ THUẬT

### 2.1. Phân hệ 1: Cổng thông tin công khai & Phễu thu hút khách (Public Web Portal)
- **Công nghệ:** React 19, TypeScript, Vite, TailwindCSS, Server-Side SEO Injection.
- **Tính năng nổi bật:**
  - **Tối ưu SEO Onpage tự động:** Hệ thống slug động chuẩn ngữ nghĩa (`/dat-nen-nam-da-nang`, `/can-ho-da-nang-cho-thue`, `/du-an/:slug`), schema microdata BĐS, BreadcrumbList và sitemap tự động sinh.
  - **Trang chi tiết BĐS chuyên sâu:**
    - Cơ chế **phân tách thông minh:** Nếu giỏ hàng của môi giới đăng, hiển thị độc quyền thẻ *Môi giới phụ trách* (ảnh đại diện, hotline môi giới, nút Zalo trực tiếp, link hồ sơ). Nếu là sản phẩm của công ty/admin, hiển thị thẻ *Liên hệ nhanh* của ban quản trị (Mr Linh & Ms Hằng).
    - Thanh điều hướng Mobile Bottom Bar cố định giúp khách gọi hoặc chat Zalo trong 1 chạm.
  - **Phễu chuyển đổi nhà đầu tư (Lead Magnet):** Tặng tài liệu quy hoạch, cẩm nang đầu tư Đà Nẵng để thu thập thông tin khách hàng tiềm năng chất lượng cao vào CRM.

### 2.2. Phân hệ 2: Hệ thống quản trị trung tâm & Phân quyền đa cấp (CMS & RBAC)
- **Công nghệ:** Node.js, Express, PostgreSQL, Prisma ORM, Argon2, JWT stateless.
- **Tính năng cốt lõi:**
  - **Ma trận phân quyền 2 chiều (Interactive 2D RBAC Matrix):** Định nghĩa chi tiết các quyền: `properties.create`, `properties.view_team`, `leads.assign`, `wallet.manage`, `agent.run_scanner`,...
  - **Cấu trúc Đội nhóm (Team & Broker Hierarchy):**
    - **Super Admin:** Toàn quyền quản trị, cấp phát token, theo dõi doanh thu và giám sát runtime.
    - **Company / Sàn liên kết:** Quản lý kho hàng doanh nghiệp và các chi nhánh.
    - **Team Lead:** Có link/mã giới thiệu riêng (`referral_code`), duyệt thành viên vào nhóm, phân bổ tin BĐS và chia sẻ nguồn khách trong nhóm.
    - **Member (Môi giới cá nhân):** Đăng giỏ hàng cá nhân, quản trị khách hàng của riêng mình.

### 2.3. Phân hệ 3: Ứng dụng Desktop AI Agent (`desktop/`)
- **Công nghệ:** Electron, Chrome DevTools Protocol (CDP), Internal WebContents Debugger, Windows Native Toast Notification.
- **Nguyên lý vận hành:**
  - Ứng dụng chạy ngầm trên máy tính của chuyên viên môi giới.
  - Duy trì phiên đăng nhập bền vững của Facebook Web và Zalo Web.
  - Bộ lắng nghe CDP bắt các gói tin GraphQL và tin nhắn trao đổi trên các nhóm BĐS Đà Nẵng, Quảng Nam.
  - Bộ lọc Regex & AI NLP phân tích nội dung bài viết ngay tại local, phát hiện số điện thoại, ngân sách, khu vực quan tâm.
  - Hiển thị pop-up thông báo Windows Toast ngay khi có bài đăng của khách hàng nét ("Cần tìm đất Hòa Xuân dưới 3 tỷ...", "Cần thuê căn hộ Sơn Trà...").
  - Đồng bộ tự động về hệ thống VPS (`VpsOutboxSync`) để đổ vào CRM nội bộ.

---

## 3. CÁCH ÁP DỤNG TRÍ TUỆ NHÂN TẠO (AI STRATEGY)

Hệ thống triển khai AI theo 4 trụ cột thực tế, không dùng AI chung chung mà nhắm thẳng vào tối ưu hóa doanh thu:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     4 TRỤ CỘT AI TRONG HOUSE & LIFE                    │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│ 1. AI RADAR      │ 2. TRỢ LÝ RAG    │ 3. CONTENT AI    │ 4. AI SAFETY  │
│ (Lead Detector)  │ (Lily Sales Rep) │ (Marketing Pro)  │ (Guardrails)  │
├──────────────────┼──────────────────┼──────────────────┼───────────────┤
│ • Bắt sóng group │ • Tư vấn giỏ hàng│ • Bài đăng FB    │ • Kiểm tra giá│
│ • Quét Zalo Web  │ • Tra cứu sổ đỏ  │ • Tin nhắn Zalo  │ • Chống ảo    │
│ • Chấm điểm Lead │ • Gợi ý theo tài │ • Kịch bản TikTok│   giác pháp lý│
│ • Bắn alert ngay │   chính & vị trí │ • Bài viết chuẩn │ • Bắt buộc    │
│   lập tức        │ • Học từ tài liệu│   SEO Google     │   Admin duyệt │
└──────────────────┴──────────────────┴──────────────────┴───────────────┘
```

### 3.1. AI Radar & Chấm điểm tiềm năng Lead (Lead Scoring Pipeline)
- **Cơ chế:** Khi Desktop Tool hoặc Web Scanner bắt được nội dung bài đăng/bình luận:
  1. **Trích xuất thông tin:** Tách lọc tự động số điện thoại, khu vực (Hòa Xuân, Ngũ Hành Sơn, Cẩm Lệ,...), loại hình (đất nền, căn hộ, shophouse) và mức giá.
  2. **Chấm điểm tiềm năng (0 - 100 điểm):**
     - Có số điện thoại liên hệ: `+30 điểm`
     - Có khoảng giá và vị trí cụ thể: `+25 điểm`
     - Nhu cầu cấp thiết (cần mua gấp, công chứng ngay): `+25 điểm`
     - Từ khóa tiêu cực/spam (quảng cáo sim, tuyển dụng): `-50 điểm`
  3. **Phân loại hành vi (Intent Detection):** Phân chia rõ: `BUYER` (Người mua), `TENANT` (Người thuê), `OWNER_SELLER` (Chủ nhà gửi bán), `BROKER` (Môi giới tìm hàng).

### 3.2. Trợ lý RAG AI Bán hàng (Lily AI Sales Consultant)
- **Cơ chế RAG (Retrieval-Augmented Generation):**
  - Hệ thống chỉ mục hóa toàn bộ tài liệu chuyên sâu trong `docs/rag/` kết hợp cơ sở dữ liệu giỏ hàng Postgres.
  - Khi khách hàng nhắn tin trên website hoặc ứng dụng nội bộ:
    1. AI nhận diện ý định (tìm kiếm sản phẩm, hỏi quy hoạch, hỏi thủ tục công chứng, hướng dẫn đăng tin).
    2. Truy vấn trực tiếp các BĐS thỏa mãn tiêu chí từ bảng `cms_records` (nguồn `properties`).
    3. Đưa ra câu trả lời tự nhiên, chính xác, đính kèm đường dẫn xem chi tiết BĐS và số điện thoại của đúng môi giới phụ trách.
  - **Tránh ảo giác (Hallucination Control):** Nếu giỏ hàng không có sản phẩm khớp, Lily trung thực thông báo và hướng dẫn khách đăng ký tiêu chí để chuyên viên liên hệ lại, tuyệt đối không bịa đặt sản phẩm không có thật.

### 3.3. Động cơ sản xuất nội dung tiếp thị tự động (AI Content Engine)
- Môi giới chỉ cần chọn một căn nhà hoặc mảnh đất trong kho:
  - Bấm **"Tạo bài đăng AI"**, hệ thống sinh ra 4 biến thể nội dung tức thì:
    1. **Bài viết Facebook:** Giật tít theo phong cách đầu tư/sập hầm, tối ưu hashtag, chèn icon trực quan.
    2. **Tin nhắn Zalo:** Ngắn gọn, súc tích, đầy đủ thông số kỹ thuật (diện tích, đường, hướng, giá) để gửi vào các nhóm kín.
    3. **Kịch bản Video ngắn (TikTok / Reels / YouTube Shorts):** Định dạng phân cảnh (Visual, Audio, Voiceover) dài 45-60 giây để môi giới tự quay video review.
    4. **Bài viết Chuẩn SEO:** Đầy đủ tiêu đề H2, H3, FAQ và liên kết nội bộ tự động để đăng lên mục Blog/Tin tức.

### 3.4. Bộ lọc kiểm soát an toàn & Pháp lý (AI Safety & Property Guardrails)
- Được triển khai chặt chẽ tại `server/ai/propertyGuardrail.ts`:
  - Kiểm tra tính nhất quán giữa bài viết AI tạo ra với dữ liệu gốc trong database.
  - **Ngăn chặn nâng khống pháp lý:** Nếu trong database ghi `Hợp đồng mua bán` hoặc `Đang chờ sổ`, AI tuyệt đối bị chặn không được tự tiện viết thành `Đã có sổ đỏ lâu dài`.
  - **Kiểm soát độ lệch giá:** Giá trong bài viết tiếp thị không được chênh lệch vượt quá giới hạn cấu hình so với giá niêm yết trong hệ thống.
  - Mọi bài viết vi phạm sẽ bị đánh dấu cờ `requiresManualReview: true` và bắt buộc có sự kiểm duyệt của quản trị viên trước khi xuất bản.

---

## 4. CHIẾN LƯỢC BÁN TÀI KHOẢN PREMIUM & MÔ HÌNH VÍ TOKEN

### 4.1. Kiến trúc Ví Token nội bộ (`user_wallets`)
Nền tảng xây dựng hệ thống tiền tệ token nội bộ khép kín nhằm bảo mật giao dịch và loại bỏ rủi ro tranh chấp qua cổng thanh toán bên thứ ba:
- **Nguyên tắc bảo vệ số dư (ACID & Optimistic Locking):**
  - Mỗi người dùng sở hữu 1 ví duy nhất liên kết với `userId`.
  - Phân tách rõ ràng giữa `balance` (tổng số dư), `lockedBalance` (số dư đang khóa/treo) và `availableBalance = balance - lockedBalance` (số dư khả dụng).
  - Mọi thao tác nạp/trừ/khóa token đều chạy trong Prisma Transaction kèm cơ chế tăng `version` để chống tấn công ghi đè đồng thời (race condition).
  - Bảng `wallet_transactions` ghi vết minh bạch: Số dư trước, số dư sau, loại giao dịch (`admin_deposit`, `license_upgrade`, `lock`), ghi chú lý do và người thực hiện.

### 4.2. Cơ chế nạp Token vào ví (Top-up Flow)
1. **Quy trình nạp thủ công / Chuyển khoản QR an toàn:**
   - Người dùng quét mã QR chuyển khoản ngân hàng tới tài khoản công ty với cú pháp: `NAPTOKEN [EMAIL_HOAC_USERID]`.
   - Super Admin kiểm tra biến động số dư và sử dụng tính năng **Cộng Token Ví** trong Admin Dashboard để nạp token vào ví user kèm mã giao dịch ngân hàng.
2. **Quy trình trả thưởng qua mạng lưới Affiliate:**
   - Khi môi giới cấp dưới hoặc khách hàng đăng ký qua mã giới thiệu phát sinh giao dịch, hệ thống tự động trích thưởng token trực tiếp vào ví của người giới thiệu.

### 4.3. Bảng phân tầng gói dịch vụ (Subscription Tier Packaging)

| Tiêu chí | Gói MIỄN PHÍ (Free / Trial) | Gói CHUYÊN NGHIỆP (Pro Agent) | Gói DOANH NGHIỆP (Enterprise / Team) |
| :--- | :--- | :--- | :--- |
| **Giá Token** | 0 Token | **100 Token / tháng** | **300 Token / tháng** |
| **Quy đổi dự kiến** | 0 VNĐ | ~**500.000 VNĐ / tháng** | ~**1.500.000 VNĐ / tháng** |
| **Đăng tin BĐS** | Tối đa 5 tin/tháng | Không giới hạn | Không giới hạn |
| **Hồ sơ môi giới** | Trang cá nhân cơ bản | Huy hiệu **PRO AGENT** uy tín | Huy hiệu **ENTERPRISE PARTNER** |
| **Desktop AI Tool** | Dùng thử 3 ngày (Trial Key) | **Kích hoạt tối đa 3 máy tính** | **Kích hoạt tối đa 10 máy tính** |
| **AI Radar quét Lead** | Không hỗ trợ | Quét 5 nhóm Facebook & Zalo | Quét không giới hạn nhóm |
| **Thông báo Lead Hot** | Trễ 60 phút | **Thông báo Toast tức thì (Real-time)** | **Real-time + Bắn alert qua Telegram** |
| **AI Content Generator**| 3 bài/tháng | Không giới hạn bài viết đa kênh | Không giới hạn + Huấn luyện theo văn phong sàn |
| **Quản trị Đội nhóm** | Không hỗ trợ | Xem giỏ hàng nhóm | Tuyển dụng qua Referral, phân bổ tin, báo cáo doanh số |

### 4.4. Cơ chế bảo vệ bản quyền Desktop bằng Chữ ký số (Cryptographic License & PEM)
Để ngăn chặn tình trạng một người mua tài khoản rồi chia sẻ cho nhiều người khác dùng chung công cụ Desktop:
1. Khi người dùng bấm **Nâng cấp gói** bằng Token:
   - Hệ thống tự sinh mã khóa bí mật `licenseKey` (dạng `HL-XXXX-XXXX-XXXX`).
   - Ký điện tử và tạo ra chuỗi **Chứng chỉ PEM (`-----BEGIN HL AGENT LICENSE-----`)** chứa đầy đủ thông tin: `userId`, `plan`, `expiresAt`, `maxDevices`.
2. Khi đăng nhập vào Desktop Agent:
   - Người dùng nhập License Key hoặc dán chuỗi PEM.
   - Ứng dụng Desktop đọc mã phần cứng duy nhất của máy tính (`hardwareUuid` / MAC address) và gửi về server để kích hoạt (`/api/license/activate`).
   - Nếu số thiết bị vượt quá `maxDevices` (3 máy đối với Pro, 10 máy đối với Enterprise), yêu cầu kích hoạt sẽ bị từ chối ngay lập tức.
   - Super Admin hoặc người dùng có thể chủ động hủy liên kết (Revoke Device) của các máy cũ để chuyển sang máy mới.

---

## 5. KỊCH BẢN BÁN HÀNG & PHỄU CHUYỂN ĐỔI (GO-TO-MARKET FUNNEL)

### Phễu chuyển đổi 4 bước (The 4-Step Conversion Funnel)

```
[BƯỚC 1: MẮC CÂU (FREE VALUE)]
Tặng tài liệu quy hoạch, cẩm nang đầu tư Đà Nẵng miễn phí trên web
Cho phép môi giới đăng ký tài khoản miễn phí để tạo Profile & đăng 5 tin đầu tiên
                      │
                      ▼
[BƯỚC 2: TRẢI NGHIỆM ĐÒN BẨY (AHA MOMENT)]
Cấp License Key Trial 3 ngày sử dụng phần mềm Desktop AI Agent
Môi giới tận mắt thấy thông báo: "Khách vừa đăng tìm mua đất Nam Hòa Xuân giá 3.2 tỷ (SĐT: 0905...)"
bật lên màn hình ngay trong giờ làm việc
                      │
                      ▼
[BƯỚC 3: KÍCH HOẠT THANH TOÁN (PAYMENT TRIGGER)]
Sau 3 ngày, khóa tính năng Desktop Tool. Thông báo:
"Bạn có 15 khách nét đang chờ chăm sóc. Nạp 100 Token để tiếp tục dùng gói Pro"
Môi giới chuyển khoản nạp token để mở khóa bản quyền 1 tháng
                      │
                      ▼
[BƯỚC 4: LAN TỎA & GIỮ CHÂN (RETENTION & NETWORK EFFECT)]
Môi giới kiếm được giao dịch thật nhờ nguồn tin của hệ thống
Họ chia sẻ mã giới thiệu (Referral Code) cho đồng nghiệp / lập Team riêng
Trở thành Team Lead nâng cấp lên gói Enterprise (300 Token) để quản lý nhóm
```

---

## 6. LỘ TRÌNH TRIỂN KHAI THỰC CHIẾN (ACTIONABLE ROADMAP)

### Giai đoạn 1: Chuẩn hóa & Vận hành nội bộ (Tháng 1)
- **Mục tiêu:** Kiểm thử thực tế hiệu quả của nguồn Lead trên đội ngũ môi giới House & Life.
- **Hành động cụ thể:**
  - Cài đặt Desktop Agent cho 5 - 10 môi giới nòng cốt của công ty.
  - Cấu hình danh sách 30 nhóm Facebook BĐS Đà Nẵng, Quảng Nam chất lượng cao nhất vào hệ thống quét (`agent_sources`).
  - Đo lường độ chuẩn xác của việc bắt số điện thoại và chấm điểm Lead.
  - Đóng gói file cài đặt chuẩn `.exe` (`HouseAndLife-Agent-Setup.exe`) lưu trên máy chủ lưu trữ chuyên dụng (GCS hoặc AWS S3) để phân phối tải về ổn định.

### Giai đoạn 2: Khởi động chương trình Beta & Thu hút 50 Môi giới đầu tiên (Tháng 2)
- **Mục tiêu:** Tạo hiệu ứng mạng lưới (Network Effect) trong cộng đồng môi giới Đà Nẵng.
- **Hành động cụ thể:**
  - Viết các bài chia sẻ giải pháp: *"Cách nhận thông báo khách mua đất Hòa Xuân trước thị trường 30 phút"* đăng lên các hội nhóm môi giới.
  - Tặng gói dùng thử Pro 7 ngày (trị giá 50 Token) cho 50 môi giới đăng ký sớm nhất có kho hàng thật.
  - Hướng dẫn môi giới tạo Profile cá nhân trên `bdsdanang.site` để chia sẻ giỏ hàng lên Zalo/Facebook.

### Giai đoạn 3: Thương mại hóa bằng mô hình Token & Mở rộng Team (Tháng 3 - Tháng 6)
- **Mục tiêu:** Đạt mốc 200 thuê bao trả phí hàng tháng (Doanh thu định kỳ ~100.000.000 VNĐ/tháng từ bán token).
- **Hành động cụ thể:**
  - Kích hoạt chính thức tính năng trừ token ví khi nâng cấp gói bản quyền.
  - Làm việc với các Trưởng nhóm BĐS lớn (Đất Xanh, Đan Kiều, Thiên Khôi,...) để chào gói **Enterprise Team**, giúp họ quản lý 10 - 20 nhân viên bằng nền tảng chung.
  - Tổ chức các buổi workshop online hướng dẫn ứng dụng AI viết bài và chốt khách BĐS.

### Giai đoạn 4: Mở rộng địa bàn & Tự động hóa toàn diện (Tháng 7 trở đi)
- Nhân bản hệ thống sang các thị trường BĐS lân cận: Hội An, Tam Kỳ, Huế, Quy Nhơn, Nha Trang.
- Tích hợp thêm AI Voice Callbot tự động gọi xác nhận nhu cầu sơ bộ của Lead trước khi bắn thông báo cho môi giới.

---

## 7. KẾT LUẬN & KIẾN NGHỊ VẬN HÀNH

Source code hiện tại của dự án đã sở hữu một nền tảng kỹ thuật rất vững chắc và hiếm có trên thị trường:
1. **Kiến trúc full-stack hoàn chỉnh:** Từ cổng thông tin công khai chuẩn SEO, giao diện quản trị React tinh gọn, backend Node.js/Prisma chặt chẽ đến ứng dụng desktop Electron CDP tân tiến.
2. **Hệ thống tiền tệ & bảo mật sẵn sàng kinh doanh:** Đã có đầy đủ bảng `user_wallets`, `wallet_transactions`, `license_keys`, mã hóa PEM, phân quyền 2D RBAC.
3. **Giá trị AI có tính ứng dụng cao:** Tập trung vào giải quyết đúng nỗi đau sống còn của môi giới là **Tìm khách nét - Soạn nội dung - Quản lý giỏ hàng**.

**Hành động khuyến nghị ưu tiên ngay:**
- Tiếp tục duy trì môi trường production ổn định, sạch dữ liệu rác.
- Tận dụng quy trình nạp Token qua Admin đã hoàn thiện để bắt đầu thương mại hóa ngay với các đối tác môi giới đầu tiên tại Đà Nẵng.
- Đặt file `HouseAndLife-Agent-Setup.exe` lên đường link tải trực tiếp (Cloud Storage) để người dùng tải về cài đặt thuận tiện.
