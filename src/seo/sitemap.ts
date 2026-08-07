import { Property } from '../types';
import { getPublicPropertySlug } from '../utils/propertyShare';
import { listPublishableSeoRoutes } from './publishing/registerSeoRoutes';
import { isPublishableSeoContent } from './publishing/publishableTypes';
import { listSeoContentRecords } from './data/seoContentRegistry';
import { PageType } from './types/PageType';
import type { SeoContent } from './types/SeoContent';
import { SITE } from './siteConfig';

export interface SitemapEntry {
  loc: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
  lastmod?: string;
}

export type SitemapBlogPost = {
  slug: string;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type GenerateSitemapXmlInput = {
  origin?: string;
  properties?: Property[];
  posts?: SitemapBlogPost[];
};

/**
 * Sitemap generation — driven by SEO Content / Publishing Registry (SSOT).
 * No hardcoded URL lists. Every publishable SeoContent entry is included automatically.
 */
export function buildSitemapEntries(origin: string, properties: Property[]): {
  pages: SitemapEntry[];
  properties: SitemapEntry[];
  projects: SitemapEntry[];
  landings: SitemapEntry[];
  posts: SitemapEntry[];
} {
  const base = origin.replace(/\/+$/, '');
  const now = new Date().toISOString().slice(0, 10);

  const pages: SitemapEntry[] = [
    { loc: base, changefreq: 'daily', priority: 1.0, lastmod: now },
  ];
  const projects: SitemapEntry[] = [];
  /** Kept for route-handler compat; publishable pages go to `pages`/`projects`. */
  const landings: SitemapEntry[] = [];
  const knownLocs = new Set<string>([base]);

  // 1) Publishing Registry — every publishable SeoContent record
  for (const route of listPublishableSeoRoutes()) {
    if (route.slug === '/') continue;
    const loc = `${base}${route.slug}`;
    if (knownLocs.has(loc)) continue;

    const entry: SitemapEntry = {
      loc,
      changefreq: 'weekly',
      priority: clampPriority(route.priority, route.pageType),
      lastmod: now,
    };

    if (route.pageType === PageType.PROJECT) {
      projects.push(entry);
    } else {
      // CATALOG / FINANCIAL / COMPARISON / LEGAL / LOCATION → sitemap-pages.xml
      pages.push(entry);
    }
    knownLocs.add(loc);
  }

  // 2) Remaining registry pages (e.g. ARTICLE landings) not in publishable types
  for (const content of listSeoContentRecords()) {
    if (content.slug === '/') continue;
    if (isPublishableSeoContent(content)) continue;
    const loc = `${base}${normalizeSlug(content.slug)}`;
    if (knownLocs.has(loc)) continue;

    const entry: SitemapEntry = {
      loc,
      changefreq: 'weekly',
      priority: clampPriority(content.priority, content.pageType),
      lastmod: now,
    };

    bucketNonPublishable(content, entry, { pages, projects, landings });
    knownLocs.add(loc);
  }

  const propertyEntries: SitemapEntry[] = properties
    .filter(p => !['sold', 'hidden'].includes(p.sale_status || 'available'))
    .map(property => ({
      loc: `${base}/${encodeURIComponent(getPublicPropertySlug(property))}`,
      changefreq: 'weekly' as const,
      priority: 0.8,
      lastmod: property.last_public_view_at?.slice(0, 10) || now,
    }));

  const posts: SitemapEntry[] = [];

  return { pages, properties: propertyEntries, projects, landings, posts };
}

/**
 * Full Sitemap 0.9 urlset for `/sitemap.xml`.
 * Driven by SEO Publishing Registry + active properties + optional blog posts.
 * No hardcoded URL lists.
 */
export async function generateSitemapXml(input: GenerateSitemapXmlInput = {}): Promise<string> {
  const origin = (input.origin || SITE.url).replace(/\/+$/, '');
  const properties = input.properties || [];
  const now = new Date().toISOString().slice(0, 10);
  const { pages, landings, projects, properties: propertyEntries } = buildSitemapEntries(origin, properties);

  const postEntries: SitemapEntry[] = [
    { loc: `${origin}/tin-tuc`, changefreq: 'daily', priority: 0.85, lastmod: now },
    ...(input.posts || []).map(post => ({
      loc: `${origin}/tin-tuc/${encodeURIComponent(post.slug)}`,
      changefreq: 'weekly' as const,
      priority: 0.75,
      lastmod: toSitemapDate(post.updatedAt || post.publishedAt) || now,
    })),
  ];

  const allEntries = dedupeEntries([
    ...pages,
    ...landings,
    ...projects,
    ...propertyEntries,
    ...postEntries,
  ]);

  return entriesToXml(allEntries);
}

function toSitemapDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function dedupeEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);
    out.push(entry);
  }
  return out;
}

function bucketNonPublishable(
  content: SeoContent,
  entry: SitemapEntry,
  buckets: { pages: SitemapEntry[]; projects: SitemapEntry[]; landings: SitemapEntry[] },
): void {
  if (content.pageType === PageType.PROJECT || content.group === 'project') {
    buckets.projects.push(entry);
    return;
  }
  if (content.group === 'landing') {
    // Still merged into sitemap-pages.xml by the route handler ([...pages, ...landings])
    buckets.landings.push(entry);
    return;
  }
  buckets.pages.push(entry);
}

function clampPriority(priority: number, pageType: PageType): number {
  if (pageType === PageType.LEGAL) return Math.min(priority, 0.3);
  if (pageType === PageType.PROJECT) return Math.min(1, Math.max(0.85, priority));
  return Math.min(1, Math.max(0.3, priority));
}

function normalizeSlug(slug: string): string {
  if (!slug) return '/';
  return slug.startsWith('/') ? slug : `/${slug}`;
}

export function entriesToXml(entries: SitemapEntry[]) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(entry => [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : '',
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
  ].join('\n');
}

export function sitemapIndexXml(origin: string) {
  const base = origin.replace(/\/+$/, '');
  const maps = ['sitemap-pages.xml', 'sitemap-properties.xml', 'sitemap-projects.xml', 'sitemap-posts.xml'];
  const now = new Date().toISOString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...maps.map(name => [
      '  <sitemap>',
      `    <loc>${escapeXml(`${base}/${name}`)}</loc>`,
      `    <lastmod>${now}</lastmod>`,
      '  </sitemap>',
    ].join('\n')),
    '</sitemapindex>',
  ].join('\n');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
