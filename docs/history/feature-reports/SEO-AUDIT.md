# SEO Audit & Refactor — BDSDanang.site

**Ngày audit:** 2026-01  
**Phạm vi:** Toàn bộ codebase `real-estate-ai-marketing-agent-cms`

---

## Phase 1 — Hiện trạng (trước refactor)

| Hạng mục | Trạng thái cũ | Mức độ |
|----------|---------------|--------|
| URL structure | Chỉ `/` + `/:propertySlug` | 🔴 Yếu |
| Sitemap | 1 file, không `lastmod` | 🟡 Trung bình |
| robots.txt | Cơ bản | 🟢 OK |
| Meta SSR | Có cho home + property | 🟡 Trung bình |
| JSON-LD SSR | Không có trong HTML ban đầu | 🔴 Yếu |
| Breadcrumb | Không | 🔴 Yếu |
| Legal pages | Không | 🔴 Google Ads risk |
| About / Contact | Chỉ section `#contact` | 🔴 Yếu |
| Content hub / Blog public | Không | 🔴 Yếu |
| Landing SEO | Không | 🔴 Yếu |
| E-E-A-T Author | Không | 🔴 Yếu |
| Internal links | Chủ yếu anchor `#` | 🟡 Trung bình |
| Image optimization | Lazy load, JPEG CMS | 🟡 Trung bình |
| Duplicate content | `ListingsPageNew` dead code | 🟡 |
| CTA funnel | "Liên hệ ngay" | 🟡 |

### Điểm mạnh đã có
- Slug property chuẩn `/{title}-{id}`
- SSR meta qua `server.ts` → `renderIndexWithMeta()`
- Dynamic sitemap + robots
- GTM + GA4
- AI SEO keywords trên property

---

## Phase 2–15 — Đã triển khai

### Kiến trúc mới (`src/seo/`)
- `siteConfig.ts` — brand, contact, author, CTA
- `routes.ts` — nav, reserved slugs
- `pageMeta.ts` — meta tĩnh cho mọi URL
- `schemas.ts` — JSON-LD builders
- `sitemap.ts` — multi-sitemap
- `landingPages.ts` — 7 landing nội dung
- `contentHub.ts` — categories + projects

### Routes mới (`src/main.tsx`)
```
/bat-dong-san, /can-ho, /dat-nen, /nha-pho, /nam-da-nang
/du-an, /du-an/:projectSlug
/kien-thuc-dau-tu, /tin-thi-truong, /phan-tich, /review-khu-vuc
/gioi-thieu, /lien-he
/chinh-sach-bao-mat, /dieu-khoan-su-dung, /chinh-sach-cookie, /mien-tru-trach-nhiem
/tac-gia/nguyen-phan-hoang-linh
/dau-tu-da-nang, /dau-tu-nam-da-nang, /dau-tu-fpt-city, ...
/:propertySlug (giữ backward compat)
```

### Components
- `SeoHead`, `Breadcrumbs`, `PublicSiteLayout`
- `LeadCaptureForm` — CTA: **Nhận danh sách cơ hội đầu tư Đà Nẵng**
- `FaqSection`

### Server (`server.ts`)
- JSON-LD trong HTML SSR
- Meta động cho static pages + property
- `sitemap.xml` (index) + `sitemap-pages|properties|projects|posts.xml`
- `robots.txt` liệt kê đủ sitemap
- BreadcrumbList + Product/Place/Residence schema cho listing

### Google Ads readiness
- About, Contact, Privacy, Terms, Cookie, Disclaimer
- Thông tin liên hệ đầy đủ (tên, hotline, email, Facebook)
- Google Map embed trên `/lien-he`

---

## Còn lại (roadmap)

| Phase | Việc còn lại | Ưu tiên |
|-------|--------------|---------|
| 7 CWV | Compression middleware, AVIF pipeline, `srcset` | Cao |
| 8 CMS | Public blog routes + admin publish | Cao |
| 9 Landing | Mở rộng nội dung mỗi page ≥1500 từ | Trung bình |
| 10 Listing | Breadcrumb UI trên modal, related properties | Trung bình |
| 11 Blog | TOC, reading time, related posts engine | Trung bình |
| 13 Conversion | Exit-intent popup, lead magnet PDF | Thấp |
| 14 CRM | Remarketing tags, funnel tracking GTM | Trung bình |

---

## File đã tạo / sửa chính

**Mới:** `src/seo/*`, `src/pages/*`, `src/components/seo/*`, `src/components/layout/PublicSiteLayout.tsx`, `src/components/LeadCaptureForm.tsx`, `src/components/FaqSection.tsx`

**Sửa:** `src/main.tsx`, `server.ts`, `src/ListingsPage.tsx` (footer)

---

## Kiểm tra nhanh

```bash
npm run dev
# http://localhost:3000/sitemap.xml
# http://localhost:3000/gioi-thieu
# http://localhost:3000/dau-tu-da-nang
# http://localhost:3000/lien-he
curl -s http://localhost:3000/robots.txt
```

View source trên property URL — phải thấy `<script type="application/ld+json">` trong `<head>`.
