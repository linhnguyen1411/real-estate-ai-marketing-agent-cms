import type { SeoContent } from '../types/SeoContent';
import { listSeoContentRecords, getSeoContentRecord } from '../data/seoContentRegistry';
import { normalizePathname } from '../utils/normalizeCanonical';
import { isPublishableSeoContent } from './publishableTypes';

export type PublishableSeoRoute = {
  slug: string;
  pageType: SeoContent['pageType'];
  priority: number;
  content: SeoContent;
};

/**
 * Dynamic route registration — every publishable SeoContent entry is a routable SEO page.
 * Existing Express SSR already resolves these via seoRouteRegistry ← seoContentRegistry.
 */
export function listPublishableSeoRoutes(): PublishableSeoRoute[] {
  return listSeoContentRecords()
    .filter(isPublishableSeoContent)
    .map(content => ({
      slug: normalizePathname(content.slug),
      pageType: content.pageType,
      priority: content.priority,
      content,
    }));
}

export function getPublishableSeoRoute(pathname: string): PublishableSeoRoute | undefined {
  const content = getSeoContentRecord(pathname);
  if (!content || !isPublishableSeoContent(content)) return undefined;
  return {
    slug: normalizePathname(content.slug),
    pageType: content.pageType,
    priority: content.priority,
    content,
  };
}

export function listPublishableSeoPaths(): string[] {
  return listPublishableSeoRoutes().map(route => route.slug);
}

export function isPublishableSeoPath(pathname: string): boolean {
  return Boolean(getPublishableSeoRoute(pathname));
}
