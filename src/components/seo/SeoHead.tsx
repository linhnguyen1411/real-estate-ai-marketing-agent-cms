import { Helmet } from 'react-helmet-async';
import { SITE, absoluteUrl, getSiteOrigin, formatPageTitle } from '../../seo/siteConfig';

export interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  image?: string;
  ogType?: 'website' | 'article' | 'product';
  noindex?: boolean;
  schemas?: Record<string, unknown>[];
}

export default function SeoHead({
  title,
  description,
  path = '/',
  keywords = [],
  image = SITE.ogImage,
  ogType = 'website',
  noindex = false,
  schemas = [],
}: SeoHeadProps) {
  const origin = getSiteOrigin();
  const canonical = absoluteUrl(path, origin);
  const keywordStr = keywords.length ? keywords.join(', ') : SITE.defaultKeywords.join(', ');
  const robots = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const img = absoluteUrl(image, origin);

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
