import type { SeoMetadata } from '../types/SeoMetadata';
import type { SeoContent } from '../types/SeoContent';
import { getSeoContentRecord } from '../data/seoContentRegistry';
import { getBreadcrumbRecord } from '../data/breadcrumbRegistry';
import { getKeywordClusterRecord } from '../data/keywordClusters';
import { getFaqQaPairs, getFaqSetRecord } from '../data/faqRegistry';
import { resolveInternalLinks } from '../services/resolveInternalLinks';
import { normalizePathname } from '../utils/normalizeCanonical';
import { isPublishableSeoContent } from './publishableTypes';

export type PublishedPageEnrichment = {
  content: SeoContent;
  breadcrumbs?: { name: string; path: string }[];
  keywords?: string[];
  faqs: { question: string; answer: string }[];
  schemaExtra: SeoMetadata['schema'];
  relatedLinks: { href: string; label?: string }[];
};

/**
 * Auto-enrich a registry page from the SEO Data Layer.
 */
export function enrichPublishedPage(pathname: string): PublishedPageEnrichment | null {
  const content = getSeoContentRecord(normalizePathname(pathname));
  if (!content || !isPublishableSeoContent(content)) return null;

  const breadcrumbs = content.breadcrumbId
    ? getBreadcrumbRecord(content.breadcrumbId)?.items
    : undefined;

  const cluster = content.keywordClusterId
    ? getKeywordClusterRecord(content.keywordClusterId)
    : undefined;
  const keywords = cluster
    ? [cluster.primaryKeyword, ...cluster.secondaryKeywords]
    : content.keywords
      ? [...content.keywords]
      : undefined;

  const faqs = content.faqId ? getFaqQaPairs(content.faqId) : [];
  const faqSet = content.faqId ? getFaqSetRecord(content.faqId) : undefined;
  const schemaExtra: SeoMetadata['schema'] = [...(content.schemaType || [])];
  if (faqSet?.items.some(item => item.schemaEligible !== false) && faqs.length) {
    if (!schemaExtra.includes('FAQPage')) schemaExtra.push('FAQPage');
  }

  const links = resolveInternalLinks({ slug: content.slug });
  const relatedLinks = links.related.map(item => ({
    href: item.slug,
    label: item.label,
  }));

  return {
    content,
    breadcrumbs,
    keywords,
    faqs,
    schemaExtra,
    relatedLinks,
  };
}

export function lookupFaqsForSeoPath(pathname: string): { question: string; answer: string }[] {
  const content = getSeoContentRecord(normalizePathname(pathname));
  if (!content?.faqId) return [];
  return getFaqQaPairs(content.faqId);
}
