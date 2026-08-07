import type { PageType } from './PageType';

/** Schema.org @type labels only — engine does not emit JSON-LD. */
export type SchemaType =
  | 'RealEstateAgent'
  | 'WebSite'
  | 'LocalBusiness'
  | 'Person'
  | 'BreadcrumbList'
  | 'Article'
  | 'FAQPage'
  | 'Place'
  | 'Apartment'
  | 'Residence'
  | 'Product'
  | 'CollectionPage'
  /** Composition label → maps to buildDefaultPageSchemas callers */
  | 'defaultPage'
  /** Composition label → maps to buildPropertySchemas callers */
  | 'property';

export interface OpenGraphMeta {
  title: string;
  description: string;
  url: string;
  type: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  locale?: string;
  siteName?: string;
}

export interface TwitterMeta {
  card: string;
  title: string;
  description: string;
  image?: string;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  openGraph: OpenGraphMeta;
  twitter: TwitterMeta;
  breadcrumb: BreadcrumbItem[];
  /** Selected schema types only — do not generate JSON here. */
  schema: SchemaType[];
  pageType: PageType;
  keywords?: string[];
  ogImage?: string;
}
