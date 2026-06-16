# Estoria Lead Collector v3.1

Extension thu lead Facebook → CRM.

**API docs:** [`../docs/LEAD-API.md`](../docs/LEAD-API.md)

## Cài nhanh

```bash
npm run build:extension
```

1. Chrome → `chrome://extensions` → **Reload**
2. **F5 tab Facebook** (bắt buộc sau mỗi lần reload extension)
3. Console Facebook phải thấy: `[Estoria] v3.1.0 loaded`

## Dùng

1. Popup → đăng nhập CRM (`owner@example.com` / `owner123`)
2. Mở **Facebook Group** BĐS, scroll tới feed bài đăng
3. **Quét block hiện tại** → Review Leads
4. **Save All** → CRM
5. Hoặc **Auto Scroll** → target 30 → Save

## Kiến trúc v3.1

```
Content script     → quét DOM post block (không gọi API)
Background worker  → gọi /api/leads/extract-batch + batch-save
Popup              → UI + điều khiển
```

## Server phải chạy

```bash
npm run dev
npm run test:lead-api   # verify API
```
