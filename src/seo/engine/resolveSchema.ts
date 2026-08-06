import { PageType } from '../types/PageType';
import type { SchemaType } from '../types/SeoMetadata';
import type { SeoRouteDefinition } from '../registry/seoRouteRegistry';

export type ResolveSchemaInput = {
  pageType: PageType;
  registryEntry?: SeoRouteDefinition;
  /** Extra schema labels (e.g. FAQ when page provides FAQs later). */
  extra?: SchemaType[];
};

/**
 * Schema type selection — single place only.
 * Does NOT generate JSON-LD.
 */
export function resolveSchema(input: ResolveSchemaInput): SchemaType[] {
  if (input.registryEntry?.schemaType?.length) {
    return dedupe([...(input.registryEntry.schemaType), ...(input.extra || [])]);
  }

  switch (input.pageType) {
    case PageType.HOME:
      return dedupe(['defaultPage', ...(input.extra || [])]);
    case PageType.PROPERTY:
      return dedupe(['defaultPage', 'BreadcrumbList', 'property', ...(input.extra || [])]);
    case PageType.PROJECT:
    case PageType.ARTICLE:
      return dedupe(['defaultPage', 'BreadcrumbList', 'Article', ...(input.extra || [])]);
    case PageType.LEGAL:
      return dedupe(['defaultPage', 'BreadcrumbList', ...(input.extra || [])]);
    case PageType.NOT_FOUND:
      return [];
    default:
      return dedupe(['defaultPage', 'BreadcrumbList', ...(input.extra || [])]);
  }
}

function dedupe(items: SchemaType[]): SchemaType[] {
  return Array.from(new Set(items));
}
