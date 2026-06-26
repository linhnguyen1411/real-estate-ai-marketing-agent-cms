import { guessImageMimeType } from '../../src/seo/shareImage';

export function isSocialPreviewCrawler(userAgent = ''): boolean {
  return /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|pinterest|vkshare|embedly|quora link preview|outbrain|w3c_validator/i.test(
    userAgent,
  );
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ShortLinkShareMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageType?: string;
  ogType?: string;
}

export function renderShortLinkOgHtml(meta: ShortLinkShareMeta): string {
  const imageType = meta.imageType || (meta.image ? guessImageMimeType(meta.image) : '');
  const redirectUrl = meta.redirectUrl || meta.url;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}" />
  <meta property="og:site_name" content="Estoria" />
  <meta property="og:url" content="${escapeHtml(meta.url)}" />
  <meta property="og:title" content="${escapeHtml(meta.title)}" />
  <meta property="og:description" content="${escapeHtml(meta.description)}" />
  ${meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : ''}
  ${meta.image ? `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />` : ''}
  ${meta.image && imageType ? `<meta property="og:image:type" content="${escapeHtml(imageType)}" />` : ''}
  ${meta.image && meta.imageWidth ? `<meta property="og:image:width" content="${meta.imageWidth}" />` : ''}
  ${meta.image && meta.imageHeight ? `<meta property="og:image:height" content="${meta.imageHeight}" />` : ''}
  ${meta.image ? `<meta property="og:image:alt" content="${escapeHtml(meta.title)}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
  ${meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : ''}
  <link rel="canonical" href="${escapeHtml(meta.url)}" />
</head>
<body>
  <p><a href="${escapeHtml(redirectUrl)}">${escapeHtml(meta.title)}</a></p>
</body>
</html>`;
}
