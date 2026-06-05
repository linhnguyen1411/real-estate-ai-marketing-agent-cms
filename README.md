# Real Estate AI Marketing Agent CMS

Hệ thống quản trị nội dung (CMS), quản lý khách hàng (CRM) và Tự động hóa tiếp thị tích hợp **AI Agent chuyên sâu cho Marketing Bất động sản** tại Việt Nam.

Ứng dụng hỗ trợ các nhà phát triển bất động sản và đại lý môi giới tự động hóa toàn bộ quy trình từ khâu thu thập thông tin nhà đất, tạo vô vàn kịch bản quảng cáo đa kênh, phân loại ý định inbox của khách hàng, cho đến chấm điểm tiềm năng và tư vấn thông minh.

---

## 🚀 Tính năng nổi bật (Features)

1. **Dashboard Tổng Quan**: Trực quan hóa số lượng khách hàng, cơ cấu rổ hàng, tỷ lệ hiệu suất phễu marketing đa nền tảng (Facebook, Zalo, Tiktok, Website) và nhật ký vận hành live-system.
2. **Quản lý khách hàng CRM**: Lưu trữ thông tin chi tiết khách, ngân sách tài chính, ghi chú hành vi và nút kích hoạt **AI phân tích tâm lý, tự động tóm lược và chấm điểm tiềm năng (lead score)**.
3. **Quản lý Bất động sản**: Lưu trữ rổ thông tin nhà phố, đất nền sông biển, shophouse cực trực quan và tính năng **AI sinh nội dung kịch bản marketing 4 kênh** (Zalo, Facebook, TikTok, Blog SEO) kèm Prompt nhiếp ảnh & cinematic video.
4. **AI Content Generator**: Trung tâm đầu não tùy ý chọn mức độ văn phong (Sang trọng, Viral tấu hài, Thuyết phục khẩn trương) để Agent sáng tạo bài đăng tùy biến.
5. **CMS đăng bài**: Bản nháp lưu trữ tự động, giả lập thống kê số liệu tiếp cận thực tế của dự án.
6. **Inbox Đa Kênh**: Giao diện tập trung hóa tin nhắn đa nền tảng, **AI phân loại ý đồ** (hỏi vị trí, hỏi giá, thương lượng) và đề xuất kịch bản phản hồi khách cực kỳ nhạy bén.
7. **Chatbot AI nội bộ**: Người dùng có thể hỏi trực tiếp hệ thống bằng ngôn ngữ tự nhiên về tình trạng giỏ hàng ("Căn nào ở cầu Rồng?"), tóm tắt thông tin khách hoặc đề xuất chiến dịch trong tuần.
8. **Siêu tự động hóa (Automation Center)**: Mô phỏng workflow tự động (thêm BĐS mới tự tạo 3 bài viết; chấm khách đạt score > 80 tự chuyển thành lead vàng và giao việc cho sale).

---

## 📂 Cấu trúc mã nguồn (Project Architecture)

```text
├── /backend            # Mã nguồn backend tham khảo đa ngôn ngữ
│   ├── app.rb          # Sinatra API chính (Ruby)
│   └── app.py          # FastAPI API chính (Python)
├── /server             # Mã nguồn Backend Node.js phục vụ API ở AI Studio (TypeScript)
│   ├── aiService.ts    # Service tích hợp Gemini API / Ollama API
│   └── dbHelper.ts     # Trình quản lý đọc ghi SQLite/JSON database an toàn
├── /src                # Mã nguồn Frontend React
│   ├── App.tsx         # Dashboard UI chính vô cùng hiện đại, trực quan
│   ├── types.ts        # Các kiểu dữ liệu Typescript chặt chẽ
│   └── index.css       # Import Tailwind CSS
├── db.json             # Cơ sở dữ liệu mẫu chuẩn hóa với 10 khách hàng, 8 BĐS lớn, 15 Inbox
├── server.ts           # Unified static server khởi chạy Vite middleware trực tuyến
├── package.json        # Định chuẩn khởi chạy và dependencies phiên bản mới nhất
└── tsconfig.json       # Phân giải Typescript bundler
```

---

## 🛠️ Hướng dẫn cài đặt & khởi chạy (Quickstart Guide)

