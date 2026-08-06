import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import type { Property } from '../../../src/types';
import { getProperties } from '../../dbHelper';
import { buildSitemapEntries, entriesToXml, sitemapIndexXml } from '../../../src/seo/sitemap';
import { getPublishedBlogPostsForSitemap } from '../../blogDb';
import { createDistStaticOptions } from '../../middleware/staticAssets';
import { PageType } from '../../../src/seo/types/PageType';
import { resolveMeta } from '../../../src/seo/engine/resolveMeta';
import {
  sendPublicIndex as sendPublicIndexCore,
  getDefaultShareMeta,
  getStaticPageShareMeta,
  getPropertyShareMeta,
} from './ssrPublicIndex';
import { getPropertyPath, getPropertySlug, publicListingsPath } from './propertyPaths';

let viteDevServer: import('vite').ViteDevServer | null = null;

export { getDefaultShareMeta, getStaticPageShareMeta, getPropertyShareMeta };
export { renderDocumentWithSeo as renderIndexWithMeta } from '../../../src/seo/ssr/renderDocument';

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
    const publicProperties = getProperties().filter(
      (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
    );
    const { pages, landings } = buildSitemapEntries(origin, publicProperties);
    res.type('application/xml').send(entriesToXml([...pages, ...landings]));
  });

  router.get('/sitemap-properties.xml', (req: Request, res: Response) => {
    const origin = getPublicOrigin(req);
    const publicProperties = getProperties().filter(
      (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
    );
    const { properties } = buildSitemapEntries(origin, publicProperties);
    res.type('application/xml').send(entriesToXml(properties));
  });

  router.get('/sitemap-projects.xml', (req: Request, res: Response) => {
    const origin = getPublicOrigin(req);
    const publicProperties = getProperties().filter(
      (p: Property) => !['sold', 'hidden'].includes(p.sale_status || 'available'),
    );
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

  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      message: `API không tồn tại: ${req.method} ${req.originalUrl}. Thử restart server (npm run dev).`,
    });
  });
}
