import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import type { Property } from '../../../src/types';
import { getProperties } from '../../dbHelper';
import { buildSitemapEntries, entriesToXml, sitemapIndexXml, generateSitemapXml } from '../../../src/seo/sitemap';
import { getPublishedBlogPostsForSitemap } from '../../blogDb';
import { createDistStaticOptions } from '../../middleware/staticAssets';
import { PageType } from '../../../src/seo/types/PageType';
import { resolveMeta } from '../../../src/seo/engine/resolveMeta';
import { resolveSeo } from '../../../src/seo/engine/resolveSeo';
import { SITE } from '../../../src/seo/siteConfig';
import { normalizePathname } from '../../../src/seo/utils/normalizeCanonical';
import { getSeoRouteByPath } from '../../../src/seo/registry/seoRouteRegistry';
import {
  sendPublicIndex as sendPublicIndexCore,
  getDefaultShareMeta,
  getStaticPageShareMeta,
  getPropertyShareMeta,
} from './ssrPublicIndex';
import { getPropertyPath, getPropertySlug, publicListingsPath } from './propertyPaths';
import { renderDocumentWithSeo } from '../../../src/seo/ssr/renderDocument';

let viteDevServer: import('vite').ViteDevServer | null = null;

export { getDefaultShareMeta, getStaticPageShareMeta, getPropertyShareMeta };
export { renderDocumentWithSeo as renderIndexWithMeta };

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
  if (image.startsWith('data:image/')) {
    return `${origin}/property-images/${encodeURIComponent(property.id)}/${index}.jpg`;
  }
  return absoluteUrl(image, origin);
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

export async function sendPublicIndex(req: Request, res: Response): Promise<boolean> {
  return sendPublicIndexCore(req, res, {
    getPublicOrigin,
    getIndexHtmlTemplate,
    findPublicPropertyBySlug,
    getPropertyPublicImageUrl,
    finalizeIndexHtml,
  });
}

export function shouldAttemptPublicIndex(req: Request) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const requestPath = String(req.path || '');
  if (requestPath.startsWith('/api')) return false;
  // Never SSR-intercept Vite / bundler internals — otherwise /@vite/client becomes
  // a fake property-slug 404 and the SPA boots without CSS/JS.
  if (
    requestPath.startsWith('/@') ||
    requestPath.startsWith('/src/') ||
    requestPath.startsWith('/node_modules/') ||
    requestPath.startsWith('/.vite/')
  ) {
    return false;
  }
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

