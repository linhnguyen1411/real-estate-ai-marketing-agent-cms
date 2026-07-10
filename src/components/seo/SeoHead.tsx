import { Helmet } from 'react-helmet-async';
import { SITE, absoluteUrl, getSiteOrigin, formatPageTitle } from '../../seo/siteConfig';
import { resolveShareImageUrl, guessImageMimeType } from '../../seo/shareImage';

export interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  ogType?: 'website' | 'article' | 'product' | 'profile';
  noindex?: boolean;
  publishedTime?: string;
  schemas?: Record<string, unknown>[];
}

export default function SeoHead({
  title,
  description,
  path = '/',
  keywords = [],
  image = SITE.ogImage,
  imageWidth = 1200,
  imageHeight = 630,
  ogType = 'website',
  noindex = false,
  publishedTime,
  schemas = [],
}: SeoHeadProps) {
  const origin = getSiteOrigin();
  const canonical = absoluteUrl(path, origin);
  const keywordStr = keywords.length ? keywords.join(', ') : SITE.defaultKeywords.join(', ');
  const robots = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const img = resolveShareImageUrl(image, origin, SITE.ogImage);
  const imageType = guessImageMimeType(img);

  return (
    <Helmet>
      <html lang={SITE.language} />
      <title>{formatPageTitle(title)}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywordStr} />
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots} />
      <link rel="canonical" href={canonical} />
      <link rel="icon" type="image/jpeg" href={absoluteUrl(SITE.logo, origin)} />
      <link rel="apple-touch-icon" href={absoluteUrl(SITE.logo, origin)} />
      <meta property="og:locale" content={SITE.locale} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={formatPageTitle(title)} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={img} />
      <meta property="og:image:secure_url" content={img} />
      <meta property="og:image:type" content={imageType} />
      <meta property="og:image:width" content={String(imageWidth)} />
      <meta property="og:image:height" content={String(imageHeight)} />
      <meta property="og:image:alt" content={formatPageTitle(title)} />
      {publishedTime ? <meta property="article:published_time" content={publishedTime} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={formatPageTitle(title)} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
