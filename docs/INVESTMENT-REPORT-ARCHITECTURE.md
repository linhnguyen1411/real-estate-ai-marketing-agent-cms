# Investment Report Architecture — Phase 27

## Định vị

URL giữ nguyên:

```
/tai-lieu-dau-tu/bao-cao-thi-truong-nam-da-nang-2026
```

Slug API: `bao-cao-nam-da-nang-2026`

Đây là **Báo cáo đầu tư (Investment Report)** — không phải blog, không phải lead magnet dạng checklist, không phải review sản phẩm.

Lead form, CTA và SEO metadata (`leadMagnets.ts`, `SeoHead`) **không đổi**.

---

## Cấu trúc nội dung (5 chương)

| Chương | Tiêu đề | Block types |
|--------|---------|-------------|
| 1 | Thị trường Nam Đà Nẵng đang dịch chuyển đi đâu? | `prose`, `zone-focus` |
| 2 | Căn hộ Sun Group | `prose`, `product-segment` |
| 3 | Đất nền và nhà phố Nam Đà Nẵng | `prose`, `zone-focus` |
| 4 | Những yếu tố nhà đầu tư nên theo dõi | `factor` |
| 5 | Những việc phải kiểm tra trước khi đặt cọc | `prose`, `due-diligence` |

Nội dung: `src/leadGen/investmentReport2026.ts`

---

## Data model

```typescript
// src/types/leadMagnetContent.ts
type: 'investment-report'
edition: string
publisher: string
chapters: InvestmentReportChapter[]
source: 'static-framework'
sourceLabel: string
```

Legacy `type: 'report'` + `sections[]` vẫn tồn tại cho tương thích normalize — slug báo cáo 2026 chỉ dùng `investment-report`.

---

## Luồng hiển thị

```
LeadMagnetDetailPage
  └── LeadMagnetGate (form unlock — không đổi)
        └── fetchLeadMagnetContent(slug, token)
              └── GET /api/public/lead-magnets/:slug/content
                    └── leadMagnetContentService.getLeadMagnetContent()
                          └── INVESTMENT_REPORT_2026
        └── InvestmentReportView (UI báo cáo)
```

---

## UI (`InvestmentReportView.tsx`)

- Header: Investment Report, publisher, edition
- Mục lục (desktop)
- Chương đánh số 01–05, typography báo cáo
- `product-segment`: bảng phân tích (khách mua/thuê, thanh khoản, ưu/hạn chế, chiến lược)
- `due-diligence`: hướng dẫn chuyên gia — **không** checkbox checklist
- Footer: `sourceLabel` + `LEAD_MAGNET_DISCLAIMER` (giữ nguyên)

Layout trang: `max-w-5xl` cho slug báo cáo (rộng hơn tài liệu khác).

---

## Văn phong & cấm từ

Nội dung Phase 27 **không** dùng:

- Checklist 90 ngày
- Cần kiểm chứng thực tế
- Nhà đầu tư nên cân nhắc
- Động lực tăng trưởng / Bức tranh / Trong bối cảnh (trong body báo cáo)

---

## Source hiện tại

`static-framework` — nội dung trong file TypeScript, chưa query `properties` / `projects`.

Tương lai: `database` resolver trong `leadMagnetContentService.ts` khi có dữ liệu thật.

---

## Files

| File | Vai trò |
|------|---------|
| `src/leadGen/investmentReport2026.ts` | Nội dung 5 chương |
| `src/components/leadGen/InvestmentReportView.tsx` | Render báo cáo |
| `src/components/leadGen/LeadMagnetGate.tsx` | Route `investment-report` |
| `server/services/leadMagnetContentService.ts` | API content |
| `src/leadGen/leadMagnetContentAudit.ts` | Audit similarity |

---

## Kiểm tra

```bash
npm run audit:lead-magnets
npm run build
```

Mở `/tai-lieu-dau-tu/bao-cao-thi-truong-nam-da-nang-2026` → unlock → thấy 5 chương, không còn checklist 90 ngày.
