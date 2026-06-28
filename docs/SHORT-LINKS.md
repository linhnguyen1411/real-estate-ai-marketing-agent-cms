# Short Links — bdsdanang.site

Hệ thống short link nội bộ dùng để share BĐS, bài viết, landing và lead magnet với tracking click + nguồn lead.

## URL format

```
https://bdsdanang.site/s/{slug}
```

Ví dụ: `/s/mdc650`, `/s/slight`, `/s/review-hoaxuan`

## Luồng redirect

1. User mở `GET /s/:slug`
2. Server tìm `short_links` (active, chưa hết hạn)
3. Ghi `short_link_clicks` (IP hash, UA, device, referrer)
4. Redirect `302` tới `targetUrl` kèm:
   - `?sl={slug}`
   - UTM từ cấu hình link (nếu có)

## Database (Prisma)

### `short_links`

| Field | Mô tả |
|-------|--------|
| slug | Mã ngắn unique |
| targetUrl | URL đích |
| entityType | `property`, `blog_post`, `landing`, `lead_magnet`, `custom` |
| entityId | ID/slug entity gắn kèm |
| utmSource/Medium/Campaign | UTM mặc định khi redirect |
| isActive | Bật/tắt link |
| expiresAt | Hết hạn (optional) |

### `short_link_clicks`

Lưu click event — **không lưu IP raw**, chỉ `ipHash` (SHA-256 rút gọn).

### `leads.short_link_slug`

Lead submit sau khi vào từ short link sẽ có `shortLinkSlug` + tag `short:{slug}`.

## API

### Public

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/s/:slug` | Redirect + track click |
| GET | `/api/public/short-links/resolve?entityType=&entityId=` | Tạo/lấy short link cho entity |

### Admin (JWT)

| Method | Path |
|--------|------|
| GET | `/api/admin/short-links` |
| POST | `/api/admin/short-links` |
| PATCH | `/api/admin/short-links/:id` |
| DELETE | `/api/admin/short-links/:id` |
| GET | `/api/admin/short-links/:id/analytics` |

## Auto short link

- **Property**: tự tạo khi mở modal "Chia sẻ tin này" (`entityType=property`, `entityId=property.id`)
- **Blog**: `entityType=blog_post`, `entityId=post.slug`
- Slug gợi ý từ title/project (vd. Mai Đăng Chơn → `mdc650`), trùng thì `mdc650-2`

## Frontend UX (Property detail)

Sidebar chỉ 4 hành động visible:

1. Gọi hotline (Mr Linh / Ms Hằng)
2. Nhắn Zalo
3. Đăng ký nhận bảng hàng
4. Chia sẻ tin này → modal (link ngắn, copy, FB, Zalo, TikTok, QR)

Mobile: sticky bar 4 nút (Gọi / Zalo / Bảng hàng / Share).

## Tracking events (GA4 + DB)

- `short_link_click` — server-side khi redirect
- `property_share_open`, `property_share_copy`, `property_share_facebook`, `property_share_zalo`, `property_share_tiktok`
- `qr_view`, `qr_download`

## Lead attribution

1. Redirect thêm `?sl={slug}`
2. Client `captureShortLinkFromUrl()` → `sessionStorage`
3. `submitInvestorLead()` gửi `short_link_slug` lên `/api/public/leads`

## Admin UI

Menu CMS → **Short Links**: danh sách, tạo/sửa, copy, QR, analytics click/referrer/device.

## Files chính

- `prisma/schema.prisma` — models
- `server/shortLink/` — DB, routes, slug utils
- `src/components/PropertyShareModal.tsx` — share UX
- `src/components/admin/ShortLinksPanel.tsx` — admin
- `src/utils/shortLinkAttribution.ts` — client attribution
- `src/services/shortLinksApi.ts` — API client
