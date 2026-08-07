import type { Request, Response } from 'express';
import type { Property } from '../../../src/types';
import { getProperties } from '../../dbHelper';
import { getBlogPostBySlug } from '../../blogDb';
import { resolveBlogShareImage, guessImageMimeType } from '../../../src/seo/shareImage';
import { ogImageDimensions, readImageDimensionsFromBuffer } from '../../seo/ogImageMeta';
import { collectSiteSeoKeywords as buildSiteSeoKeywords, getPropertySeoKeywordsFromContent } from '../../../src/utils/hashtags';
import { resolveSeo } from '../../../src/seo/engine/resolveSeo';
import { PageType } from '../../../src/seo/types/PageType';
import type { SeoMetadata } from '../../../src/seo/types/SeoMetadata';
import { SITE } from '../../../src/seo/siteConfig';
import { getSeoRouteByPath } from '../../../src/seo/registry/seoRouteRegistry';
import { isPropertySlugCandidate, isReservedSlug } from '../../../src/seo/routes';
import { normalizeCanonical, normalizePathname } from '../../../src/seo/utils/normalizeCanonical';
import { renderDocumentWithSeo } from '../../../src/seo/ssr/renderDocument';
import { buildSsrBody } from '../../../src/seo/ssr/buildSsrBody';
import { materializeJsonLd } from '../../../src/seo/ssr/materializeJsonLd';
import { stripTags } from '../../../src/seo/ssr/escapeHtml';
import { DEFAULT_SEO_KEYWORDS } from './seoKeywords';
import { getPropertyPath, getPropertySlug, publicListingsPath } from './propertyPaths';

export type PublicIndexHelpers = {
  getPublicOrigin: (req: Request) => string;
  getIndexHtmlTemplate: () => string;
  findPublicPropertyBySlug: (slug: string) => Property | undefined;
  getPropertyPublicImageUrl: (property: Property, origin: string, index?: number) => string;
  finalizeIndexHtml: (req: Request, html: string) => Promise<string>;
};

async function sendHtml(
  helpers: PublicIndexHelpers,
  req: Request,
  res: Response,
  html: string,
  status = 200,
) {
  const finalHtml = await helpers.finalizeIndexHtml(req, html);
  res.status(status).set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  }).send(finalHtml);
}

function keywordsForHome(): string[] {
  return buildSiteSeoKeywords(getProperties(), [...SITE.defaultKeywords]);
}

function resolveHomeSeo(origin: string): SeoMetadata {
  const seo = resolveSeo({
    route: '/',
    pageType: PageType.HOME,
    siteConfig: SITE,
    origin,
    overrides: {
      keywords: keywordsForHome(),
      image: `${origin}${SITE.ogImage}`,
      ogType: 'website',
    },
  });
  if (!seo) {
    throw new Error('resolveSeo failed for HOME');
  }
  return seo;
}

function resolveStaticSeo(origin: string, pathname: string): SeoMetadata | null {
  const route = normalizePathname(pathname);
  const entry = getSeoRouteByPath(route);
  if (!entry) return null;

  const keywordList = entry.keywords?.length
    ? [...entry.keywords]
    : buildSiteSeoKeywords(getProperties(), DEFAULT_SEO_KEYWORDS);

  return resolveSeo({
    route,
    pageType: entry.pageType,
    siteConfig: SITE,
    origin,
    overrides: {
      keywords: keywordList,
      image: `${origin}${SITE.ogImage}`,
      ogType: entry.ogType || 'website',
    },
  });
}

