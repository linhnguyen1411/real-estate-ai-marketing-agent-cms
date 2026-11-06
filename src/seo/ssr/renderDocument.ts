import type { SeoMetadata } from '../types/SeoMetadata';
import { escapeHtml } from './escapeHtml';

/** Marks crawler tags the SPA supersedes once React 19 hoists its own head tags. */
const SSR_HEAD_ATTRIBUTE = 'data-seo-ssr="1"';

export type RenderDocumentInput = {
  indexHtml: string;
  seo: SeoMetadata;
  schemas?: Record<string, unknown>[];
  bodyHtml?: string;
  /** Optional OG image dimensions / mime */
  imageWidth?: number;
  imageHeight?: number;
  imageType?: string;
  publishedTime?: string;
};

/**
 * Inject head metadata + optional `#root` semantic body from resolveSeo().
 */
export function renderDocumentWithSeo(input: RenderDocumentInput): string {
  const { indexHtml, seo } = input;
  const og = seo.openGraph;
  const tw = seo.twitter;
  const keywords = (seo.keywords || []).join(', ');
  const image = og.image || seo.ogImage || '';

  const tags = [
    `<title ${SSR_HEAD_ATTRIBUTE}>${escapeHtml(seo.title)}</title>`,
    `<meta ${SSR_HEAD_ATTRIBUTE} name="description" content="${escapeHtml(seo.description)}" />`,
    keywords ? `<meta ${SSR_HEAD_ATTRIBUTE} name="keywords" content="${escapeHtml(keywords)}" />` : '',
    `<meta ${SSR_HEAD_ATTRIBUTE} name="robots" content="${escapeHtml(seo.robots)}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} name="googlebot" content="${escapeHtml(seo.robots)}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:locale" content="${escapeHtml(og.locale || 'vi_VN')}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:type" content="${escapeHtml(og.type || 'website')}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:site_name" content="${escapeHtml(og.siteName || 'House & Life')}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:url" content="${escapeHtml(og.url || seo.canonical)}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:title" content="${escapeHtml(og.title || seo.title)}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} property="og:description" content="${escapeHtml(og.description || seo.description)}" />`,
    image ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image" content="${escapeHtml(image)}" />` : '',
    image ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image:secure_url" content="${escapeHtml(image)}" />` : '',
    image && input.imageType ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image:type" content="${escapeHtml(input.imageType)}" />` : '',
    image && input.imageWidth ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image:width" content="${input.imageWidth}" />` : '',
    image && input.imageHeight ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image:height" content="${input.imageHeight}" />` : '',
    image ? `<meta ${SSR_HEAD_ATTRIBUTE} property="og:image:alt" content="${escapeHtml(seo.title)}" />` : '',
    input.publishedTime
      ? `<meta ${SSR_HEAD_ATTRIBUTE} property="article:published_time" content="${escapeHtml(input.publishedTime)}" />`
      : '',
    `<meta ${SSR_HEAD_ATTRIBUTE} name="twitter:card" content="${escapeHtml(tw.card || 'summary_large_image')}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} name="twitter:title" content="${escapeHtml(tw.title || seo.title)}" />`,
    `<meta ${SSR_HEAD_ATTRIBUTE} name="twitter:description" content="${escapeHtml(tw.description || seo.description)}" />`,
    image ? `<meta ${SSR_HEAD_ATTRIBUTE} name="twitter:image" content="${escapeHtml(image)}" />` : '',
    `<link ${SSR_HEAD_ATTRIBUTE} rel="canonical" href="${escapeHtml(seo.canonical)}" />`,
    ...(input.schemas || []).map(
      schema => `<script ${SSR_HEAD_ATTRIBUTE} type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
    ),
  ].filter(Boolean).join('\n    ');

  let html = indexHtml
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, '')
    .replace(/<meta name="description"[^>]*>/gi, '')
    .replace(/<meta name="keywords"[^>]*>/gi, '')
    .replace(/<meta name="robots"[^>]*>/gi, '')
    .replace(/<meta name="googlebot"[^>]*>/gi, '')
    .replace(/<meta property="og:[^"]+"[^>]*>/gi, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*>/gi, '')
    .replace(/<meta property="article:published_time"[^>]*>/gi, '')
    .replace(/<link rel="canonical"[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `    ${tags}\n  </head>`);

  if (input.bodyHtml) {
    html = html.replace(
      /<div id="root"[^>]*>[\s\S]*?<\/div>/i,
      `<div id="root">${input.bodyHtml}</div>`,
    );
  }

  return html;
}

/** @deprecated Prefer renderDocumentWithSeo — kept name for call-site migration. */
export function renderIndexWithMeta(
  indexHtml: string,
  seo: SeoMetadata,
  schemas: Record<string, unknown>[] = [],
  bodyHtml = '',
  extras: Pick<RenderDocumentInput, 'imageWidth' | 'imageHeight' | 'imageType' | 'publishedTime'> = {},
): string {
  return renderDocumentWithSeo({
    indexHtml,
    seo,
    schemas,
    bodyHtml,
    ...extras,
  });
}
