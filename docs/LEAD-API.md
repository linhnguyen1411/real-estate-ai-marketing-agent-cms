# Lead Collector API

API chuẩn để extension / tool bên ngoài gửi lead BĐS về CRM Estoria.

**Phiên bản API:** `1.0`  
**Kiểm tra nhanh:** `GET /api/leads/health` (không cần token)

---

## Base URL

| Môi trường | URL |
|------------|-----|
| Local | `http://localhost:3000` |
| Production | `https://bdsdanang.site` |

---

## Xác thực

Mọi endpoint (trừ `/api/auth/login` và `/api/leads/health`) cần header:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Đăng nhập

```
POST /api/auth/login
```

**Body:**
```json
{
  "email": "owner@example.com",
  "password": "owner123"
}
```

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "token": "eyJ...",
    "user": { "id": "u-owner", "role": "owner", "email": "owner@example.com" }
  }
}
```

Tài khoản test (sau `npm run seed`):

| Email | Password |
|-------|----------|
| `owner@example.com` | `owner123` |
| `admin@danang.example.com` | `admin123` |

---

## Luồng khuyến nghị (extension / scraper)

```
1. Quét DOM → lấy raw_content sạch (chỉ nội dung bài, có SĐT)
2. POST /api/leads/extract-batch   → preview + enrich (phone, demand, budget...)
3. User review (optional)
4. POST /api/leads/batch-save      → lưu CRM
5. GET  /api/customers             → xác nhận
```

---

## Endpoints chính

### 1. Health check

```
GET /api/leads/health
```

Không cần token. Trả danh sách endpoint.

```json
{
  "status": "success",
  "data": {
    "api": "lead-collector",
    "version": "1.0",
    "endpoints": [ ... ]
  }
}
```

---

### 2. Preview 1 lead

```
POST /api/leads/extract
```

**Body:**
```json
{
  "title": "",
  "url": "https://facebook.com/groups/xxx",
  "raw_content": "Cần Bán lô Hòa Xuân, LH 0905274869, giá 5ty850",
  "selected_text": ""
}
```

**Response 200 — `data`:**
```json
{
  "phone": "0905274869",
  "phones": ["0905274869"],
  "possible_phones": [],
  "raw_phone_matches": ["0905274869"],
  "demand_type": "sell",
  "property_type": "Đất nền",
  "location": "Hòa Xuân, Cẩm Lệ",
  "budget": 5.85,
  "confidence_score": 72,
  "lead_score": 85,
  "ai_summary": "[Semi-auto] Bán · ...",
  "name": "...",
  "raw_content": "...",
  "url": "...",
  "is_duplicate": false,
  "duplicate_reason": null
}
```

**Không lưu CRM** — chỉ parse và trả preview.

---

### 3. Preview nhiều lead

```
POST /api/leads/extract-batch
```

**Body:**
```json
{
  "items": [
    {
      "raw_content": "Cần bán lô A LH 0905274869 giá 5ty850 Hòa Xuân",
      "source_url": "https://facebook.com/groups/bds",
      "source_title": "Facebook Group BDS",
      "block_id": "blk-001"
    },
    {
      "raw_content": "Bán đất B LH 0911796192 Cam Lệ 3 tỷ",
      "source_url": "https://facebook.com/groups/bds",
      "block_id": "blk-002"
    }
  ]
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `items[].raw_content` | ✅ | Text bài đăng đã làm sạch (không gửi body Facebook) |
| `items[].source_url` | | URL trang nguồn |
| `items[].source_title` | | Tiêu đề trang / group |
| `items[].block_id` | | ID block DOM (extension tự đặt) |
| `items[].phone` | | Optional — server vẫn tự extract |

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "count": 2,
    "with_phone": 2,
    "items": [
      {
        "index": 0,
        "block_id": "blk-001",
        "phone": "0905274869",
        "phones": ["0905274869"],
        "demand_type": "sell",
        "property_type": "Đất nền",
        "location": "Hòa Xuân, Cẩm Lệ",
        "budget": 5.85,
        "is_duplicate": false,
        "duplicate_reason": null,
        "raw_content": "...",
        "url": "https://facebook.com/groups/bds"
      }
    ]
  }
}
```

---

### 4. Lưu 1 lead

```
POST /api/leads
```

**Cách A — gửi text thô (server tự extract):**
```json
{
  "source": "extension",
  "raw_content": "Cần bán lô Hòa Xuân LH 0905274869",
  "url": "https://facebook.com/groups/bds"
}
```

**Cách B — gửi preview đã extract:**
```json
{
  "source": "facebook-feed-auto",
  "preview": {
    "phone": "0905274869",
    "raw_content": "...",
    "demand_type": "sell",
    "property_type": "Đất nền",
    "location": "Hòa Xuân, Cẩm Lệ",
    "budget": 5.85,
    "url": "https://facebook.com/groups/bds"
  }
}
```

**Response 200:** object `Customer` vừa tạo.

**Response 409 — trùng:**
```json
{
  "status": "error",
  "message": "Lead trùng số điện thoại trong CRM.",
  "data": { "duplicate": true, "reason": "phone", "customer": { ... } }
}
```

---

### 5. Lưu nhiều lead ⭐

```
POST /api/leads/batch-save
```

**Body (khuyến nghị):**
```json
{
  "source": "facebook-feed-auto",
  "leads": [
    {
      "phone": "0905274869",
      "phones": ["0905274869"],
      "possible_phones": [],
      "raw_content": "Cần bán lô Hòa Xuân LH 0905274869 giá 5ty850",
      "source_url": "https://facebook.com/groups/bds",
      "source_title": "Group BDS ĐN",
      "block_id": "blk-001",
      "demand_type": "sell",
      "property_type": "Đất nền",
      "location": "Hòa Xuân, Cẩm Lệ",
      "budget": 5.85
    }
  ]
}
```

Chỉ cần `raw_content` + `source_url` cũng được — server re-extract các field còn lại.

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "saved_count": 1,
    "duplicate_count": 0,
    "results": [
      { "saved": true, "block_id": "blk-001", "customer": { "id": "...", "phone": "0905274869", "name": "..." } }
    ]
  }
}
```

