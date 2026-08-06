import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import type { Property } from '../../../src/types';
import { getProperties } from '../../dbHelper';
import { getPageMetaByPath } from '../../../src/seo/pageMeta';
import { buildSitemapEntries, entriesToXml, sitemapIndexXml } from '../../../src/seo/sitemap';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
  buildPropertySchemas,
} from '../../../src/seo/schemas';
import { isReservedSlug } from '../../../src/seo/routes';
import { getBlogPostBySlug, getPublishedBlogPostsForSitemap } from '../../blogDb';
import { resolveBlogShareImage, guessImageMimeType } from '../../../src/seo/shareImage';
import { ogImageDimensions, readImageDimensionsFromBuffer } from '../../seo/ogImageMeta';
import { createDistStaticOptions } from '../../middleware/staticAssets';
import { collectSiteSeoKeywords as buildSiteSeoKeywords, getPropertySeoKeywordsFromContent } from '../../../src/utils/hashtags';
import { DEFAULT_SEO_KEYWORDS } from './seoKeywords';
import { getPropertyPath, getPropertySlug, publicListingsPath } from './propertyPaths';
import { resolveSeo } from '../../../src/seo/engine/resolveSeo';
import { PageType } from '../../../src/seo/types/PageType';
import { SITE } from '../../../src/seo/siteConfig';
import { buildDescription } from '../../../src/seo/utils/buildDescription';
import { resolveMeta } from '../../../src/seo/engine/resolveMeta';

let viteDevServer: import('vite').ViteDevServer | null = null;

/** Historical SSR home defaults — preserved via resolveSeo overrides (not SITE.default*). */
export const DEFAULT_SEO_TITLE = 'BĐS Sun Group Đà Nẵng | Căn Đẹp Giá Gốc 2026';
export const DEFAULT_SEO_DESCRIPTION = 'BĐS Sun Group Đà Nẵng, căn hộ cao cấp, shophouse và đất Nam Đà Nẵng có pháp lý rõ, hình ảnh thật, giá bán cập nhật 2026.';

export function getPublicOrigin(req: Request) {
  const configuredOrigin = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configuredOrigin)) return configuredOrigin;
  return `${req.protocol}://${req.get('host')}`;
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(value: unknown) {
  return escapeXml(String(value || ''));
}

export function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateMeta(value: string, maxLength = 180) {
  const cleanValue = stripHtml(value);
  return cleanValue.length > maxLength
    ? `${cleanValue.slice(0, maxLength - 3).trim()}...`
    : cleanValue;
}

