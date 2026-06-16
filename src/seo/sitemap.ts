import { Property } from '../types';
import { getPublicPropertySlug } from '../utils/propertyShare';
import { LANDING_PAGES, PROJECT_PAGES, STATIC_PAGES } from './pageMeta';

export interface SitemapEntry {
  loc: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
  lastmod?: string;
}

export function buildSitemapEntries(origin: string, properties: Property[]): {
  pages: SitemapEntry[];
  properties: SitemapEntry[];
  projects: SitemapEntry[];
  landings: SitemapEntry[];
  posts: SitemapEntry[];
} {
  const base = origin.replace(/\/+$/, '');
  const now = new Date().toISOString().slice(0, 10);

  const staticOnlyPaths = STATIC_PAGES.map(p => p.path).filter(p => p !== '/');
  const pages: SitemapEntry[] = [
    { loc: base, changefreq: 'daily', priority: 1.0, lastmod: now },
    ...staticOnlyPaths.map(path => ({
      loc: `${base}${path}`,
      changefreq: 'weekly' as const,
      priority: path.includes('chinh-sach') || path.includes('dieu-khoan') ? 0.3 : 0.8,
      lastmod: now,
    })),
  ];

  const projects: SitemapEntry[] = PROJECT_PAGES.map(p => ({
    loc: `${base}${p.path}`,
    changefreq: 'weekly' as const,
    priority: 0.85,
    lastmod: now,
  }));

  const landings: SitemapEntry[] = LANDING_PAGES.map(p => ({
    loc: `${base}${p.path}`,
    changefreq: 'weekly' as const,
    priority: 0.9,
    lastmod: now,
  }));

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