---

### 6. Xem lead CRM

```
GET /api/customers
Authorization: Bearer <token>
```

---

## Giá trị `source`

| Value | Ý nghĩa |
|-------|---------|
| `extension` | Quét thủ công / tool chung |
| `facebook-feed-auto` | Auto scroll Facebook feed |
| `manual_import` | Import từ admin UI |

Mặc định nếu không gửi: `extension`.

---

## Endpoints legacy (vẫn hoạt động)

| Endpoint | Thay bằng |
|----------|-----------|
| `POST /api/leads/bulk-save` | `POST /api/leads/batch-save` với `previews[]` |
| `POST /api/leads/bulk-extract` | Tách text dài admin import |
| `POST /api/leads/batch-extract` | Extract + save 1 bước (cũ) |

`batch-save` chấp nhận cả `leads[]` lẫn `previews[]`.

---

## Mã lỗi

| HTTP | Ý nghĩa |
|------|---------|
| 200 | OK |
| 401 | Chưa đăng nhập / token hết hạn |
| 409 | Lead trùng SĐT hoặc URL |
| 500 | Lỗi server |

Format lỗi:
```json
{ "status": "error", "message": "..." }
```

---

## Test nhanh

```bash
# Server phải chạy: npm run dev
npm run test:lead-api
```

Hoặc PowerShell:

```powershell
.\scripts\test-lead-api.ps1
.\scripts\test-lead-api.ps1 -BaseUrl "https://bdsdanang.site"
```

### curl — full flow

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"owner123"}' | jq -r '.data.token')

# 2. Health
curl -s http://localhost:3000/api/leads/health | jq

# 3. Extract batch
curl -s -X POST http://localhost:3000/api/leads/extract-batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"raw_content":"Can ban lo Hoa Xuan LH 0905274869 gia 5ty850","source_url":"https://facebook.com/groups/test"}]}' | jq

# 4. Batch save
curl -s -X POST http://localhost:3000/api/leads/batch-save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source":"extension","leads":[{"raw_content":"Can ban test LH 0905123456 Hoa Xuan","source_url":"https://test.local"}]}' | jq
```

---

## Ghi chú cho extension tự viết

1. **Không gửi `document.body.innerText`** — chỉ gửi nội dung bài đăng quanh SĐT.
2. Server tự extract SĐT Việt Nam (`03x`, `05x`, `07x`, `08x`, `09x`, format `+84`, space, dấu chấm...).
3. Dedup CRM theo **SĐT** — gửi lại cùng SĐT → `409` hoặc `duplicate_count++` trong batch.
4. CORS: server cho phép extension origin; gọi từ browser cần đúng `apiBase` trong manifest `host_permissions`.

---

## Source code

| File | Vai trò |
|------|---------|
| `server/leadCollector/leadRoutes.ts` | Đăng ký route |
| `server/leadCollector/leadApi.ts` | Handler + types |
| `server/leadCollector/leadService.ts` | Extract + save CRM |
| `server/leadCollector/extractLead.ts` | Parse demand/phone/budget |
| `server/lib/extractVietnamPhones.ts` | Regex SĐT VN |
