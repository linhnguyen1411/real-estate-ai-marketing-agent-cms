# Internal Link Audit (Phase 22.1)

## Scope

- Dataset audited: `server/seed/allPosts.ts` (30 SEO posts).
- URL policy: **kept unchanged** (no slug/route edits).
- Objective: complete topic clusters + reduce brand bias text overload.

## Headline Metrics

- Total posts audited: **30**
- Total internal links in article bodies: **270**
- Average links per post: **9.0**
- Orphan posts: **0**
- Pillar-page coverage: **30/30**
- Lead-magnet coverage (`/tai-lieu-dau-tu`): **30/30**

## Cluster Map

- `nha-dau-tu`: 8 posts
- `nam-da-nang`: 5 posts
- `fpt-city`: 6 posts
- `mai-dang-chon`: 5 posts
- `review-khu-vuc`: 6 posts

## Pillar Coverage Rules

Each post now includes:

- 3-5 links to same cluster
- 1 link to cluster pillar page
- 1 link to `/tai-lieu-dau-tu` with varied anchor
- 1 sequential cross-link to guarantee no-orphan graph

Pillar targets:

- `/dau-tu-nam-da-nang`
- `/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang`
- `/du-an/fpt-city`
- `/du-an/mai-dang-chon`
- `/review-khu-vuc`
- `/tai-lieu-dau-tu`

## Top Linked URLs (incoming)

1. `/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang` (60)
2. `/dau-tu-nam-da-nang` (60)
3. `/nha-dau-tu` (30)
4. `/tin-tuc/dau-tu-da-nang-2026-dat-nen-can-ho-hay-dong-tien` (7)
5. `/tin-tuc/nha-dau-tu-ha-noi-mua-bds-da-nang-can-kiem-tra-gi` (7)
6. `/tin-tuc/sai-lam-khi-dau-tu-bat-dong-san-da-nang-tu-xa` (7)
7. `/tin-tuc/nha-dau-tu-ha-noi-nen-mua-gi-o-da-nang-2026` (7)
8. `/tin-tuc/fpt-city-da-nang-co-dang-dau-tu-2026` (5)
9. `/tin-tuc/tiem-nang-cho-thue-quanh-fpt-city` (5)
10. `/tin-tuc/fpt-city-phu-hop-voi-nha-dau-tu-von-bao-nhieu` (5)

## Related Engines Implemented

- **Related posts (end of article)** in `src/pages/BlogPostPage.tsx`
  - Priority: same cluster → same category → shared tags → same project signal.
- **Related projects**
  - FPT City posts → `/du-an/fpt-city`
  - Mai Đăng Chơn posts → `/du-an/mai-dang-chon`
  - Apartment intent posts → `/can-ho`
- **Related areas**
  - Review posts render cross-area links (Điện Ngọc / Hòa Xuân / Non Nước / Làng Đại học set).

## Branding Refinement Applied

Primary UI copy replaced from repetitive “nhà đầu tư Hà Nội” phrasing toward:

- nhà đầu tư
- nhà đầu tư trung và dài hạn
- dữ liệu đầu tư
- cẩm nang đầu tư
- phân tích thị trường
- tài sản phù hợp theo ngân sách

Files touched include:

- `src/ListingsPage.tsx`
- `src/pages/LandingPageView.tsx`
- `src/pages/InvestorDashboardPage.tsx`
- `src/pages/AboutPage.tsx`
- `src/pages/BlogListPage.tsx`
- `src/components/layout/TrustSignalsSection.tsx`
- `src/components/leadGen/LeadGenProvider.tsx`
- `src/components/leadGen/SocialProof.tsx`
- `src/seo/siteConfig.ts`

## Notes

- Existing SEO URL slug containing `ha-noi` is intentionally preserved per requirement.
- Internal link logic source of truth:
  - `src/seo/internalLinkGraph.ts`
  - `server/seed/contentBuilder.ts`
  - `server/seed/allPosts.ts`
