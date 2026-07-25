import type { Property } from '../../types';
import {
  getPropertyProjectLabel,
  matchMarketZone,
  matchProjectName,
} from '../../seo/propertyCatalog';

export const PRICE_RANGES = [
  { value: 'all', label: 'Tất cả mức giá' },
  { value: 'under3', label: 'Dưới 3 tỷ' },
  { value: '3to5', label: '3–5 tỷ' },
  { value: '5to10', label: '5–10 tỷ' },
  { value: 'over10', label: 'Trên 10 tỷ' },
] as const;

export const AREA_RANGES = [
  { value: 'all', label: 'Tất cả diện tích' },
  { value: 'under80', label: 'Dưới 80 m²' },
  { value: '80to150', label: '80–150 m²' },
  { value: 'over150', label: 'Trên 150 m²' },
] as const;

/** Canonical catalog root — path SSOT for listing hubs. */
export const LISTING_CATALOG_ROOT = '/bat-dong-san';

/** Path facets under /bat-dong-san/:facet */
export type ListingFacetKind = 'type' | 'zone' | 'project' | 'keyword';

export interface ListingFacetDef {
  slug: string;
  kind: ListingFacetKind;
  label: string;
  /** Soft type substring (legacy CategoryListingsPage) */
  typeIncludes?: string;
  marketZone?: string;
  /** Match project_name / label (case-insensitive contains or exact after normalize) */
  projectMatch?: string;
  /** Free-text keyword applied like q */
  keyword?: string;
}

export const LISTING_FACETS: ListingFacetDef[] = [
  { slug: 'can-ho', kind: 'type', label: 'Căn hộ', typeIncludes: 'căn' },
  { slug: 'dat-nen', kind: 'type', label: 'Đất nền', typeIncludes: 'đất' },
  { slug: 'nha-pho', kind: 'type', label: 'Nhà phố', typeIncludes: 'nhà' },
  { slug: 'nam-da-nang', kind: 'zone', label: 'Nam Đà Nẵng', marketZone: 'nam-da-nang' },
  { slug: 'fpt-city', kind: 'zone', label: 'FPT City', marketZone: 'fpt-city' },
  { slug: 'mai-dang-chon', kind: 'project', label: 'Mai Đăng Chơn', projectMatch: 'Mai Đăng Chơn' },
  { slug: 'sun-symphony', kind: 'project', label: 'Sun Symphony', projectMatch: 'Sun Symphony' },
  { slug: 'sun-cosmo', kind: 'project', label: 'Sun Cosmo', projectMatch: 'Sun Cosmo' },
  { slug: 'sun-ponte', kind: 'project', label: 'Sun Ponte', projectMatch: 'Sun Ponte' },
  { slug: 'hoa-xuan', kind: 'project', label: 'Hòa Xuân', projectMatch: 'Hòa Xuân' },
];

export const LISTING_FACET_BY_SLUG = Object.fromEntries(
  LISTING_FACETS.map(f => [f.slug, f]),
) as Record<string, ListingFacetDef>;

/** Old top-level hubs → canonical nested paths */
export const LEGACY_LISTING_REDIRECTS: Record<string, string> = {
  '/can-ho': `${LISTING_CATALOG_ROOT}/can-ho`,
  '/dat-nen': `${LISTING_CATALOG_ROOT}/dat-nen`,
  '/nha-pho': `${LISTING_CATALOG_ROOT}/nha-pho`,
  '/nam-da-nang': `${LISTING_CATALOG_ROOT}/nam-da-nang`,
  '/listings': LISTING_CATALOG_ROOT,
};

export interface ListingFilterState {
  q: string;
  type: string;
  transaction: string;
  price: string;
  area: string;
  project: string;
  district: string;
  page: number;
}

export const EMPTY_LISTING_FILTERS: ListingFilterState = {
  q: '',
  type: 'all',
  transaction: 'all',
  price: 'all',
  area: 'all',
  project: 'all',
  district: '',
  page: 1,
};

const PRICE_ALIASES: Record<string, string> = {
  'under-3': 'under3',
  '3-5': '3to5',
  '5-10': '5to10',
  'over-10': 'over10',
  under3: 'under3',
  '3to5': '3to5',
  '5to10': '5to10',
  over10: 'over10',
};

const AREA_ALIASES: Record<string, string> = {
  'under-80': 'under80',
  '80-150': '80to150',
  'over-150': 'over150',
  under80: 'under80',
  '80to150': '80to150',
  over150: 'over150',
  '100-200': '80to150',
};

function normalizePrice(raw: string | null): string {
  if (!raw || raw === 'all') return 'all';
  return PRICE_ALIASES[raw] || PRICE_ALIASES[raw.toLowerCase()] || raw;
}

