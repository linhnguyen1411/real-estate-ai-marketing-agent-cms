import type { SeoMetadata } from '../types/SeoMetadata';
import { escapeHtml } from './escapeHtml';

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
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : '',
    `<meta name="robots" content="${escapeHtml(seo.robots)}" />`,
    `<meta name="googlebot" content="${escapeHtml(seo.robots)}" />`,
    `<meta property="og:locale" content="${escapeHtml(og.locale || 'vi_VN')}" />`,
    `<meta property="og:type" content="${escapeHtml(og.type || 'website')}" />`,
    `<meta property="og:site_name" content="${escapeHtml(og.siteName || 'Estoria')}" />`,
    `<meta property="og:url" content="${escapeHtml(og.url || seo.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(og.title || seo.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(og.description || seo.description)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    image ? `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />` : '',
    image && input.imageType ? `<meta property="og:image:type" content="${escapeHtml(input.imageType)}" />` : '',
    image && input.imageWidth ? `<meta property="og:image:width" content="${input.imageWidth}" />` : '',
    image && input.imageHeight ? `<meta property="og:image:height" content="${input.imageHeight}" />` : '',
    image ? `<meta property="og:image:alt" content="${escapeHtml(seo.title)}" />` : '',
    input.publishedTime
      ? `<meta property="article:published_time" content="${escapeHtml(input.publishedTime)}" />`
      : '',
    `<meta name="twitter:card" content="${escapeHtml(tw.card || 'summary_large_image')}" />`,
    `<meta name="twitter:title" content="${escapeHtml(tw.title || seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(tw.description || seo.description)}" />`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : '',
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`,
    ...(input.schemas || []).map(
      schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
    ),
  ].filter(Boolean).join('\n    ');

  let html = indexHtml
    .replace(/<title>.*?<\/title>/i, '')
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
