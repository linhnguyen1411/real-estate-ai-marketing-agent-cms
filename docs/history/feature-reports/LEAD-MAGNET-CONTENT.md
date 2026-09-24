# Lead Magnet Content Architecture

## Mục tiêu

Lead Magnets là **tài liệu phân tích và định hướng đầu tư**, không phải danh sách sản phẩm đang chào bán.

Người dùng mở khóa tài liệu qua lead form — cơ chế giữ nguyên.

---

## Data source

| Source | Mô tả | Trạng thái |
|--------|--------|------------|
| `static-framework` | Khung phân tích tĩnh, không gắn sản phẩm cụ thể | **Hiện tại** |
| `mixed` | Một phần từ DB, một phần khung tĩnh | Tương lai |
| `database` | Lấy từ PostgreSQL (`properties`, `projects`, `market_reports`) | Tương lai |

Label hiển thị cuối tài liệu (unlocked):

> Tài liệu tổng hợp từ khung phân tích thị trường và các nhóm tài sản đang được theo dõi.

Disclaimer (mọi loại tài liệu):

> Tài liệu này là khung tham khảo phục vụ nghiên cứu thị trường, không phải bảng chào bán sản phẩm cụ thể, không phải cam kết lợi nhuận. Nhà đầu tư cần kiểm tra pháp lý, quy hoạch, giá giao dịch thực tế và khả năng khai thác trước khi ra quyết định.

---

## Cấu trúc file

```
src/leadGen/leadMagnets.ts          # Metadata thẻ tài liệu (title, CTA, slug)
src/leadGen/leadMagnetFramework.ts  # Nội dung khung tĩnh (20 nhóm, báo cáo, bản đồ)
src/types/leadMagnetContent.ts      # Types + source label + disclaimer + formatOpportunityGroupLabel()
server/services/leadMagnetContentService.ts  # getLeadMagnetContent(slug)
```

React **không** embed nội dung chi tiết — fetch qua API sau khi unlock.

---

## API

### Public (cần token)

`GET /api/public/lead-magnets/:slug/content?token=...`

Trả về `content` với `source`, `sourceLabel` và payload theo loại:

- `report` — sections báo cáo thị trường
- `opportunity-framework` — 20 nhóm cơ hội (không có giá/mã căn/đánh giá A-B-C)
- `map` — zones bản đồ tư duy

### Admin

`GET /api/lead-magnet-content`

Danh sách metadata: slug, title, contentType, source, itemCount.

Tab admin: **Lead Magnet Content**

---

## 20 nhóm cơ hội (`top-20-co-hoi-dau-tu`)

Slug giữ nguyên (SEO URL không đổi).

Tiêu đề:

**20 NHÓM CƠ HỘI ĐẦU TƯ NÊN THEO DÕI TẠI NAM ĐÀ NẴNG**

UI hiển thị **"Nhóm 01" … "Nhóm 20"** — không dùng `#1`, `Rank` hay `Top 20` khi `source = static-framework`.

Trọng tâm nội dung: **Nam Đà Nẵng** (FPT City, Mai Đăng Chơn, Hòa Quý, Nam Hòa Xuân, Non Nước, Cocobay, Điện Ngọc, ven biển phía Nam).

Mỗi nhóm gồm:

- Tên nhóm
- Khu vực
- Loại tài sản
- Vì sao đáng theo dõi
- Rủi ro cần lưu ý
- Phù hợp ngân sách nào

**Không hiển thị** khi `source = static-framework`:

- Giá cụ thể sản phẩm
- Mã căn / tên sản phẩm giả
- Đánh giá A/B/C
- Biên lợi nhuận dự kiến
- Nhãn xếp hạng kiểu bảng chào bán (`Top`, `#rank`)

---

## Báo cáo thị trường (`bao-cao-nam-da-nang-2026`)

6 section, 4 loại cấu trúc:

| Kind | Nội dung |
|------|----------|
| `market-insight` | Bối cảnh khu vực: summary, keyDrivers, watchPoints, investorFit, risks |
| `budget-framework` | Khung ngân sách theo tầng vốn |
| `remote-ops-risk` | Rủi ro vận hành từ xa |
| `pre-purchase-checklist` | Checklist 90 ngày |

3 section `market-insight` đầu: FPT City & Làng Đại học, Mai Đăng Chơn, ven biển Nam.

---

## Tương lai: database source

1. Thêm resolver trong `leadMagnetContentService.ts`:

```ts
if (source === 'database') {
  // query properties / projects / market_reports
}
```

2. Đặt `source: 'mixed' | 'database'` khi có dữ liệu thật từ giỏ hàng BĐS.

3. Chỉ hiển thị giá/sản phẩm cụ thể và nhãn xếp hạng thật khi `source !== 'static-framework'`.

---

## Không thay đổi

- Routes `/tai-lieu-dau-tu/*`
- Sitemap
- CRM / investor leads schema
- Social Inbox
- Cơ chế form unlock + token

---

## Kiểm tra

1. Mở `/tai-lieu-dau-tu` — thấy 3 thẻ tài liệu, copy không gọi là "sản phẩm chào bán"
2. Unlock `top-20-co-hoi-dau-tu` — thấy **Nhóm 01–20**, không `#1` / `Top 20`
3. Unlock `bao-cao-nam-da-nang-2026` — 3 market-insight + ngân sách + rủi ro vận hành + checklist
4. Cuối tài liệu có **Nguồn dữ liệu** và **disclaimer**
5. Admin → Lead Magnet Content → Source = `static-framework`
6. Chạy `npm run audit:lead-magnets` — phải **PASS** (similarity ≤ 25%)

Xem chi tiết audit: [LEAD-MAGNET-CONTENT-AUDIT.md](./LEAD-MAGNET-CONTENT-AUDIT.md)