function normalizeArea(raw: string | null): string {
  if (!raw || raw === 'all') return 'all';
  return AREA_ALIASES[raw] || AREA_ALIASES[raw.toLowerCase()] || raw;
}

export function parseListingSearchParams(params: URLSearchParams): ListingFilterState {
  const pageRaw = Number(params.get('page') || '1');
  return {
    q: (params.get('q') || '').trim(),
    type: params.get('type') || 'all',
    transaction: params.get('ht') || params.get('transaction') || 'all',
    price: normalizePrice(params.get('price') || params.get('gia')),
    area: normalizeArea(params.get('area') || params.get('dt')),
    project: params.get('project') || 'all',
    district: (params.get('district') || params.get('location') || '').trim(),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  };
}

/** Serialize filters → query; omit defaults for clean shareable URLs. */
export function serializeListingSearchParams(state: ListingFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.type && state.type !== 'all') params.set('type', state.type);
  if (state.transaction && state.transaction !== 'all') params.set('ht', state.transaction);
  if (state.price && state.price !== 'all') params.set('price', state.price);
  if (state.area && state.area !== 'all') params.set('area', state.area);
  if (state.project && state.project !== 'all') params.set('project', state.project);
  if (state.district.trim()) params.set('district', state.district.trim());
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function buildListingPath(facet?: string | null, state?: Partial<ListingFilterState>): string {
  const base = facet ? `${LISTING_CATALOG_ROOT}/${facet}` : LISTING_CATALOG_ROOT;
  const merged = { ...EMPTY_LISTING_FILTERS, ...state };
  const qs = serializeListingSearchParams(merged).toString();
  return qs ? `${base}?${qs}` : base;
}

export function getListingFacet(slug?: string | null): ListingFacetDef | null {
  if (!slug) return null;
  return LISTING_FACET_BY_SLUG[slug.toLowerCase()] || null;
}

export function getTransactionType(property: Property): 'Cho thuê' | 'Bán' {
  return String(property.transaction_type || 'Bán').toLowerCase() === 'cho thuê' ? 'Cho thuê' : 'Bán';
}

export function matchPriceRange(price: number, range: string): boolean {
  if (!range || range === 'all') return true;
  if (range === 'under3') return price < 3;
  if (range === '3to5') return price >= 3 && price <= 5;
  if (range === '5to10') return price > 5 && price <= 10;
  if (range === 'over10') return price > 10;
  return true;
}

export function matchAreaRange(area: number, range: string): boolean {
  if (!range || range === 'all') return true;
  if (range === 'under80') return area < 80;
  if (range === '80to150') return area >= 80 && area <= 150;
  if (range === 'over150') return area > 150;
  return true;
}

export function applyListingFilters(
  properties: Property[],
  state: ListingFilterState,
  facet?: ListingFacetDef | null,
): Property[] {
  const normalizedQuery = state.q.trim().toLowerCase();
  const district = state.district.trim().toLowerCase();
  const facetKeyword = (facet?.keyword || '').toLowerCase();

  return properties.filter(property => {
    if (['sold', 'hidden'].includes(property.sale_status || 'available')) return false;

    if (facet?.typeIncludes) {
      const ft = facet.typeIncludes.toLowerCase();
      if (!String(property.type).toLowerCase().includes(ft)) return false;
    }
    if (facet?.marketZone && !matchMarketZone(property, facet.marketZone)) return false;
    if (facet?.projectMatch) {
      const label = getPropertyProjectLabel(property) || '';
      if (!label.toLowerCase().includes(facet.projectMatch.toLowerCase())) return false;
    }

    const haystack = [
      property.title,
      property.location,
      property.type,
      getTransactionType(property),
      property.description,
      property.rich_description || '',
      getPropertyProjectLabel(property) || '',
    ]
      .join(' ')
      .toLowerCase();

    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    if (facetKeyword && !haystack.includes(facetKeyword)) return false;
    if (district && !String(property.location).toLowerCase().includes(district)) return false;
    if (state.type !== 'all' && property.type !== state.type) return false;
    if (state.transaction !== 'all' && getTransactionType(property) !== state.transaction) return false;
    if (!matchPriceRange(property.price, state.price)) return false;
    if (!matchAreaRange(property.area, state.area)) return false;
    if (!matchProjectName(property, state.project)) return false;

    return true;
  });
}

/**
 * Page size = columns × rows (no hardcode of 10).
 * Desktop lg≥1024 → 3 cols; tablet sm≥640 → 2; mobile → 1.
 */
export function listingPageSizeForWidth(width: number, rows = 3): number {
  const cols = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  return cols * rows;
}
