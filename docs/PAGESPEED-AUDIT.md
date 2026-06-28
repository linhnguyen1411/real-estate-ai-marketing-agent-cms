# PageSpeed Audit — bdsdanang.site (Phase 29)

**Date:** 2026-06-12  
**Target:** Mobile Lighthouse Performance ≥ 85 · LCP &lt; 2.5s · CLS &lt; 0.1

---

## Executive summary

The main bottleneck was a **827 KB homepage JS bundle** caused by eagerly importing the full **Admin CMS** (`App.tsx`, ~4,600 lines) on every public page load. After Phase 29 optimizations, the public entry chunk dropped to **~118 KB** (gzip ~33 KB), with admin code isolated in a separate lazy-loaded chunk.

---

## Before (baseline build)

| Asset | Size (raw) | Size (gzip) |
|-------|------------|-------------|
| `index-*.js` (homepage + admin) | **827 KB** | **230 KB** |
| `index-*.css` | 104 KB | 16 KB |
| Route chunks | 2–22 KB each | Already lazy |

### Root causes identified

1. **Eager `App.tsx` import** in `main.tsx` — admin, CRM, AI chat, charts bundled into homepage.
2. **Render-blocking analytics** — GTM + gtag loaded synchronously in `<head>`.
3. **Hero LCP** — external Unsplash URL at `w=2200`, no preload, no local cache.
4. **Property API payload** — base64 `gallery_images` embedded in `/api/public/properties` JSON.
5. **Property cards** — full-size image URLs in list view; no `width`/`height` on several images.
6. **AI chat widget** — open by default on homepage (`chatOpen: true`).
7. **No compression** — Express served responses without `compression` middleware.
8. **No cache headers** — hashed `/assets/*` and `index.html` had no `Cache-Control`.
9. **No bundle analyzer** — no `npm run analyze` script.

---

## After (Phase 29 build)

| Asset | Size (raw) | Size (gzip) | Notes |
|-------|------------|-------------|-------|
| `index-*.js` (public shell) | **120 KB** | **33 KB** | ListingsPage + public routes only |
| `admin-app-*.js` | 271 KB | 64 KB | Lazy — loads only on `/admin/*` |
| `vendor-react-*.js` | 220 KB | 70 KB | Shared React/router |
| `vendor-*.js` | 184 KB | 57 KB | Other vendors |
| `vendor-icons-*.js` | 32 KB | 7 KB | lucide-react split |
| `index-*.css` | 104 KB | 16 KB | Tailwind purge OK |

**Homepage initial JS (no admin):** ~556 KB raw across 4 parallel chunks vs **827 KB single blocking chunk** before.

---

## Changes implemented

### 1. Static asset cache (`server/middleware/staticAssets.ts`)

- `/assets/*.{js,css}` with content hash → `Cache-Control: public, max-age=31536000, immutable`
- `index.html` and SPA fallbacks → `Cache-Control: no-cache`
- Images in `public/` and `dist/` → `Cache-Control: public, max-age=2592000` (30 days)

### 2. Compression

- `compression` middleware enabled on Express (`level: 6`).

### 3. Image optimization

- Hero: local `/hero-da-nang.jpg` (1600px, ~326 KB) replaces Unsplash `w=2200`.
- `index.html`: `<link rel="preload" as="image" href="/hero-da-nang.jpg" fetchpriority="high">`.
- Hero `<img>`: `width`/`height`, `loading="eager"`, `fetchPriority="high"`.
- Property cards: `getPropertyThumbnailUrl()` → `/property-images/{id}/{n}.jpg` instead of base64.
- API strips embedded base64 from public property list (`stripPropertyImagesForApi`).
- Card images: `width`/`height`, lazy load; first featured card `fetchPriority="high"`.

### 4. Route code splitting

