import { SITE } from '../siteConfig';
import { resolveSeo } from '../engine/resolveSeo';
import { materializeJsonLd } from '../ssr/materializeJsonLd';
import { buildSsrBody } from '../ssr/buildSsrBody';
import { renderDocumentWithSeo } from '../ssr/renderDocument';
import { normalizePathname } from '../utils/normalizeCanonical';
import { enrichPublishedPage } from './enrichPublishedPage';
import { getPublishableSeoRoute } from './registerSeoRoutes';

export type RenderPublishedPageInput = {
  path: string;
  origin?: string;
  indexHtml: string;
};

export type RenderPublishedPageResult = {
  path: string;
  html: string;
  seo: NonNullable<ReturnType<typeof resolveSeo>>;
  schemas: Record<string, unknown>[];
  faqs: { question: string; answer: string }[];
  contentSlug: string;
};

/**
 * Publishing pipeline:
 * SeoContentRegistry → SEO Engine → Template (via buildSsrBody) → SSR document.
 *
 * Adding one SeoContent registry record makes the page renderable here
 * (and via existing Express public SSR, which shares the same registry).
 */
export function renderPublishedPage(input: RenderPublishedPageInput): RenderPublishedPageResult | null {
  const path = normalizePathname(input.path);
  const route = getPublishableSeoRoute(path);
  if (!route) return null;

  const origin = (input.origin || SITE.url).replace(/\/+$/, '');
  const enrichment = enrichPublishedPage(path);
  if (!enrichment) return null;

  const seo = resolveSeo({
    route: path,
    pageType: route.pageType,
    siteConfig: SITE,
    origin,
    breadcrumbs: enrichment.breadcrumbs,
    overrides: {
      keywords: enrichment.keywords,
      image: `${origin}${SITE.ogImage}`,
      ogType: enrichment.content.ogType || 'website',
    },
    schemaExtra: enrichment.schemaExtra.filter(
      label => label !== 'defaultPage' && label !== 'BreadcrumbList',
    ),
  });
  if (!seo) return null;

  const schemas = materializeJsonLd(seo, {
    origin,
    faqs: enrichment.faqs,
  });
  const bodyHtml = buildSsrBody({ seo, path });
  const html = renderDocumentWithSeo({
    indexHtml: input.indexHtml,
    seo,
    schemas,
    bodyHtml,
  });

  return {
    path,
    html,
    seo,
    schemas,
    faqs: enrichment.faqs,
    contentSlug: enrichment.content.slug,
  };
}