### 1. Chuẩn bị môi trường & cài đặt Ollama
Để sử dụng mô hình trí tuệ nhân tạo chạy cục bộ miễn phí, hãy tải công cụ **Ollama**:
1. Truy cập [Ollama Official Website](https://ollama.com/) và tải phiên bản phù hợp cho hệ điều hành của bạn (Windows / macOS / Linux).
2. Hãy cài đặt và mở terminal lên để tải mô hình mặc định bằng câu lệnh:
   ```bash
   ollama pull qwen2.5
   # Bạn cũng có thể dùng llama3.1
   ollama pull llama3.1
   ```
3. Khởi động dịch vụ Ollama cục bộ:
   ```bash
   ollama serve
   ```
*Mặc định Ollama sẽ lắng nghe tại cổng `http://localhost:11434`.*

---

### 2. Chạy ứng dụng Web (Node.js Unified Client + Server)
Để chạy demo nhanh chóng trên máy tính cá nhân của bạn, hãy sử dụng cổng Express + Vite thống nhất được setup sẵn:

**Cài đặt các gói phụ thuộc:**
```bash
npm install
```

**Khởi chạy máy chủ phát triển (Development):**
```bash
npm run dev
```
*Giao diện của bạn sẽ xuất hiện lung linh tại địa chỉ `http://localhost:3000`.*

**Biên dịch bản sản xuất (Production Build & Start):**
```bash
npm run build
npm run start
```
**Cấu hình chạy thực tế:**
```bash
cp .env.example .env
# cập nhật GEMINI_API_KEY nếu dùng Gemini, hoặc chọn Ollama trong Settings
```

- Server Node/Express và frontend Vite được chạy chung qua `server.ts` ở môi trường development.
- Production build tạo `dist/server.cjs`; lệnh `npm run start` sẽ serve API và frontend đã build.
- Health check backend: `http://localhost:3000/api/health`.
- AI Assistant trong tab Chatbot AI gọi backend `/api/ai/chat`, dùng Gemini qua `GEMINI_API_KEY` hoặc Ollama local qua Settings.

---

### 3. Chạy Backend bằng Python (FastAPI tham khảo)
Nếu bạn mong muốn vận hành ứng dụng qua máy chủ **Python FastAPI** mạnh mẽ & bảo mật:

1. Di chuyển vào thư mục backend:
   ```bash
   cd backend
   ```
2. Cài đặt các thư viện cần thiết:
   ```bash
   pip install fastapi uvicorn httpx pydantic
   ```
3. Khởi chạy ứng dụng FastAPI:
   ```bash
   python app.py
   ```
Máy chủ Python FastAPI của bạn sẽ hoạt động hoàn hảo tại cổng `http://localhost:8000`.

---

### 4. Chạy Backend bằng Ruby (Sinatra API tham khảo)
Nếu bạn mong muốn vận hành ứng dụng thông qua cụm máy chủ **Ruby** chuyên biệt:

1. Di chuyển vào thư mục backend:
   ```bash
   cd backend
   ```
2. Cài đặt các thư viện cần thiết:
   ```bash
   gem install sinatra json net-http
   ```
3. Chạy ứng dụng Sinatra:
   ```bash
   ruby app.rb
   ```
Máy chủ backend Ruby của bạn sẽ tự động khởi động tại địa chỉ `http://localhost:4567`. Bạn có thể tinh chỉnh API fetch của frontend sang cổng `4567` hoặc `8000` này trong mã nguồn khi triển khai.

---

## 💡 Cách trải nghiệm & Test tính năng AI Agent

1. **Cách chuyển chế độ AI:** Chuyển qua tab **Cấu hình hệ thống (Settings)** trên thanh điều hướng bên trái. Bạn có thể chọn giữa **Gemini API** (mặc định mượt mà ngoài khâu đăng ký) hoặc **Ollama cục bộ của bạn** (truy xuất nhanh qua endpoint đã chỉ định).
2. **Kiểm thử AI Phân Tích CRM:** Ở tab **Khách hàng CRM**, hãy nhấn nút **"Phân tích AI"** tại một khách hàng bất kỳ. AI Agent sẽ đọc dữ liệu nhu cầu thực tế của khách, tóm gọn các bước tiếp cận thông thái và bổ sung điểm tiềm năng cho chuyên viên.
3. **Thử nghiệm AI Tạo Tin Tức:** Tại tab **Giỏ hàng Bất động sản**, bấm chọn **"Sinh Content Marketing"** trên một tấm card. Bạn có thể điều chỉnh tone giọng và thưởng thức bài viết kịch bản 4 kênh khác biệt cùng Prompt sinh ảnh siêu thực.
4. **Hỏi đáp AI Chatbot:** Ở mục **Chatbot AI**, hãy gõ các câu lệnh bằng tiếng Việt như: *"Khách nào đang nóng nhất?"*, *"Viết bài bán lô đất Hòa Xuân 4.6 tỷ"* để AI Agent lục lọi database thời gian thực và đàm thoại đắc lực.

---

## Local Database

D? �n hi?n d�ng SQLite local t?i `data/cms.sqlite` d? luu d? li?u CMS th?t trong qu� tr�nh ch?y local/dev.

C�c nh�m d? li?u ch�nh:
- `cms_records`: gi? h�ng b?t d?ng s?n, kh�ch h�ng, b�i post, inbox, automation.
- `chat_history`: l?ch s? chat v?i AI assistant/chatbox.
- `generated_contents`: content AI d� sinh raw, content verified d�ng l�m d? li?u training/d�nh gi�.
- `companies`, `users`, `settings`: company/team, ph�n quy?n, c?u h�nh h? th?ng.

Seed database:
```bash
npm run seed
```

K�nh uu ti�n hi?n t?i:
- Facebook
- Zalo

C�c k�nh TikTok, Website, image/video prompt v?n du?c gi? ? m?c d? li?u d? ph�ng v� c� th? tri?n khai s�u hon sau.
