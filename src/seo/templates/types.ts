import type { SeoMetadata } from '../types/SeoMetadata';
import type { SeoContent, FaqItem, BreadcrumbDefinition } from '../types/SeoContent';
import type { Entity } from '../types/Entity';
import type { KeywordCluster } from '../types/KeywordCluster';
import type { ResolvedInternalLinks } from '../services/resolveInternalLinks';
import type { TemplateKind } from '../data/templateSections';

export type TemplateLink = {
  href: string;
  label: string;
};

/**
 * Inputs for every SEO page template — all from Engine + Data Layer.
 */
export type SeoTemplateContext = {
  kind: TemplateKind;
  seo: SeoMetadata;
  content?: SeoContent;
  entity?: Entity;
  relatedEntities?: Entity[];
  cluster?: KeywordCluster;
  faqs: FaqItem[];
  breadcrumb?: BreadcrumbDefinition;
  internalLinks: ResolvedInternalLinks;
  relatedPages: TemplateLink[];
  moneyPages: TemplateLink[];
  /** Optional collection members (child / related pages) */
  collectionItems?: TemplateLink[];
  /** Optional comparison columns derived from related entities */
  comparisonColumns?: string[];
};
