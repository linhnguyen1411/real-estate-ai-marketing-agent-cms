import { getSeoRouteByPath, getAllSeoRoutePaths, SEO_ROUTE_REGISTRY } from './registry/seoRouteRegistry';
import { resolveSeo } from './engine/resolveSeo';
import { SITE } from './siteConfig';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  ogType?: 'website' | 'article' | 'product';
}

function entryToPageMeta(entry: (typeof SEO_ROUTE_REGISTRY)[number]): PageMeta {
  return {
    path: entry.slug,
    title: entry.defaultTitle,
    description: entry.defaultDescription,
    keywords: entry.keywords ? [...entry.keywords] : undefined,
    ogType: entry.ogType,
  };
}

/**
 * Static page metadata derived from the SEO Engine registry (SSOT).
 * Shape preserved for existing callers.
 */
export const STATIC_PAGES: PageMeta[] = SEO_ROUTE_REGISTRY
  .filter(entry => entry.group === 'static')
  .map(entryToPageMeta);

export const PROJECT_PAGES: PageMeta[] = SEO_ROUTE_REGISTRY
  .filter(entry => entry.group === 'project')
  .map(entryToPageMeta);

export const LANDING_PAGES: PageMeta[] = SEO_ROUTE_REGISTRY
  .filter(entry => entry.group === 'landing')
  .map(entryToPageMeta);

export function getPageMetaByPath(pathname: string): PageMeta | undefined {
  const entry = getSeoRouteByPath(pathname);
  if (!entry) return undefined;

  const resolved = resolveSeo({
    route: entry.slug,
    pageType: entry.pageType,
    siteConfig: SITE,
  });
  if (!resolved) return entryToPageMeta(entry);

  return {
    path: entry.slug,
    title: resolved.title,
    description: resolved.description,
    keywords: resolved.keywords,
    ogType: (resolved.openGraph.type as PageMeta['ogType']) || entry.ogType,
  };
}

export function getAllStaticPaths(): string[] {
  return getAllSeoRoutePaths();
}
