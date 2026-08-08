/**
 * Parent → child project matching for portfolio pages.
 *
 * Properties live in CmsRecord JSON (`project_name`, title, …) — not a dedicated
 * `projectSlug` column. Matching uses slug tokens + human project labels.
 */

import { matchMarketZone } from './propertyCatalog';

export const SUN_GROUP_PORTFOLIO_SLUGS = ['du-an-sun-group-da-nang', 'sun-group'] as const;

/** Nam Đà Nẵng segment — new SEO slug + legacy short slug */
export const NAM_DA_NANG_PORTFOLIO_SLUGS = ['bat-dong-san-nam-da-nang', 'nam-da-nang'] as const;

/** BĐS nổi bật segment — new SEO slug + legacy short slug */
export const NOI_BAT_PORTFOLIO_SLUGS = ['bat-dong-san-da-nang-noi-bat', 'bds-noi-bat'] as const;

/**
 * Child identity slugs under the Sun Group parent portfolio.
 * Includes tower-level tokens found in titles / future project_name values.
 */
export const SUN_GROUP_CHILD_PROJECT_SLUGS = [
  'sun-symphony',
  'sun-symphony-residence',
  'cora-tower',
  'spana-tower',
  'slight-tower',
  's-light-tower',
  'the-sonata',
  'sun-cosmo',
  'sun-ponte',
] as const;

/** Human `project_name` labels used in the CMS catalog */
export const SUN_GROUP_PROJECT_LABELS = [
  'Sun Symphony',
  'Sun Symphony Residence',
  'S Light Tower',
  'Sun Cosmo',
  'Sun Ponte',
  'Sun Cora',
  'Sun Spana',
  'Sun FourS',
  'Cora Tower',
  'Spana Tower',
] as const;

const SLUG_TO_PATTERNS: Record<string, RegExp[]> = {
  'sun-symphony': [/sun\s*symphony/i, /symphony\s*residence/i],
  'sun-symphony-residence': [/sun\s*symphony/i, /symphony\s*residence/i],
  'cora-tower': [/\bcora\b/i],
  'spana-tower': [/\bspana\b/i],
  'slight-tower': [/s[\s-]?light/i],
  's-light-tower': [/s[\s-]?light/i],
  'the-sonata': [/\bsonata\b/i],
  'sun-cosmo': [/sun\s*cosmo|\bcosmo\b/i],
  'sun-ponte': [/sun\s*ponte|\bponte\b/i],
};

/** Broad Sun Group haystack (parent portfolio) */
const SUN_GROUP_ANY_PATTERNS: RegExp[] = [
  /sun\s*group/i,
  /sun\s*symphony/i,
  /sun\s*cosmo/i,
  /sun\s*ponte/i,
  /sun\s*fours|four\s*s/i,
  /\bcora\b/i,
  /\bspana\b/i,
  /s[\s-]?light/i,
  /\bsonata\b/i,
];

export type PortfolioPropertyLike = {
  title?: string | null;
  type?: string | null;
  location?: string | null;
  description?: string | null;
  rich_description?: string | null;
  project_name?: string | null;
  developer?: string | null;
  projectSlug?: string | null;
  project_slug?: string | null;
  market_zone?: string | null;
  is_featured?: boolean | null;
};