export async function sendIndexHtml(req: Request, res: Response, html: string, status = 200) {
  const finalHtml = await finalizeIndexHtml(req, html);
  res.status(status).set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  }).send(finalHtml);
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
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      .send(imageBuffer);
  });

  router.get('/bds-da-nang', (_req: Request, res: Response) => {
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
    res.redirect(301, '/can-ho-cao-cap-da-nang');
  });

  router.get('/dat-nen', (_req: Request, res: Response) => {
    res.redirect(301, '/dat-nen-nam-hoa-xuan-da-nang');
  });

  router.get('/nha-pho', (_req: Request, res: Response) => {
    res.redirect(301, '/bat-dong-san/nha-pho');
  });

  router.get('/nam-da-nang', (_req: Request, res: Response) => {
    res.redirect(301, '/bat-dong-san-nam-da-nang');
  });

  router.get('/shophouse', (_req: Request, res: Response) => {
    res.redirect(301, '/shophouse-khoi-de-da-nang');
  });

  router.get('/bds-dau-tu', (_req: Request, res: Response) => {
    res.redirect(301, '/bat-dong-san-dau-tu-da-nang');
  });

  router.get('/bds-gia-dau-tu', (_req: Request, res: Response) => {
    res.redirect(301, '/bat-dong-san-dau-tu-da-nang');
  });

  router.get('/bat-dong-san/can-ho', (_req: Request, res: Response) => {
    res.redirect(301, '/can-ho-cao-cap-da-nang');
  });

  router.get('/bat-dong-san/dat-nen', (_req: Request, res: Response) => {
    res.redirect(301, '/dat-nen-nam-hoa-xuan-da-nang');
  });

  router.get('/bat-dong-san/nam-da-nang', (_req: Request, res: Response) => {
    res.redirect(301, '/bat-dong-san-nam-da-nang');
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

  // Sitemap XML routes are registered early via registerSitemapXmlRoutes(app)
  // (before SPA static/wildcard) — keep robots here with other public SEO helpers.

  return router;
}

/**
 * Register sitemap XML endpoints BEFORE static middleware / SPA wildcard.
 * Prevents `/sitemap.xml` from falling through to `index.html`.
 */
export function registerSitemapXmlRoutes(app: Express) {
  app.get('/sitemap.xml', async (req: Request, res: Response) => {
    try {
      const origin = getPublicOrigin(req);
      const publicProperties = getProperties().filter(
        (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
      );
      let posts: Awaited<ReturnType<typeof getPublishedBlogPostsForSitemap>> = [];
      try {
        posts = await getPublishedBlogPostsForSitemap();
      } catch (error) {
        console.error('[sitemap.xml] blog query failed:', error);
      }
      const xmlData = await generateSitemapXml({
        origin,
        properties: publicProperties,
        posts,
      });
      res.status(200).set({
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }).send(xmlData);
    } catch (error) {
      console.error('[sitemap.xml] generation failed:', error);
      res
        .status(500)
        .set({ 'Content-Type': 'text/xml; charset=utf-8' })
        .send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap generation failed</error>');
    }
  });

  app.get('/sitemap-pages.xml', (req: Request, res: Response) => {
    try {
      const origin = getPublicOrigin(req);
      const publicProperties = getProperties().filter(
        (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
      );
      const { pages, landings } = buildSitemapEntries(origin, publicProperties);
      res.status(200).set({
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }).send(entriesToXml([...pages, ...landings]));
    } catch (error) {
      console.error('[sitemap-pages.xml] generation failed:', error);
      res.status(500).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap generation failed</error>');
    }
  });

  app.get('/sitemap-properties.xml', (req: Request, res: Response) => {
    try {
      const origin = getPublicOrigin(req);
      const publicProperties = getProperties().filter(
        (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
      );
      const { properties } = buildSitemapEntries(origin, publicProperties);
      res.status(200).set({
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }).send(entriesToXml(properties));
    } catch (error) {
      console.error('[sitemap-properties.xml] generation failed:', error);
      res.status(500).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap generation failed</error>');
    }
  });

  app.get('/sitemap-projects.xml', (req: Request, res: Response) => {
    try {
      const origin = getPublicOrigin(req);
      const publicProperties = getProperties().filter(
        (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
      );
      const { projects } = buildSitemapEntries(origin, publicProperties);
      res.status(200).set({
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }).send(entriesToXml(projects));
    } catch (error) {
      console.error('[sitemap-projects.xml] generation failed:', error);
      res.status(500).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap generation failed</error>');
    }
  });

  app.get('/sitemap-posts.xml', async (req: Request, res: Response) => {
    try {
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
      res.status(200).set({
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }).send(entriesToXml(entries));
    } catch (error) {
      console.error('[sitemap-posts.xml] generation failed:', error);
      res.status(500).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap generation failed</error>');
    }
  });

  // Optional index for tools that still expect a sitemapindex at a dedicated path
  app.get('/sitemap-index.xml', (req: Request, res: Response) => {
    res.status(200).set({
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    }).send(sitemapIndexXml(getPublicOrigin(req)));
  });
}

/** Inject path-accurate canonical / OG / title when SPA fallback HTML is served. */
export function injectRequestSeoMeta(html: string, req: Request): string {
  const origin = getPublicOrigin(req);
  const requestPath = normalizePathname(req.path || '/');
  const canonicalUrl = requestPath === '/' ? `${origin}/` : `${origin}${requestPath}`;

  const registryEntry = getSeoRouteByPath(requestPath);
  const seo = resolveSeo({
    route: requestPath,
    pageType: registryEntry?.pageType,
    siteConfig: SITE,
    origin,
    overrides: registryEntry
      ? {
          title: registryEntry.defaultTitle,
          description: registryEntry.defaultDescription,
          image: `${origin}${SITE.ogImage}`,
          ogType: registryEntry.ogType || 'website',
          keywords: registryEntry.keywords ? [...registryEntry.keywords] : undefined,
        }
      : {
          image: `${origin}${SITE.ogImage}`,
          ogType: 'website',
        },
  });

  if (seo) {
    // Ensure self-canonical for the requested path even if resolver normalized oddly
    const patched = {
      ...seo,
      canonical: canonicalUrl,
      openGraph: { ...seo.openGraph, url: canonicalUrl },
    };
    return renderDocumentWithSeo({ indexHtml: html, seo: patched });
  }

  // Minimal fallback: force canonical + og:url to current path (never leave homepage canonical)
  return html
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:url["'][^>]*>/gi, '')
    .replace(
      '</head>',
      `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />\n    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />\n  </head>`,
    );
}

export function registerSpaFallback(app: Express) {
  const distPath = path.join(process.cwd(), 'dist');

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(distPath, createDistStaticOptions()));
    app.use(handlePublicIndex);
    app.get('*', async (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ status: 'error', message: 'Not found' });
        return;
      }

      // Unknown /du-an/:slug that is not in SEO registry → 404 (not soft-200 SPA shell)
      const requestPath = normalizePathname(req.path || '/');
      if (/^\/du-an\/[^/]+$/i.test(requestPath) && !getSeoRouteByPath(requestPath)) {
        const notFoundSeo = resolveSeo({
          route: requestPath,
          pageType: PageType.NOT_FOUND,
          siteConfig: SITE,
          origin: getPublicOrigin(req),
          noindex: true,
          overrides: { image: `${getPublicOrigin(req)}${SITE.ogImage}` },
        });
        const html = notFoundSeo
          ? renderDocumentWithSeo({
              indexHtml: getIndexHtmlTemplate(),
              seo: {
                ...notFoundSeo,
                canonical: `${getPublicOrigin(req)}${requestPath}`,
                openGraph: { ...notFoundSeo.openGraph, url: `${getPublicOrigin(req)}${requestPath}` },
              },
            })
          : injectRequestSeoMeta(getIndexHtmlTemplate(), req);
        res.status(404).set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        }).send(html);
        return;
      }

      const indexHtml = injectRequestSeoMeta(getIndexHtmlTemplate(), req);
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
    await sendIndexHtml(req, res, injectRequestSeoMeta(getIndexHtmlTemplate(), req));
  });

  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `API không tồn tại: ${req.method} ${req.originalUrl}. Thử restart server (npm run dev).`,
    });
  });
}
