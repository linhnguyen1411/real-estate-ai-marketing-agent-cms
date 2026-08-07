import { SITE } from '../siteConfig';
import { PageType } from '../types/PageType';
import type { SeoMetadata } from '../types/SeoMetadata';
import { getSeoRouteByPath, type SeoRouteDefinition } from '../registry/seoRouteRegistry';
import { getSeoContentRecord } from '../data/seoContentRegistry';
import { getBreadcrumbRecord } from '../data/breadcrumbRegistry';
import { getKeywordClusterRecord } from '../data/keywordClusters';
import { getFaqSetRecord } from '../data/faqRegistry';
import { normalizePathname } from '../utils/normalizeCanonical';
import { resolveMeta, type SeoEntityLike } from './resolveMeta';
import { resolveCanonical } from './resolveCanonical';
import { resolveRobots } from './resolveRobots';
import { resolveOg } from './resolveOg';
import { resolveTwitter } from './resolveTwitter';
import { resolveSchema } from './resolveSchema';
import { resolveBreadcrumb } from './resolveBreadcrumb';

export type SiteConfigLike = {
  url: string;
  name: string;
  locale: string;
  ogImage: string;
  defaultKeywords: readonly string[];
};

export type ResolveSeoInput = {
  route: string;
  slug?: string;
  pageType?: PageType;
  entity?: SeoEntityLike;
  siteConfig?: SiteConfigLike;
  origin?: string;
  noindex?: boolean;
  /** Preserve surface-specific strings (e.g. SSR home defaults). */
  overrides?: {
    title?: string;
    description?: string;
    keywords?: string[];
    image?: string;
    ogType?: string;
  };
  breadcrumbs?: { name: string; path: string }[];
  appendBrand?: boolean;
  descriptionMaxLength?: number;
  schemaExtra?: SeoMetadata['schema'];
};

/**
 * Central SEO resolver — single entry for metadata composition.
 * Does not inject HTML or touch React.
 */
export function resolveSeo(input: ResolveSeoInput): SeoMetadata | null {
  const site = input.siteConfig || SITE;
  const origin = (input.origin || site.url).replace(/\/+$/, '');
  const route = normalizePathname(input.route || (input.slug ? `/${input.slug}` : '/'));

  const registryEntry = getSeoRouteByPath(route);
  const content = getSeoContentRecord(route);
  const pageType = resolvePageType(input.pageType, registryEntry, input.entity);

  if (!registryEntry && pageType !== PageType.PROPERTY && pageType !== PageType.NOT_FOUND && !input.overrides?.title) {
    return null;
  }

  if (pageType === PageType.NOT_FOUND) {
    return buildNotFound(origin, site);
  }

  const meta = resolveMeta({
    pageType,
    registryEntry,
    entity: input.entity,
    overrides: input.overrides,
    appendBrand: input.appendBrand,
    descriptionMaxLength: input.descriptionMaxLength ?? (pageType === PageType.PROPERTY ? 180 : undefined),
  });

  if (!meta.title && !meta.description) return null;

  const pathForCanonical = pageType === PageType.PROPERTY && input.slug
    ? `/${encodeURIComponent(input.slug)}`
    : route;
  const canonical = resolveCanonical({ path: pathForCanonical, origin });
  const robots = resolveRobots({ noindex: input.noindex });
  const image = input.overrides?.image || `${origin}${site.ogImage.startsWith('/') ? site.ogImage : `/${site.ogImage}`}`;
  const ogType = input.overrides?.ogType || registryEntry?.ogType || content?.ogType || (pageType === PageType.PROPERTY ? 'product' : 'website');

  const cluster = content?.keywordClusterId
    ? getKeywordClusterRecord(content.keywordClusterId)
    : undefined;
  const keywords = input.overrides?.keywords
    || (registryEntry?.keywords ? [...registryEntry.keywords] : undefined)
    || (cluster ? [cluster.primaryKeyword, ...cluster.secondaryKeywords] : undefined)
    || (content?.keywords ? [...content.keywords] : undefined);

  const openGraph = resolveOg({
    title: meta.title,
    description: meta.description,
    url: canonical,
    type: ogType,
    image,
  });

  const twitter = resolveTwitter({
    title: meta.title,
    description: meta.description,
    image,
  });

  const registryBreadcrumbs = !input.breadcrumbs && content?.breadcrumbId
    ? getBreadcrumbRecord(content.breadcrumbId)?.items
    : undefined;

  const breadcrumb = resolveBreadcrumb({
    route: pathForCanonical,
    pageType,
    leafName: pageType === PageType.PROPERTY ? input.entity?.title : undefined,
    breadcrumbs: input.breadcrumbs || registryBreadcrumbs,
  });

  const schemaExtra: SeoMetadata['schema'] = [...(input.schemaExtra || [])];
  if (content?.faqId) {
    const faqSet = getFaqSetRecord(content.faqId);
    if (faqSet?.items.some(item => item.schemaEligible !== false) && !schemaExtra.includes('FAQPage')) {
      schemaExtra.push('FAQPage');
    }
  }

  const schema = resolveSchema({
    pageType,
    registryEntry: registryEntry,
    extra: schemaExtra,
  });

  return {
    title: meta.title,
    description: meta.description,
    canonical,
    robots,
    openGraph,
    twitter,
    breadcrumb,
    schema,
    pageType,
    keywords,
    ogImage: image,
  };
}

function resolvePageType(
  explicit: PageType | undefined,
  registryEntry: SeoRouteDefinition | undefined,
  entity: SeoEntityLike | undefined,
): PageType {
  if (explicit) return explicit;
  if (entity) return PageType.PROPERTY;
  if (registryEntry) return registryEntry.pageType;
  return PageType.NOT_FOUND;
}

function buildNotFound(origin: string, site: SiteConfigLike): SeoMetadata {
  const title = 'Không tìm thấy trang | Estoria';
  const description = 'Trang bạn yêu cầu không tồn tại hoặc đã được gỡ khỏi BDSDanang.site.';
  const canonical = resolveCanonical({ path: '/', origin });
  const robots = resolveRobots({ noindex: true });
  const image = `${origin}${site.ogImage.startsWith('/') ? site.ogImage : `/${site.ogImage}`}`;
  return {
    title,
    description,
    canonical,
    robots,
    openGraph: resolveOg({ title, description, url: canonical, type: 'website', image }),
    twitter: resolveTwitter({ title, description, image }),
    breadcrumb: [{ name: site.name, path: '/' }],
    schema: [],
    pageType: PageType.NOT_FOUND,
  };
}
