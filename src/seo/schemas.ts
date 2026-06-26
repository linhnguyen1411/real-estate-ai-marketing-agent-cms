import { Property } from '../types';
import { getPublicPropertySlug } from '../utils/propertyShare';
import { AUTHOR, CONTACT, SITE, absoluteUrl } from './siteConfig';

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function buildBreadcrumbSchema(items: BreadcrumbItem[], origin: string = SITE.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, origin),
    })),
  };
}

export function buildOrganizationSchema(origin: string = SITE.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${origin}/#organization`,
    name: SITE.name,
    alternateName: SITE.brand,
    url: origin,
    logo: absoluteUrl(SITE.logo, origin),
    image: absoluteUrl(SITE.logo, origin),
    description: SITE.defaultDescription,
    telephone: CONTACT.phoneTel,
    email: CONTACT.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Đà Nẵng',
      addressRegion: 'Đà Nẵng',
      addressCountry: 'VN',
    },
    areaServed: SITE.areaServed.map(name => ({ '@type': 'Place', name })),
    sameAs: [CONTACT.facebook, CONTACT.zalo],
    founder: {
      '@type': 'Person',
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
  };
}

export function buildWebSiteSchema(origin: string = SITE.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: SITE.name,
    alternateName: SITE.brand,
    url: origin,
    description: SITE.defaultDescription,
    publisher: { '@id': `${origin}/#organization` },
    inLanguage: 'vi-VN',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/bat-dong-san?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildLocalBusinessSchema(origin: string = SITE.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: CONTACT.companyName,
    image: absoluteUrl(SITE.logo, origin),
    url: origin,
    telephone: CONTACT.phoneTel,
    email: CONTACT.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Đà Nẵng',
      addressCountry: 'VN',
    },
    openingHours: 'Mo-Su 08:00-21:00',
    priceRange: '$$$',
  };
}

export function buildPersonSchema(origin: string = SITE.url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': AUTHOR.url,
    name: AUTHOR.name,
    jobTitle: AUTHOR.title,
    url: AUTHOR.url,
    worksFor: { '@id': `${origin}/#organization` },
    knowsAbout: AUTHOR.expertise,
    description: AUTHOR.bio,
  };
}

export function buildFaqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function buildArticleSchema(input: {
  title: string;
  description: string;
  path: string;
  publishedAt?: string;
  updatedAt?: string;
  image?: string;
  origin?: string;
}) {
  const origin = input.origin || SITE.url;
  const url = absoluteUrl(input.path, origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    image: input.image ? absoluteUrl(input.image, origin) : absoluteUrl(SITE.ogImage, origin),
    datePublished: input.publishedAt || '2026-01-01',
    dateModified: input.updatedAt || input.publishedAt || '2026-01-01',
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: absoluteUrl(SITE.logo, origin) },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'vi-VN',
  };
}

function propertyTypeSchema(property: Property) {
  const type = String(property.type || '').toLowerCase();
  if (type.includes('căn') || type.includes('can')) return 'Apartment';
  if (type.includes('đất') || type.includes('dat')) return 'LandmarksOrHistoricalBuildings';
  return 'Residence';
}

export function buildPropertySchemas(property: Property, origin: string = SITE.url) {
  const slug = getPublicPropertySlug(property);
  const url = absoluteUrl(`/${encodeURIComponent(slug)}`, origin);
  const image = property.gallery_images?.[0] || property.images;
  const imageUrl = image?.startsWith('data:')
    ? `${origin}/property-images/${encodeURIComponent(property.id)}/0.jpg`
    : absoluteUrl(image, origin);

  const place = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: property.location,
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.location,
      addressRegion: 'Đà Nẵng',
      addressCountry: 'VN',
    },
  };

  const residence = {
    '@context': 'https://schema.org',
    '@type': propertyTypeSchema(property),
    name: property.title,
    description: property.rich_description || property.description,
    url,
    image: imageUrl ? [imageUrl] : undefined,
    address: place.address,
    floorSize: { '@type': 'QuantitativeValue', value: property.area, unitCode: 'MTK' },
    numberOfRooms: property.bedrooms,
  };

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: property.title,
    description: property.rich_description || property.description,
    image: imageUrl,
    url,
    category: property.type,
    offers: {
      '@type': 'Offer',
      price: Math.round(property.price * 1_000_000_000),
      priceCurrency: 'VND',
      availability: 'https://schema.org/InStock',
      url,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Vị trí', value: property.location },
      { '@type': 'PropertyValue', name: 'Diện tích', value: `${property.area} m²` },
      { '@type': 'PropertyValue', name: 'Pháp lý', value: property.legal_status },
    ],
  };

  return [place, residence, product];
}

export function buildDefaultPageSchemas(breadcrumbs?: BreadcrumbItem[], origin: string = SITE.url) {
  const schemas: Record<string, unknown>[] = [
    buildOrganizationSchema(origin),
    buildWebSiteSchema(origin),
    buildLocalBusinessSchema(origin),
  ];
  if (breadcrumbs?.length) {
    schemas.push(buildBreadcrumbSchema(breadcrumbs, origin));
  }
  return schemas;
}
