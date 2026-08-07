import type { PageType } from './PageType';
import type { SchemaType } from './SeoMetadata';

/**
 * Typed SEO page content descriptor — SSOT for static page SEO knowledge.
 */
export interface SeoContent {
  /** Route path, e.g. `/` or `/can-ho-cao-cap-da-nang` */
  slug: string;
  pageType: PageType;
  entityId?: string;
  template?: string;
  schemaType: SchemaType[];
  defaultTitle: string;
  defaultDescription: string;
  faqId?: string;
  breadcrumbId?: string;
  keywordClusterId?: string;
  relatedPages?: string[];
  moneyPages?: string[];
  priority: number;
  ogType?: 'website' | 'article' | 'product';
  keywords?: string[];
  /** Historical pageMeta bucket */
  group: 'static' | 'project' | 'landing';
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  entityIds?: string[];
  pageTypes?: PageType[];
  /** Eligible for FAQPage JSON-LD */
  schemaEligible?: boolean;
}

export interface FaqSet {
  id: string;
  items: FaqItem[];
  entityIds?: string[];
  pageTypes?: PageType[];
}

export interface BreadcrumbDefinition {
  id: string;
  /** Ordered crumb paths (last is current page) */
  items: { name: string; path: string }[];
}