export function limitSeoTitle(value: string) {
  const trimmed = String(value || '').trim();
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57).trim()}...`;
}

export function getServerPropertySeoTitle(property: Property) {
  // Historical helper ignored ai_posts.seo — formula only.
  return resolveMeta({
    pageType: PageType.PROPERTY,
    entity: { title: property.title, type: property.type },
  }).title;
}

export function absoluteUrl(value: string, origin: string) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `${origin.split(':')[0]}:${value}`;
  if (value.startsWith('/')) return `${origin}${value}`;
  return value;
}

export function getPropertyImageValue(property: Property, index = 0) {
  return property.gallery_images?.[index] || property.images || '';
}

export function getPropertyPublicImageUrl(property: Property, origin: string, index = 0) {
  const image = getPropertyImageValue(property, index);
  if (!image) return '';
  if (image.startsWith('data:image/')) return `${origin}/property-images/${encodeURIComponent(property.id)}/${index}.jpg`;
  return absoluteUrl(image, origin);
}

export function getPropertyShareMeta(property: Property, origin: string) {
  const path = getPropertyPath(property);
  const slug = getPropertySlug(property);
  const image = getPropertyPublicImageUrl(property, origin);
  const keywordList = getPropertySeoKeywordsFromContent(property, DEFAULT_SEO_KEYWORDS);

  const resolved = resolveSeo({
    route: path,
    slug,
    pageType: PageType.PROPERTY,
    entity: property,
    siteConfig: SITE,
    origin,
    overrides: {
      image: image || `${origin}/logo.jpg`,
      keywords: keywordList,
      ogType: 'product',
    },
    descriptionMaxLength: 180,
  });

  const title = resolved?.title
    || limitSeoTitle(property.ai_posts?.seo?.title || getServerPropertySeoTitle(property));
  const description = resolved?.description
    || buildDescription(property.ai_posts?.seo?.meta_description || '', { maxLength: 180 });

  return {
    title,
    description,
    image: image || `${origin}/logo.jpg`,
    url: `${origin}${path}`,
    keywords: keywordList.join(', '),
  };
}

export function renderIndexWithMeta(
  indexHtml: string,
  meta: {
    title: string;
    description: string;
    image: string;
    url: string;
    keywords: string;
    ogType?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageType?: string;
    publishedTime?: string;
  },
  schemas: Record<string, unknown>[] = []
) {
  const ogType = meta.ogType || (meta.url.includes('/') && meta.url.split('/').filter(Boolean).length > 1 ? 'article' : 'website');
  const imageType = meta.imageType || (meta.image ? guessImageMimeType(meta.image) : '');
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    '<meta name="googlebot" content="index, follow, max-image-preview:large" />',
    '<meta property="og:locale" content="vi_VN" />',
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    '<meta property="og:site_name" content="Estoria" />',
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.image ? `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />` : '',
    meta.image && imageType ? `<meta property="og:image:type" content="${escapeHtml(imageType)}" />` : '',
    meta.image && meta.imageWidth ? `<meta property="og:image:width" content="${meta.imageWidth}" />` : '',
    meta.image && meta.imageHeight ? `<meta property="og:image:height" content="${meta.imageHeight}" />` : '',
    meta.image ? `<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />` : '',
    meta.publishedTime ? `<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}" />` : '',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : '',
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    ...schemas.map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`),
  ].filter(Boolean).join('\n    ');

  return indexHtml
    .replace(/<title>.*?<\/title>/i, '')
    .replace(/<meta name="description"[^>]*>/gi, '')
    .replace(/<meta name="keywords"[^>]*>/gi, '')
    .replace(/<meta name="robots"[^>]*>/gi, '')
    .replace(/<meta name="googlebot"[^>]*>/gi, '')
    .replace(/<meta property="og:[^"]+"[^>]*>/gi, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*>/gi, '')
    .replace(/<link rel="canonical"[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

export function findPublicPropertyBySlug(propertySlug: string) {
  const decodedSlug = decodeURIComponent(propertySlug || '').toLowerCase();
  return getProperties().find((property: Property) => {
    if (['sold', 'hidden'].includes(property.sale_status || 'available')) return false;
    return property.id === decodedSlug || getPropertySlug(property).toLowerCase() === decodedSlug;
  }) as Property | undefined;
}

export function getIndexHtmlTemplate() {
  const distIndex = path.join(process.cwd(), 'dist', 'index.html');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distIndex)) {
    return fs.readFileSync(distIndex, 'utf-8');
  }
  return fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
}

export function getDefaultShareMeta(origin: string) {
  const keywordList = buildSiteSeoKeywords(getProperties(), DEFAULT_SEO_KEYWORDS);
  const defaultImage = `${origin}/logo.jpg`;

  const resolved = resolveSeo({
    route: publicListingsPath || '/',
    pageType: PageType.HOME,
    siteConfig: SITE,
    origin,
    overrides: {
      title: DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      image: defaultImage,
      keywords: keywordList,
      ogType: 'website',
    },
  });

  return {
    title: resolved?.title || DEFAULT_SEO_TITLE,
    description: resolved?.description || DEFAULT_SEO_DESCRIPTION,
    image: defaultImage,
    url: `${origin}${publicListingsPath}`,
    keywords: keywordList.join(', '),
    ogType: 'website',
  };
}

export function getStaticPageShareMeta(origin: string, pathname: string) {
  const pageMeta = getPageMetaByPath(pathname);
  if (!pageMeta) return null;

  const keywordList = pageMeta.keywords?.length
    ? pageMeta.keywords
    : buildSiteSeoKeywords(getProperties(), DEFAULT_SEO_KEYWORDS);
  const defaultImage = `${origin}/logo.jpg`;

  const resolved = resolveSeo({
    route: pageMeta.path,
    siteConfig: SITE,
    origin,
    overrides: {
      title: pageMeta.title,
      description: pageMeta.description,
      image: defaultImage,
      keywords: keywordList,
      ogType: pageMeta.ogType || 'website',
    },
  });

  return {
    title: resolved?.title || pageMeta.title,
    description: resolved?.description || pageMeta.description,
    image: defaultImage,
    url: `${origin}${pageMeta.path}`,
    keywords: keywordList.join(', '),
    ogType: pageMeta.ogType || 'website',
  };
}

export async function sendPublicIndex(req: Request, res: Response): Promise<boolean> {
  const origin = getPublicOrigin(req);
  const indexHtml = getIndexHtmlTemplate();
  const pathSlug = decodeURIComponent(String(req.path || '').replace(/^\//, ''));

  if (!pathSlug) {
    const meta = getDefaultShareMeta(origin);
    const schemas = buildDefaultPageSchemas([{ name: 'Trang chủ', path: '/' }], origin);
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, meta, schemas));
    return true;
  }

  const staticMeta = getStaticPageShareMeta(origin, `/${pathSlug}`);
  if (staticMeta) {
    const breadcrumbs = [
      { name: 'Trang chủ', path: '/' },
      { name: staticMeta.title.split('|')[0].trim(), path: `/${pathSlug}` },
    ];
    const schemas = [
      ...buildDefaultPageSchemas(breadcrumbs, origin),
      buildBreadcrumbSchema(breadcrumbs, origin),
    ];
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, staticMeta, schemas));
    return true;
  }

  if (pathSlug.startsWith('tin-tuc/')) {
    const blogSlug = pathSlug.slice('tin-tuc/'.length);
    if (blogSlug && !blogSlug.includes('/')) {
      try {
        const post = await getBlogPostBySlug(blogSlug, true);
        if (post) {
          const postPath = `/tin-tuc/${post.slug}`;
          const keywords = (post.tags || []).map((tag: { name: string }) => tag.name).join(', ');
          const description = post.metaDescription || post.excerpt;
          const image = resolveBlogShareImage({
            coverImage: post.coverImage,
            content: post.content,
            contentHtml: post.contentHtml,
            origin,
          });
          const dims = ogImageDimensions(image, origin);
          const meta = {
            title: post.metaTitle || post.title,
            description,
            image,
            url: `${origin}${postPath}`,
            keywords,
            ogType: 'article',
            imageWidth: dims.width,
            imageHeight: dims.height,
            imageType: guessImageMimeType(image),
            publishedTime: post.publishedAt || undefined,
          };
          const breadcrumbs = [
            { name: 'Trang chủ', path: '/' },
            { name: 'Tin tức', path: '/tin-tuc' },
            ...(post.category
              ? [{ name: post.category.name, path: post.category.hubPath }]
              : []),
            { name: post.title, path: postPath },
          ];
          const schemas = [
            ...buildDefaultPageSchemas(breadcrumbs, origin),
            buildBreadcrumbSchema(breadcrumbs, origin),
            buildArticleSchema({
              title: post.title,
              description,
              path: postPath,
              publishedAt: post.publishedAt || undefined,
              updatedAt: post.updatedAt,
              image: meta.image,
              origin,
            }),
            ...(post.faqs?.length ? [buildFaqSchema(post.faqs)] : []),
          ];
          await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, meta, schemas));
          return true;
        }
      } catch (error) {
        console.error('[SSR] blog post meta error:', error);
      }
    }
  }

  if (isReservedSlug(pathSlug)) {
    await sendIndexHtml(req, res, indexHtml);
    return true;
  }

  const property = findPublicPropertyBySlug(pathSlug);
  if (property) {
    const canonicalSlug = getPropertySlug(property);
    // pathSlug already decodeURIComponent'd above — compare exact canonical form.
    if (pathSlug !== canonicalSlug) {
      // Truy cập qua property.id, slug cũ, hoặc sai hoa/thường -> 301 về đúng URL chính tắc.
      // Tránh tình trạng 2 URL cùng trả 200 cho cùng nội dung (nguyên nhân lỗi
      // "Trang trùng lặp, người dùng chưa chọn trang chính tắc" trên Search Console).
      res.redirect(301, getPropertyPath(property));
      return true;
    }
    const shareMeta = getPropertyShareMeta(property, origin);
    const image = shareMeta.image;
    const dataUrlMatch = (property.gallery_images?.[0] || property.images || '').match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    const dims = dataUrlMatch
      ? readImageDimensionsFromBuffer(Buffer.from(dataUrlMatch[1], 'base64')) || ogImageDimensions(image, origin)
      : ogImageDimensions(image, origin);
    const breadcrumbs = [
      { name: 'Trang chủ', path: '/' },
      { name: 'Bất động sản', path: '/bat-dong-san' },
      { name: property.title, path: shareMeta.url.replace(origin, '') },
    ];
    const schemas = [
      ...buildDefaultPageSchemas(breadcrumbs, origin),
      buildBreadcrumbSchema(breadcrumbs, origin),
      ...buildPropertySchemas(property, origin),
    ];
    await sendIndexHtml(req, res, renderIndexWithMeta(indexHtml, {
      ...shareMeta,
      ogType: 'product',
      imageWidth: dims.width,
      imageHeight: dims.height,
      imageType: guessImageMimeType(image),
    }, schemas));
    return true;
  }

  return false;
}

export function shouldAttemptPublicIndex(req: Request) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const requestPath = String(req.path || '');
  if (requestPath.startsWith('/api')) return false;
  if (/\.[a-z0-9]+$/i.test(requestPath)) return false;
  return true;
}

export async function handlePublicIndex(req: Request, res: Response, next: NextFunction) {
  if (!shouldAttemptPublicIndex(req)) {
    next();
    return;
  }
  const handled = await sendPublicIndex(req, res);
  if (handled) return;
  next();
}

export async function finalizeIndexHtml(req: Request, html: string): Promise<string> {
  if (process.env.NODE_ENV === 'production' || !viteDevServer) return html;
  return viteDevServer.transformIndexHtml(req.originalUrl, html);
}

export async function sendIndexHtml(req: Request, res: Response, html: string) {
  const finalHtml = await finalizeIndexHtml(req, html);
  res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).send(finalHtml);
}

export function createSeoPublicRouter() {
  const router = express.Router();

router.get('/property-images/:propertyId/:imageIndex.jpg', (req: Request, res: Response) => {
  const property = getProperties().find((item: Property) => item.id === req.params.propertyId) as Property | undefined;
  if (!property || ['sold', 'hidden'].includes(property.sale_status || 'available')) {
    res.status(404).send('Image not found');
    return;
  }

  const imageIndex = Number.parseInt(req.params.imageIndex, 10) || 0;
  const image = getPropertyImageValue(property, imageIndex);
  const dataUrlMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    res.redirect(getPropertyPublicImageUrl(property, getPublicOrigin(req), imageIndex));
    return;
  }

  const imageBuffer = Buffer.from(dataUrlMatch[2], 'base64');
  res
    .status(200)
    .set({
      'Content-Type': dataUrlMatch[1],
      'Content-Length': String(imageBuffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable'
    })
    .send(imageBuffer);
});

router.get('/bds-da-nang', (req: Request, res: Response) => {
  res.redirect(301, publicListingsPath);
});

router.get('/bds-da-nang/:propertySlug', (req: Request, res: Response) => {
  res.redirect(301, `/${encodeURIComponent(req.params.propertySlug)}`);
});

router.get('/listings', (req: Request, res: Response) => {
  const propertyId = String(req.query.property || '').trim();
  if (propertyId) {
    const property = getProperties().find((item: Property) => item.id === propertyId);
    if (property) {
      res.redirect(301, getPropertyPath(property));
      return;
    }
  }
  res.redirect(301, '/bat-dong-san');
});

router.get('/can-ho', (_req: Request, res: Response) => {
  res.redirect(301, '/bat-dong-san/can-ho');
});

router.get('/dat-nen', (_req: Request, res: Response) => {
  res.redirect(301, '/bat-dong-san/dat-nen');
});

router.get('/nha-pho', (_req: Request, res: Response) => {
  res.redirect(301, '/bat-dong-san/nha-pho');
});

router.get('/nam-da-nang', (_req: Request, res: Response) => {
  res.redirect(301, '/bat-dong-san/nam-da-nang');
});

router.get('/robots.txt', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  res
    .type('text/plain')
    .send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /admin/',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      `Sitemap: ${origin}/sitemap-pages.xml`,
      `Sitemap: ${origin}/sitemap-properties.xml`,
      `Sitemap: ${origin}/sitemap-projects.xml`,
      `Sitemap: ${origin}/sitemap-posts.xml`,
    ].join('\n'));
});

router.get('/sitemap.xml', (req: Request, res: Response) => {
  res.type('application/xml').send(sitemapIndexXml(getPublicOrigin(req)));
});

router.get('/sitemap-pages.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { pages, landings } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml([...pages, ...landings]));
});

router.get('/sitemap-properties.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { properties } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml(properties));
});

router.get('/sitemap-projects.xml', (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const publicProperties = getProperties().filter((p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'));
  const { projects } = buildSitemapEntries(origin, publicProperties);
  res.type('application/xml').send(entriesToXml(projects));
});

router.get('/sitemap-posts.xml', async (req: Request, res: Response) => {
  const origin = getPublicOrigin(req);
  const now = new Date().toISOString().slice(0, 10);
  const base = origin.replace(/\/+$/, '');
  let blogPosts: Awaited<ReturnType<typeof getPublishedBlogPostsForSitemap>> = [];
  try {
    blogPosts = await getPublishedBlogPostsForSitemap();
  } catch (error) {
    console.error('[sitemap-posts] blog query failed:', error);
  }
  const entries = [
    { loc: `${base}/tin-tuc`, changefreq: 'daily' as const, priority: 0.85, lastmod: now },
    ...blogPosts.map(post => ({
      loc: `${base}/tin-tuc/${encodeURIComponent(post.slug)}`,
      changefreq: 'weekly' as const,
      priority: 0.75,
      lastmod: (post.updatedAt || post.publishedAt || new Date()).toISOString().slice(0, 10),
    })),
  ];
  res.type('application/xml').send(entriesToXml(entries));
});

  return router;
}

export function registerSpaFallback(app: Express) {
  const distPath = path.join(process.cwd(), 'dist');

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(distPath, createDistStaticOptions()));
    app.use(handlePublicIndex);
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ status: 'error', message: 'Not found' });
        return;
      }
      const indexHtml = getIndexHtmlTemplate();
      res.status(200).set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      }).send(indexHtml);
    });
  }
}

export async function setupViteDevServer(app: Express) {
  const { createServer } = await import('vite');
  const viteServer = await createServer({
    configFile: path.join(process.cwd(), 'vite.config.ts'),
    server: {
      middlewareMode: true,
      hmr: {
        port: 0,
      },
      watch: {
        ignored: ['**/db.json', '**/db.json.*.bak', '**/dev-server*.log', '**/prod-server*.log'],
      },
    },
    appType: 'spa',
  });
  viteDevServer = viteServer;
  app.use(handlePublicIndex);
  app.use(viteServer.middlewares);
  app.get('*', async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    await sendIndexHtml(req, res, getIndexHtmlTemplate());
  });

  // Unmatched API methods (POST/PATCH/…) that fall through Vite → proper JSON, not empty 404
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `API không tồn tại: ${req.method} ${req.originalUrl}. Thử restart server (npm run dev).`,
    });
  });
}
