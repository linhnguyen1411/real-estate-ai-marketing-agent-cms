import type { SeoMetadata } from '../types/SeoMetadata';
import { getSeoContentRecord } from '../data/seoContentRegistry';
import { getInternalLinkNodeRecord } from '../data/internalLinks';
import { resolveEntity } from '../services/resolveEntity';
import { resolveKeywordCluster } from '../services/resolveKeywordCluster';
import { resolveFaq } from '../services/resolveFaq';
import { resolveBreadcrumb } from '../services/resolveBreadcrumb';
import { resolveInternalLinks } from '../services/resolveInternalLinks';
import { templateKindForPageType } from '../data/templateSections';
import type { FaqItem } from '../types/SeoContent';
import type { KeywordCluster } from '../types/KeywordCluster';
import type { SeoTemplateContext, TemplateLink } from './types';

export type BuildTemplateContextInput = {
  seo: SeoMetadata;
  /** Route path for content registry lookup */
  path?: string;
};

/**
 * Assemble template context from Engine metadata + Data Layer resolvers.
 */
export function buildTemplateContext(input: BuildTemplateContextInput): SeoTemplateContext | null {
  const kind = templateKindForPageType(input.seo.pageType);
  if (!kind) return null;

  const path = input.path || pathFromCanonical(input.seo.canonical) || '/';
  const content = getSeoContentRecord(path);

  const entity = content?.entityId
    ? resolveEntity({ id: content.entityId, expand: true })
    : undefined;

  const clusterResult = content?.keywordClusterId
    ? resolveKeywordCluster({ id: content.keywordClusterId })
    : undefined;
  const cluster = (clusterResult && !Array.isArray(clusterResult)
    ? clusterResult
    : undefined) as KeywordCluster | undefined;

  const faqResult = content?.faqId
    ? resolveFaq({ faqId: content.faqId })
    : resolveFaq({ pageType: input.seo.pageType });
  const faqs: FaqItem[] = Array.isArray(faqResult)
    ? faqResult
    : faqResult?.items || [];

  const breadcrumb = resolveBreadcrumb({
    breadcrumbId: content?.breadcrumbId,
    pageSlug: path,
  }) || (input.seo.breadcrumb.length
    ? { id: 'bc-seo', items: input.seo.breadcrumb }
    : undefined);

  const internalLinks = resolveInternalLinks({ slug: path });

  const relatedPages = toLinks(content?.relatedPages || []);
  const moneyPages = toLinks(content?.moneyPages || []);

  const childSlugs = internalLinks.node?.childSlugs || [];
  const collectionItems: TemplateLink[] = childSlugs.map(slug => {
    const node = getInternalLinkNodeRecord(slug);
    const page = getSeoContentRecord(slug);
    return {
      href: slug,
      label: node?.label || page?.defaultTitle || slug,
    };
  });

  const relatedEntities = [
    ...(entity?.children || []),
    ...(entity?.related || []),
  ];

  return {
    kind,
    seo: input.seo,
    content,
    entity,
    relatedEntities,
    cluster,
    faqs,
    breadcrumb,
    internalLinks,
    relatedPages,
    moneyPages,
    collectionItems,
    comparisonColumns: relatedEntities.slice(0, 3).map(e => e.name),
  };
}

function toLinks(slugs: string[]): TemplateLink[] {
  return slugs.map(slug => {
    const node = getInternalLinkNodeRecord(slug);
    const page = getSeoContentRecord(slug);
    return {
      href: slug,
      label: node?.label || page?.defaultTitle || slug,
    };
  });
}

function pathFromCanonical(canonical: string): string | undefined {
  try {
    const url = new URL(canonical);
    return url.pathname || '/';
  } catch {
    if (canonical.startsWith('/')) return canonical;
    return undefined;
  }
}
