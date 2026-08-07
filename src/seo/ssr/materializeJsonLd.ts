import type { Property } from '../../types';
import type { SeoMetadata, SchemaType } from '../types/SeoMetadata';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildDefaultPageSchemas,
  buildFaqSchema,
  buildLocalBusinessSchema,
  buildPersonSchema,
  buildPropertySchemas,
} from '../schemas';
import { lookupFaqsForSeoPath } from '../publishing/enrichPublishedPage';

export type JsonLdContext = {
  origin: string;
  property?: Property;
  faqs?: { question: string; answer: string }[];
  article?: {
    title: string;
    description: string;
    path: string;
    publishedAt?: string;
    updatedAt?: string;
    image?: string;
    faqs?: { question: string; answer: string }[];
  };
};

/**
 * Materialize JSON-LD from engine schema *labels* using existing builders.
 * Does not invent new schema shapes.
 */
export function materializeJsonLd(seo: SeoMetadata, ctx: JsonLdContext): Record<string, unknown>[] {
  const origin = ctx.origin;
  const breadcrumbs = seo.breadcrumb.map(item => ({ name: item.name, path: item.path }));
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const push = (schema: Record<string, unknown> | Record<string, unknown>[]) => {
    const list = Array.isArray(schema) ? schema : [schema];
    for (const item of list) {
      const key = JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  };

  for (const label of seo.schema) {
    push(materializeOne(label, seo, ctx, breadcrumbs, origin));
  }

  const faqs = ctx.faqs?.length
    ? ctx.faqs
    : ctx.article?.faqs?.length
      ? ctx.article.faqs
      : lookupFaqsForSeoPath(pathFromSeoCanonical(seo.canonical));

  if (faqs.length) {
    push(buildFaqSchema(faqs));
  }

  return out;
}

function pathFromSeoCanonical(canonical: string): string {
  try {
    return new URL(canonical).pathname || '/';
  } catch {
    return canonical.startsWith('/') ? canonical : '/';
  }
}

function materializeOne(
  label: SchemaType,
  seo: SeoMetadata,
  ctx: JsonLdContext,
  breadcrumbs: { name: string; path: string }[],
  origin: string,
): Record<string, unknown> | Record<string, unknown>[] {
  switch (label) {
    case 'defaultPage':
      return buildDefaultPageSchemas(breadcrumbs, origin);
    case 'BreadcrumbList':
      return buildBreadcrumbSchema(breadcrumbs, origin);
    case 'RealEstateAgent':
    case 'WebSite':
    case 'LocalBusiness':
      // Covered by defaultPage; avoid duplicate unless defaultPage absent
      if (!seo.schema.includes('defaultPage')) {
        if (label === 'LocalBusiness') return buildLocalBusinessSchema(origin);
        return buildDefaultPageSchemas(undefined, origin);
      }
      return [];
    case 'Person':
      return buildPersonSchema(origin);
    case 'Article':
      if (ctx.article) {
        return buildArticleSchema({
          title: ctx.article.title,
          description: ctx.article.description,
          path: ctx.article.path,
          publishedAt: ctx.article.publishedAt,
          updatedAt: ctx.article.updatedAt,
          image: ctx.article.image,
          origin,
        });
      }
      return buildArticleSchema({
        title: seo.title,
        description: seo.description,
        path: pathFromCanonical(seo.canonical, origin),
        origin,
      });
    case 'FAQPage':
      return ctx.article?.faqs?.length ? buildFaqSchema(ctx.article.faqs) : [];
    case 'property':
    case 'Place':
    case 'Apartment':
    case 'Residence':
    case 'Product':
      return ctx.property ? buildPropertySchemas(ctx.property, origin) : [];
    case 'CollectionPage':
      return [];
    default:
      return [];
  }
}

function pathFromCanonical(canonical: string, origin: string): string {
  if (canonical.startsWith(origin)) {
    const path = canonical.slice(origin.length) || '/';
    return path.startsWith('/') ? path : `/${path}`;
  }
  try {
    return new URL(canonical).pathname || '/';
  } catch {
    return '/';
  }
}