- `App.tsx` → `React.lazy()` via `AdminRoute` wrapper (all `/admin/*` routes).
- `MultiStepInvestorForm` lazy-loaded on homepage contact section.
- `vite.config.ts` `manualChunks`: `admin-app`, `vendor-react`, `vendor-icons`, `vendor-markdown`, `vendor-ai`.

### 5. Third-party scripts

- GTM + GA4 deferred: load on first user interaction (`scroll`/`click`/`touchstart`/`keydown`) or after 4s `load` timeout.
- Removed blocking `<script async src="gtag/js">` from `<head>`.

### 6. CLS fixes

- Hero, property cards, modal gallery, category listings: explicit `width`/`height`.
- Hero section retains `min-height` in CSS (560px mobile / 680px desktop).

### 7. LCP fixes

- Local hero image + preload.
- Chat widget closed by default (reduces main-thread work on first paint).
- Smaller public API responses (no base64 in property list).

### 8. API performance

- `GET /api/public/properties` — server-side cache 120s; strips base64 images.
- `GET /api/public/homepage` — aggregated properties + latest posts + lead magnets; cache 180s.

### 9. Build analyzer

```bash
npm run analyze    # builds with rollup visualizer → dist/stats.html
npm run check:assets  # validates bundle sizes + hero asset
```

---

## Lazy-loaded routes (unchanged, verified)

Blog, lead magnets, investor dashboard, landing pages, project pages, legal pages — all `React.lazy` in `main.tsx`.

---

## Remaining opportunities (not in scope)

| Item | Impact | Notes |
|------|--------|-------|
| WebP/AVIF hero | Medium | JPG fallback in place; convert with `cwebp` on deploy |
| Nginx Brotli | Medium | Express gzip enabled; VPS Nginx can add `brotli` for static |
| `MultiStepInvestorForm` in `LeadGenProvider` | Low | Still statically imported there — minor duplicate |
| Property modal fetch | Low | Full `rich_description` still in list API |
| Mobile shadow/blur audit | Low | `backdrop-blur` on modal only (user-triggered) |

---

## Test checklist

```bash
npm run build
npm run check:assets
npm run start
```

| Route | Check |
|-------|-------|
| `/` | Hero loads, listings OK, chat closed by default |
| `/tin-tuc` | Blog list loads |
| `/tin-tuc/review-hoa-xuan-uu-diem-rui-ro-thanh-khoan` | Post detail + meta |
| `/tai-lieu-dau-tu` | Lead magnet hub |
| `/du-an/sun-symphony` | Project page |
| `/admin/dashboard` | Admin lazy chunk loads, no console errors |

Verify headers in production:

```bash
curl -sI https://bdsdanang.site/assets/index-*.js | grep -i cache-control
# expect: public, max-age=31536000, immutable

curl -sI https://bdsdanang.site/ | grep -i cache-control
# expect: no-cache
```

---

## Expected Lighthouse impact

| Metric | Before (est.) | After (est.) |
|--------|---------------|--------------|
| Performance | 55–70 | **80–90** |
| LCP | 3.5–5s (Unsplash + blocking JS) | **1.8–2.5s** |
| CLS | 0.05–0.15 | **&lt; 0.1** |
| TBT | High (827 KB parse) | **Reduced ~70%** |

Run [PageSpeed Insights](https://pagespeed.web.dev/) on production after deploy for confirmed scores.

---

## Files changed

- `src/main.tsx` — lazy admin
- `src/ListingsPage.tsx` — hero, images, chat, lazy form
- `src/utils/propertyImage.ts` — thumbnail URLs + API strip
- `server.ts` — compression, cache, homepage API
- `server/middleware/staticAssets.ts` — cache headers
- `server/cache/publicCache.ts` — in-memory TTL cache
- `server/publicPropertyMapper.ts` — public property mapper
- `vite.config.ts` — manualChunks + visualizer
- `index.html` — preload hero, defer analytics
- `public/hero-da-nang.jpg` — local hero asset
- `scripts/check-assets.mjs` — CI asset guard
- `package.json` — `analyze`, `check:assets` scripts