function compact(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function propertyProjectHaystack(property: PortfolioPropertyLike): string {
  return [
    property.project_name,
    property.projectSlug,
    property.project_slug,
    property.developer,
    property.title,
    property.type,
    property.location,
    property.description,
    property.rich_description,
  ]
    .map(compact)
    .filter(Boolean)
    .join(' ');
}

export function isSunGroupPortfolioSlug(slug: string | null | undefined): boolean {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return (SUN_GROUP_PORTFOLIO_SLUGS as readonly string[]).includes(normalized);
}

export function isNamDaNangPortfolioSlug(slug: string | null | undefined): boolean {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return (NAM_DA_NANG_PORTFOLIO_SLUGS as readonly string[]).includes(normalized);
}

export function isNoiBatPortfolioSlug(slug: string | null | undefined): boolean {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return (NOI_BAT_PORTFOLIO_SLUGS as readonly string[]).includes(normalized);
}

export function isSunGroupChildProjectSlug(slug: string | null | undefined): boolean {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return (SUN_GROUP_CHILD_PROJECT_SLUGS as readonly string[]).includes(normalized);
}

/** Tokens suitable for Prisma `searchText contains` OR filters */
export function getSunGroupSearchTokens(): string[] {
  return [
    'Sun Group',
    'Sun Symphony',
    'Sun Cosmo',
    'Sun Ponte',
    'Cora',
    'Spana',
    'S Light',
    'S-Light',
    'Sonata',
    'FourS',
    ...SUN_GROUP_PROJECT_LABELS,
  ].filter((token, index, all) => all.findIndex(t => t.toLowerCase() === token.toLowerCase()) === index);
}

export function matchesSunGroupProperty(property: PortfolioPropertyLike): boolean {
  const slug = compact(property.projectSlug || property.project_slug).toLowerCase();
  if (slug && (isSunGroupChildProjectSlug(slug) || isSunGroupPortfolioSlug(slug))) {
    return true;
  }

  const label = compact(property.project_name);
  if (label) {
    const labelLower = label.toLowerCase();
    if (SUN_GROUP_PROJECT_LABELS.some(name => name.toLowerCase() === labelLower)) {
      return true;
    }
    // Catalog bucket often used for Sun shophouse inventory
    if (/shophouse/i.test(label) && SUN_GROUP_ANY_PATTERNS.some(p => p.test(propertyProjectHaystack(property)))) {
      return true;
    }
  }

  const developer = compact(property.developer);
  if (developer && /sun\s*group/i.test(developer)) return true;

  return SUN_GROUP_ANY_PATTERNS.some(pattern => pattern.test(propertyProjectHaystack(property)));
}

export function matchesNamDaNangProperty(property: PortfolioPropertyLike): boolean {
  return matchMarketZone(
    {
      market_zone: property.market_zone || undefined,
      location: property.location || undefined,
      project_name: property.project_name || undefined,
    },
    'nam-da-nang',
  );
}

/** BĐS nổi bật = CMS “Gắn nổi bật” (`is_featured`). */
export function matchesNoiBatProperty(property: PortfolioPropertyLike): boolean {
  return Boolean(property.is_featured);
}

export function matchesChildProjectSlug(
  property: PortfolioPropertyLike,
  childSlug: string,
): boolean {
  const normalized = childSlug.trim().toLowerCase();
  const propertySlug = compact(property.projectSlug || property.project_slug).toLowerCase();
  if (propertySlug && propertySlug === normalized) return true;

  const patterns = SLUG_TO_PATTERNS[normalized];
  if (!patterns?.length) return false;
  return patterns.some(pattern => pattern.test(propertyProjectHaystack(property)));
}

/**
 * Portfolio / project page filter.
 * - `du-an-sun-group-da-nang` | `sun-group` → all Sun Group children
 * - child slug → only that tower/project
 * - `bat-dong-san-nam-da-nang` → market zone Nam Đà Nẵng
 * - `bat-dong-san-da-nang-noi-bat` → `is_featured`
 */
export function matchesPortfolioProject(
  property: PortfolioPropertyLike,
  projectSlug: string | null | undefined,
): boolean {
  const slug = String(projectSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return true;
  if (isSunGroupPortfolioSlug(slug)) return matchesSunGroupProperty(property);
  if (isSunGroupChildProjectSlug(slug)) return matchesChildProjectSlug(property, slug);
  if (isNamDaNangPortfolioSlug(slug)) return matchesNamDaNangProperty(property);
  if (isNoiBatPortfolioSlug(slug)) return matchesNoiBatProperty(property);
  return false;
}

/** Prisma `CmsRecord` where-clause for Sun Group parent portfolio (searchText OR). */
export function buildSunGroupCmsRecordWhere(): {
  collection: 'properties';
  OR: Array<{ searchText: { contains: string; mode: 'insensitive' } }>;
} {
  return {
    collection: 'properties',
    OR: getSunGroupSearchTokens().map(token => ({
      searchText: { contains: token, mode: 'insensitive' as const },
    })),
  };
}
