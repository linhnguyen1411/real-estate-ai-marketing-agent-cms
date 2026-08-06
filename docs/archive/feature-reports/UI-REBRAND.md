# Phase 19 — UI Rebrand: Investment Light Theme

## Mục tiêu

Chuyển public site từ cảm giác **website đăng tin / dark / tech** sang **trung tâm thông tin & đầu tư Nam Đà Nẵng** — tham khảo báo cáo đầu tư, quỹ/quản lý tài sản, consulting firm.

**Không đổi:** logo (icon Estoria), routes hiện có, chức năng, database.  
**Admin CMS:** giữ dark mode (`App.tsx`).

---

## Design system (`src/index.css`)

### Màu (Tailwind v4 `@theme`)

| Token | Hex | Dùng cho |
|-------|-----|----------|
| `invest-blue` | `#0F3D5E` | Primary, heading accent, footer |
| `invest-blue-light` | `#1A5A85` | Hover links |
| `invest-blue-muted` | `#E8F0F6` | Nền nhẹ, selected state |
| `invest-gold` | `#D4A017` | Label section, accent phụ |
| `invest-gold-muted` | `#FBF5E6` | Badge, highlight |
| `invest-cta` | `#E67E22` | CTA chính (cam) |
| `invest-cta-hover` | `#CF6D17` | Hover CTA |
| `section-alt` | `#F8FAFC` | Section xen kẽ |
| `invest-border` | `#E5E7EB` | Viền card/input |
| `invest-text` | `#111827` | Chữ chính |
| `invest-muted` | `#6B7280` | Chữ phụ |
| `invest-success` | `#10B981` | Thành công form |
| `invest-danger` | `#EF4444` | Lỗi form |

### Utility classes

- `.public-shell` — nền trắng toàn trang public
- `.public-header` — sticky header trắng, shadow nhẹ
- `.hero-investment` / `.hero-investment__overlay` — hero ảnh Đà Nẵng, overlay sáng
- `.heading-hero`, `.heading-page`, `.heading-section` — typography responsive
- `.text-body`, `.text-body-lg` — paragraph 16–18px, line-height 1.7+
- `.btn-cta`, `.btn-primary`, `.btn-outline` — nút hành động
- `.invest-card`, `.property-card` — card trắng, shadow nhẹ, hover scale nhẹ
- `.section-alt` — nền `#F8FAFC`
- `.article-prose` — nội dung blog max ~800px, line-height báo cáo
- `.label-section` — label vàng uppercase

---

## Navigation (`src/seo/routes.ts`)

Menu public mới:

1. Trang chủ `/`
2. Bất động sản `/bat-dong-san`
3. Dự án `/du-an`
4. Kiến thức đầu tư (dropdown)
5. Dữ liệu thị trường `/nha-dau-tu` **(mới)**
6. Tài liệu đầu tư `/tai-lieu-dau-tu`
7. Liên hệ `/lien-he`

CTA header: **Nhận danh sách đầu tư** (cam).

Các route cũ (`/can-ho`, `/nam-da-nang`, `/gioi-thieu`…) vẫn hoạt động, chỉ không còn trên menu chính.

---

## Trang mới

### `/nha-dau-tu` — Investor Dashboard

`src/pages/InvestorDashboardPage.tsx`

Research dashboard công khai: top cơ hội, khu vực, dự án, bài phân tích, link tài liệu.

### Trust signals (homepage)

`src/components/layout/TrustSignalsSection.tsx`

- “Tại sao nhà đầu tư chọn Nam Đà Nẵng?”
- Link dữ liệu / phân tích / tài liệu / case study
- Profile tác giả **Linh Nguyễn**

---

## Thay đổi theo khu vực

### Homepage (`ListingsPage.tsx`)

- Header trắng đồng bộ `PublicSiteLayout`
- Hero sáng: headline spec, CTA “Nhận báo cáo thị trường” + “Xem cơ hội đầu tư”
- Property card: `.property-card`, giá `invest-blue`, không glassmorphism
- Section contact: nền sáng thay `bg-slate-950`
- Footer: `invest-blue` thay đen tuyền
- Thêm `TrustSignalsSection`