function resolvePropertySeo(property: Property, origin: string): SeoMetadata {
  const path = getPropertyPath(property);
  const slug = getPropertySlug(property);
  const image = (() => {
    const raw = property.gallery_images?.[0] || property.images || '';
    if (!raw) return `${origin}${SITE.ogImage}`;
    if (raw.startsWith('data:image/')) {
      return `${origin}/property-images/${encodeURIComponent(property.id)}/0.jpg`;
    }
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${origin}${raw}`;
    return raw;
  })();
  const keywordList = getPropertySeoKeywordsFromContent(property, DEFAULT_SEO_KEYWORDS);
  const breadcrumbs = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Bất động sản', path: '/bat-dong-san' },
    { name: property.title, path },
  ];

  const seo = resolveSeo({
    route: path,
    slug,
    pageType: PageType.PROPERTY,
    entity: property,
    siteConfig: SITE,
    origin,
    breadcrumbs,
    overrides: {
      image,
      keywords: keywordList,
      ogType: 'product',
    },
    descriptionMaxLength: 180,
    schemaExtra: ['property'],
  });
  if (!seo) throw new Error('resolveSeo failed for PROPERTY');
  return seo;
}

/**
 * Full public SSR: metadata from resolveSeo() + semantic `#root` body.
 * createRoot on the client replaces `#root` — no hydrate mismatch.
 */
export async function sendPublicIndex(
  req: Request,
  res: Response,
  helpers: PublicIndexHelpers,
): Promise<boolean> {
  const origin = helpers.getPublicOrigin(req);
  const indexHtml = helpers.getIndexHtmlTemplate();
  const requestPath = normalizePathname(req.path || '/');
  const pathSlug = requestPath === '/' ? '' : requestPath.replace(/^\//, '');

  if (!pathSlug) {
    const seo = resolveHomeSeo(origin);
    const schemas = materializeJsonLd(seo, { origin });
    const bodyHtml = buildSsrBody({ seo });
    await sendHtml(
      helpers,
      req,
      res,
      renderDocumentWithSeo({ indexHtml, seo, schemas, bodyHtml }),
    );
    return true;
  }

  const staticSeo = resolveStaticSeo(origin, requestPath);
  if (staticSeo) {
    const schemas = materializeJsonLd(staticSeo, { origin });
    const bodyHtml = buildSsrBody({
      seo: staticSeo,
      article: staticSeo.pageType === PageType.ARTICLE || staticSeo.pageType === PageType.PROJECT
        ? {
            title: staticSeo.title,
            intro: staticSeo.description,
            summary: staticSeo.description,
          }
        : undefined,
      comparison: staticSeo.pageType === PageType.COMPARISON
        ? { title: staticSeo.title, summary: staticSeo.description }
        : undefined,
    });
    await sendHtml(
      helpers,
      req,
      res,
      renderDocumentWithSeo({ indexHtml, seo: staticSeo, schemas, bodyHtml }),
    );
    return true;
  }

  if (pathSlug.startsWith('tin-tuc/')) {
    const blogSlug = pathSlug.slice('tin-tuc/'.length);
    if (blogSlug && !blogSlug.includes('/')) {
      try {
        const post = await getBlogPostBySlug(blogSlug, true);
        if (post) {
          const postPath = `/tin-tuc/${post.slug}`;
          const description = post.metaDescription || post.excerpt || '';
          const image = resolveBlogShareImage({
            coverImage: post.coverImage,
            content: post.content,
            contentHtml: post.contentHtml,
            origin,
          });
          const dims = ogImageDimensions(image, origin);
          const keywords = (post.tags || []).map((tag: { name: string }) => tag.name);
          const breadcrumbs = [
            { name: 'Trang chủ', path: '/' },
            { name: 'Tin tức', path: '/tin-tuc' },
            ...(post.category
              ? [{ name: post.category.name, path: post.category.hubPath }]
              : []),
            { name: post.title, path: postPath },
          ];
          const seo = resolveSeo({
            route: postPath,
            pageType: PageType.ARTICLE,
            siteConfig: SITE,
            origin,
            breadcrumbs,
            overrides: {
              title: post.metaTitle || post.title,
              description,
              image,
              keywords,
              ogType: 'article',
            },
            schemaExtra: ['Article'],
          });
          if (!seo) return false;

          const articleCtx = {
            title: post.title,
            description,
            path: postPath,
            publishedAt: post.publishedAt || undefined,
            updatedAt: post.updatedAt,
            image,
            faqs: post.faqs || undefined,
          };
          const schemas = materializeJsonLd(seo, { origin, article: articleCtx });
          const toc = extractTocFromHtml(post.contentHtml || post.content || '');
          const bodyHtml = buildSsrBody({
            seo,
            article: {
              title: post.title,
              intro: description,
              summary: stripTags(post.excerpt || description).slice(0, 400),
              toc,
            },
          });
          await sendHtml(
            helpers,
            req,
            res,
            renderDocumentWithSeo({
              indexHtml,
              seo,
              schemas,
              bodyHtml,
              imageWidth: dims.width,
              imageHeight: dims.height,
              imageType: guessImageMimeType(image),
              publishedTime: post.publishedAt || undefined,
            }),
          );
          return true;
        }
      } catch (error) {
        console.error('[SSR] blog post meta error:', error);
      }
    }
  }

  const firstSegment = pathSlug.split('/')[0] || '';
  if (isReservedSlug(firstSegment) && !getSeoRouteByPath(requestPath)) {
    // SPA-only public routes (e.g. /moi-gioi) — do not force bare HTML.
    return false;
  }

  const property = helpers.findPublicPropertyBySlug(pathSlug);
  if (property) {
    const canonicalSlug = getPropertySlug(property);
    if (pathSlug !== canonicalSlug) {
      res.redirect(301, getPropertyPath(property));
      return true;
    }

    const seo = resolvePropertySeo(property, origin);
    const image = seo.openGraph.image || `${origin}${SITE.ogImage}`;
    const dataUrlMatch = (property.gallery_images?.[0] || property.images || '').match(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/,
    );
    const dims = dataUrlMatch
      ? readImageDimensionsFromBuffer(Buffer.from(dataUrlMatch[1], 'base64')) || ogImageDimensions(image, origin)
      : ogImageDimensions(image, origin);

    const schemas = materializeJsonLd(seo, { origin, property });
    const bodyHtml = buildSsrBody({ seo, property });
    await sendHtml(
      helpers,
      req,
      res,
      renderDocumentWithSeo({
        indexHtml,
        seo,
        schemas,
        bodyHtml,
        imageWidth: dims.width,
        imageHeight: dims.height,
        imageType: guessImageMimeType(image),
      }),
    );
    return true;
  }

  if (isPropertySlugCandidate(pathSlug)) {
    const seo = resolveSeo({
      route: requestPath,
      pageType: PageType.NOT_FOUND,
      siteConfig: SITE,
      origin,
      noindex: true,
      overrides: {
        image: `${origin}${SITE.ogImage}`,
      },
    });
    if (!seo) return false;
    // Self-canonical for 404 (requirement): requested URL, still noindex.
    const notFoundSeo: SeoMetadata = {
      ...seo,
      canonical: normalizeCanonical(requestPath, origin),
      openGraph: {
        ...seo.openGraph,
        url: normalizeCanonical(requestPath, origin),
      },
    };
    const schemas = materializeJsonLd(notFoundSeo, { origin });
    const bodyHtml = buildSsrBody({ seo: notFoundSeo });
    await sendHtml(
      helpers,
      req,
      res,
      renderDocumentWithSeo({ indexHtml, seo: notFoundSeo, schemas, bodyHtml }),
      404,
    );
    return true;
  }

  return false;
}

function extractTocFromHtml(html: string): { id: string; label: string }[] {
  const matches = [...String(html || '').matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)].slice(0, 8);
  if (!matches.length) return [];
  return matches.map((match, index) => {
    const label = stripTags(match[1]).slice(0, 80) || `Mục ${index + 1}`;
    const id = `muc-${index + 1}`;
    return { id, label };
  });
}

/** Thin wrappers kept for any external imports. */
export function getDefaultShareMeta(origin: string) {
  const seo = resolveHomeSeo(origin);
  return {
    title: seo.title,
    description: seo.description,
    image: seo.openGraph.image || `${origin}${SITE.ogImage}`,
    url: seo.canonical || `${origin}${publicListingsPath}`,
    keywords: (seo.keywords || []).join(', '),
    ogType: seo.openGraph.type || 'website',
  };
}

export function getStaticPageShareMeta(origin: string, pathname: string) {
  const seo = resolveStaticSeo(origin, pathname);
  if (!seo) return null;
  return {
    title: seo.title,
    description: seo.description,
    image: seo.openGraph.image || `${origin}${SITE.ogImage}`,
    url: seo.canonical,
    keywords: (seo.keywords || []).join(', '),
    ogType: seo.openGraph.type || 'website',
  };
}

export function getPropertyShareMeta(property: Property, origin: string) {
  const seo = resolvePropertySeo(property, origin);
  return {
    title: seo.title,
    description: seo.description,
    image: seo.openGraph.image || `${origin}${SITE.ogImage}`,
    url: seo.canonical,
    keywords: (seo.keywords || []).join(', '),
  };
}
