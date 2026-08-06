import type { PageType } from '../types/PageType';
import type { SchemaType } from '../types/SeoMetadata';
import {
  getSeoContentRecord,
  listSeoContentPaths,
  listSeoContentRecords,
} from '../data/seoContentRegistry';
import { normalizePathname } from '../utils/normalizeCanonical';

/**
 * Runtime route shape — derived from SEO Content Registry (data layer SSOT).
 * Kept for engine / pageMeta compatibility; do not duplicate titles here.
 */
export interface SeoRouteDefinition {
  slug: string;
  pageType: PageType;
  template?: string;
  defaultTitle: string;
  defaultDescription: string;
  schemaType: SchemaType[];
  priority: number;
  ogType?: 'website' | 'article' | 'product';
  keywords?: string[];
  group: 'static' | 'project' | 'landing';
}

function toRoute(entry: ReturnType<typeof listSeoContentRecords>[number]): SeoRouteDefinition {
  return {
    slug: entry.slug,
    pageType: entry.pageType,
    template: entry.template,
    defaultTitle: entry.defaultTitle,
    defaultDescription: entry.defaultDescription,
    schemaType: entry.schemaType,
    priority: entry.priority,
    ogType: entry.ogType,
    keywords: entry.keywords,
    group: entry.group,
  };
}

/** @deprecated Prefer listSeoContentRecords — alias for compatibility */
export const SEO_ROUTE_REGISTRY: SeoRouteDefinition[] = listSeoContentRecords().map(toRoute);

export function getSeoRouteByPath(pathname: string): SeoRouteDefinition | undefined {
  const content = getSeoContentRecord(pathname);
  return content ? toRoute(content) : undefined;
}

export function getAllSeoRoutePaths(): string[] {
  return listSeoContentPaths();
}

export function getSeoRouteNormalizedPath(pathname: string): string {
  return normalizePathname(pathname);
}