### Layout chung

- `PublicSiteLayout.tsx` — shell sáng, footer xanh đầu tư
- `PublicNav.tsx` — chỉ light theme, dropdown fix z-index

### Landing SEO (`LandingPageView.tsx`)

- Hero band sáng thay `bg-slate-950`
- Typography `text-body-lg`, card `invest-card`

### Blog

- `BlogListPage.tsx`, `BlogPostPage.tsx` — spinner/link/card invest theme
- `BlogPostPage` — TOC sticky trái, nội dung `article-prose`, FAQ + CTA cuối bài
- `BlogArticleBody.tsx` — link `invest-blue`

### Form lead

- `LeadCaptureForm.tsx`, `MultiStepInvestorForm.tsx` — CTA cam, progress `invest-blue`, nút tiếp `btn-primary`

### Khác

- `SocialProof.tsx` — case study card sáng
- `FaqSection.tsx`, `Breadcrumbs.tsx`
- `CategoryListingsPage.tsx`, `ContentHubPage.tsx`
- `AboutPage.tsx`, `ContactPage.tsx`, `AuthorPage.tsx`
- `index.html` — `theme-color: #0F3D5E`

---

## Files đã sửa / thêm

| File | Thay đổi |
|------|----------|
| `src/index.css` | Design system Phase 19 |
| `index.html` | theme-color |
| `src/seo/routes.ts` | MAIN_NAV |
| `src/seo/siteConfig.ts` | RESERVED_SLUGS + `nha-dau-tu` |
| `src/main.tsx` | Route `/nha-dau-tu`, loader spinner |
| `src/components/layout/PublicSiteLayout.tsx` | Light shell + footer |
| `src/components/layout/PublicNav.tsx` | Investment nav |
| `src/components/layout/TrustSignalsSection.tsx` | **Mới** |
| `src/pages/InvestorDashboardPage.tsx` | **Mới** |
| `src/ListingsPage.tsx` | Hero, header, cards, contact, trust |
| `src/pages/LandingPageView.tsx` | Light landing |
| `src/pages/BlogListPage.tsx` | Theme |
| `src/pages/BlogPostPage.tsx` | Report layout |
| `src/pages/CategoryListingsPage.tsx` | Theme |
| `src/pages/ContentHubPage.tsx` | Theme |
| `src/pages/AboutPage.tsx` | Link colors |
| `src/pages/ContactPage.tsx` | Link colors |
| `src/pages/AuthorPage.tsx` | Avatar + links |
| `src/components/LeadCaptureForm.tsx` | CTA + inputs |
| `src/components/leadGen/MultiStepInvestorForm.tsx` | Steps + CTA |
| `src/components/leadGen/SocialProof.tsx` | Case study cards |
| `src/components/FaqSection.tsx` | Card style |
| `src/components/seo/Breadcrumbs.tsx` | Link color |
| `src/components/blog/BlogArticleBody.tsx` | Link color |
| `docs/UI-REBRAND.md` | Tài liệu này |

**Không sửa:** `src/App.tsx` (admin dark), `ListingsPageNew.tsx` (dead code).

---

## Kiểm tra thủ công

1. `/` — hero sáng, menu, trust section, form contact
2. `/nha-dau-tu` — dashboard cards
3. `/tin-tuc/:slug` — đọc bài, TOC, CTA cuối
4. Landing `/dau-tu-da-nang` — nền trắng
5. Mobile — menu, floating buttons, không tràn form
6. `/admin/dashboard` — vẫn dark

## Ghi chú triển khai

- Chỉ Tailwind + CSS variables, không thêm UI library
- Logo icon giữ `bg-rose-600` theo yêu cầu không đổi logo
- Sau deploy: hard refresh / xóa cache CDN nếu còn theme cũ
