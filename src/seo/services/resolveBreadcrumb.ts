import type { BreadcrumbDefinition } from '../types/SeoContent';
import { getBreadcrumbRecord, listBreadcrumbRecords } from '../data/breadcrumbRegistry';
import { getSeoContentRecord } from '../data/seoContentRegistry';
import { normalizePathname } from '../utils/normalizeCanonical';

export type ResolveBreadcrumbFromRegistryInput = {
  breadcrumbId?: string;
  /** Lookup breadcrumbId via SEO content registry */
  pageSlug?: string;
};

/**
 * Pure breadcrumb registry resolver.
 * Distinct from engine/resolveBreadcrumb (algorithmic path crumbs for SSR).
 */
export function resolveBreadcrumb(
  input: ResolveBreadcrumbFromRegistryInput,
): BreadcrumbDefinition | undefined {
  if (input.breadcrumbId) return getBreadcrumbRecord(input.breadcrumbId);

  if (input.pageSlug) {
    const content = getSeoContentRecord(normalizePathname(input.pageSlug));
    if (content?.breadcrumbId) return getBreadcrumbRecord(content.breadcrumbId);
  }

  return undefined;
}

export function resolveAllBreadcrumbs(): readonly BreadcrumbDefinition[] {
  return listBreadcrumbRecords();
}
