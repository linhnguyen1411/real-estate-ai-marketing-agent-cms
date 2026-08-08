import type { InternalLinkEdge, InternalLinkNode } from '../types/InternalLink';

/** Canonical Shophouse Sun topic hub + supporting money pages */
export const SHOPHOUSE_SUN_HUB = '/shophouse-sun-da-nang' as const;

export const SHOPHOUSE_SUN_SUPPORTING_SLUGS = [
  '/gia-shophouse-sun-da-nang',
  '/shophouse-khoi-de-sun-symphony',
  '/dau-tu-shophouse-sun-da-nang',
  '/dong-tien-shophouse-sun',
  '/cho-thue-shophouse-sun',
  '/phap-ly-shophouse-sun',
  '/chinh-sach-thanh-toan-shophouse-sun',
  '/bang-gia-can-ho-sun-da-nang',
  '/can-ho-sun-group-da-nang',
  '/so-sanh-shophouse-va-can-ho-sun',
] as const;

/**
 * Internal link graph — relationships only (no HTML).
 * Shophouse Sun cluster is the primary topical authority graph.
 */
export const INTERNAL_LINK_NODES: InternalLinkNode[] = [
  {
    slug: '/',
    label: 'Trang chủ',
    childSlugs: [SHOPHOUSE_SUN_HUB, '/bat-dong-san', '/du-an', '/tin-tuc', '/nha-dau-tu', '/lien-he'],
    relatedSlugs: ['/can-ho-sun-group-da-nang', '/du-an/bat-dong-san-da-nang-noi-bat', '/tai-lieu-dau-tu'],
  },
  {
    slug: SHOPHOUSE_SUN_HUB,
    label: 'Shophouse Sun Đà Nẵng',
    parentSlug: '/',
    childSlugs: [...SHOPHOUSE_SUN_SUPPORTING_SLUGS],
    projectSlugs: ['/du-an/sun-symphony', '/du-an/sun-ponte', '/du-an/sun-cosmo'],
    relatedSlugs: ['/bat-dong-san/nha-pho', '/can-ho-cao-cap-da-nang', '/lien-he'],
    financialSlugs: [
      '/gia-shophouse-sun-da-nang',
      '/dong-tien-shophouse-sun',
      '/dau-tu-shophouse-sun-da-nang',
    ],
  },
  {
    slug: '/gia-shophouse-sun-da-nang',
    label: 'Giá shophouse Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/chinh-sach-thanh-toan-shophouse-sun', '/dong-tien-shophouse-sun'],
    projectSlugs: ['/shophouse-khoi-de-sun-symphony', '/du-an/sun-symphony'],
    financialSlugs: ['/dau-tu-shophouse-sun-da-nang'],
  },
  {
    slug: '/shophouse-khoi-de-sun-symphony',
    label: 'Shophouse khối đế Symphony',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/gia-shophouse-sun-da-nang', '/phap-ly-shophouse-sun'],
    projectSlugs: ['/du-an/sun-symphony', '/bat-dong-san/sun-symphony'],
    comparisonSlugs: ['/so-sanh-shophouse-va-can-ho-sun'],
  },
  {
    slug: '/dau-tu-shophouse-sun-da-nang',
    label: 'Đầu tư shophouse Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/dong-tien-shophouse-sun', '/phap-ly-shophouse-sun'],
    financialSlugs: ['/gia-shophouse-sun-da-nang', '/cho-thue-shophouse-sun'],
    comparisonSlugs: ['/so-sanh-shophouse-va-can-ho-sun'],
  },
  {
    slug: '/dong-tien-shophouse-sun',
    label: 'Dòng tiền shophouse',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/cho-thue-shophouse-sun', '/dau-tu-shophouse-sun-da-nang'],
    financialSlugs: ['/gia-shophouse-sun-da-nang'],
  },
  {
    slug: '/cho-thue-shophouse-sun',
    label: 'Cho thuê shophouse Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/dong-tien-shophouse-sun', '/gia-shophouse-sun-da-nang'],
    financialSlugs: ['/dau-tu-shophouse-sun-da-nang'],
  },
  {
    slug: '/phap-ly-shophouse-sun',
    label: 'Pháp lý shophouse Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/chinh-sach-thanh-toan-shophouse-sun', '/dau-tu-shophouse-sun-da-nang'],
  },
  {
    slug: '/chinh-sach-thanh-toan-shophouse-sun',
    label: 'Chính sách thanh toán shophouse',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/gia-shophouse-sun-da-nang', '/phap-ly-shophouse-sun'],
    financialSlugs: ['/dau-tu-shophouse-sun-da-nang'],
  },
  {
    slug: '/bang-gia-can-ho-sun-da-nang',
    label: 'Bảng giá căn hộ Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/can-ho-sun-group-da-nang', '/so-sanh-shophouse-va-can-ho-sun'],
    projectSlugs: ['/du-an/sun-symphony', '/du-an/sun-cosmo', '/du-an/sun-ponte'],
    financialSlugs: ['/gia-shophouse-sun-da-nang'],
  },
  {
    slug: '/can-ho-sun-group-da-nang',
    label: 'Căn hộ Sun Group Đà Nẵng',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/bang-gia-can-ho-sun-da-nang', '/can-ho-cao-cap-da-nang'],
    projectSlugs: ['/du-an/sun-symphony', '/du-an/sun-cosmo', '/du-an/sun-ponte'],
    comparisonSlugs: ['/so-sanh-shophouse-va-can-ho-sun'],
  },
  {
    slug: '/so-sanh-shophouse-va-can-ho-sun',
    label: 'So sánh shophouse & căn hộ Sun',
    parentSlug: SHOPHOUSE_SUN_HUB,
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/can-ho-sun-group-da-nang', '/dau-tu-shophouse-sun-da-nang'],
    comparisonSlugs: ['/can-ho-sun-group-da-nang', '/shophouse-khoi-de-sun-symphony'],
    financialSlugs: ['/dong-tien-shophouse-sun', '/bang-gia-can-ho-sun-da-nang'],
  },
  {
    slug: '/bat-dong-san',
    label: 'Bất động sản',
    parentSlug: '/',
    childSlugs: [
      '/can-ho-cao-cap-da-nang',
      '/dat-nen-nam-hoa-xuan-da-nang',
      '/bat-dong-san/nha-pho',
      '/bat-dong-san-nam-da-nang',
    ],
    projectSlugs: [
      '/bat-dong-san/sun-symphony',
      '/bat-dong-san/sun-cosmo',
      '/bat-dong-san/sun-ponte',
    ],
    locationSlugs: [
      '/bat-dong-san/mai-dang-chon',
      '/bat-dong-san/fpt-city',
      '/bat-dong-san/hoa-xuan',
    ],
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/du-an', '/can-ho-sun-group-da-nang'],
  },
  {
    slug: '/can-ho-cao-cap-da-nang',
    label: 'Căn hộ',
    parentSlug: '/bat-dong-san',
    projectSlugs: ['/du-an/sun-symphony', '/du-an/sun-cosmo', '/du-an/sun-ponte'],
    relatedSlugs: ['/can-ho-sun-group-da-nang', '/bang-gia-can-ho-sun-da-nang', SHOPHOUSE_SUN_HUB],
    financialSlugs: ['/can-ho-da-nang-cho-thue', '/bang-gia-can-ho-sun-da-nang'],
  },
  {
    slug: '/dat-nen-nam-hoa-xuan-da-nang',
    label: 'Đất nền',
    parentSlug: '/bat-dong-san',
    locationSlugs: ['/bat-dong-san-nam-da-nang', '/bat-dong-san/hoa-xuan'],
    relatedSlugs: ['/dat-nen-nam-da-nang', '/du-an/bat-dong-san-nam-da-nang'],
  },
  {
    slug: '/bat-dong-san/nha-pho',
    label: 'Nhà phố',
    parentSlug: '/bat-dong-san',
    locationSlugs: ['/bat-dong-san-nam-da-nang', '/bat-dong-san/mai-dang-chon'],
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/shophouse-khoi-de-sun-symphony'],
  },
  {
    slug: '/bat-dong-san-nam-da-nang',
    label: 'Nam Đà Nẵng',
    parentSlug: '/bat-dong-san',
    relatedSlugs: ['/du-an/bat-dong-san-nam-da-nang', '/dau-tu-nam-da-nang', '/dat-nen-nam-da-nang'],
    locationSlugs: ['/bat-dong-san/hoa-xuan', '/bat-dong-san/mai-dang-chon', '/bat-dong-san/fpt-city'],
  },
  {
    slug: '/du-an',
    label: 'Danh mục BĐS',
    parentSlug: '/',
    childSlugs: [
      '/du-an/sun-symphony',
      '/du-an/sun-cosmo',
      '/du-an/sun-ponte',
      '/du-an/bat-dong-san-nam-da-nang',
      '/du-an/bat-dong-san-da-nang-noi-bat',
    ],
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/bat-dong-san', '/can-ho-sun-group-da-nang'],
  },
  {
    slug: '/du-an/sun-symphony',
    label: 'Sun Symphony',
    parentSlug: '/du-an',
    relatedSlugs: [
      SHOPHOUSE_SUN_HUB,
      '/shophouse-khoi-de-sun-symphony',
      '/gia-shophouse-sun-da-nang',
      '/du-an/sun-cosmo',
      '/du-an/sun-ponte',
    ],
    comparisonSlugs: ['/du-an/sun-cosmo', '/so-sanh-shophouse-va-can-ho-sun'],
    projectSlugs: ['/bat-dong-san/sun-symphony'],
    financialSlugs: ['/bang-gia-can-ho-sun-da-nang', '/dong-tien-shophouse-sun'],
  },
  {
    slug: '/du-an/sun-cosmo',
    label: 'Sun Cosmo',
    parentSlug: '/du-an',
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/can-ho-sun-group-da-nang', '/du-an/sun-symphony', '/du-an/sun-ponte'],
    comparisonSlugs: ['/du-an/sun-symphony'],
    financialSlugs: ['/bang-gia-can-ho-sun-da-nang'],
  },
  {
    slug: '/du-an/sun-ponte',
    label: 'Sun Ponte',
    parentSlug: '/du-an',
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/du-an/sun-symphony', '/du-an/sun-cosmo', '/gia-shophouse-sun-da-nang'],
    financialSlugs: ['/dong-tien-shophouse-sun'],
  },
  {
    slug: '/du-an/bat-dong-san-nam-da-nang',
    label: 'BĐS Nam Đà Nẵng',
    parentSlug: '/du-an',
    locationSlugs: ['/bat-dong-san-nam-da-nang', '/bat-dong-san/mai-dang-chon'],
    relatedSlugs: ['/dau-tu-nam-da-nang', '/dat-nen-nam-da-nang', '/du-an/bat-dong-san-da-nang-noi-bat'],
    financialSlugs: ['/nha-dau-tu', '/tai-lieu-dau-tu'],
  },
  {
    slug: '/du-an/bat-dong-san-da-nang-noi-bat',
    label: 'BĐS nổi bật',
    parentSlug: '/du-an',
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/bat-dong-san', '/du-an/bat-dong-san-nam-da-nang'],
  },
  {
    slug: '/dau-tu-da-nang',
    label: 'Đầu tư Đà Nẵng',
    parentSlug: '/',
    articleSlugs: ['/dau-tu-nam-da-nang', '/dau-tu-fpt-city', '/can-ho-dau-tu-da-nang'],
    financialSlugs: ['/tai-lieu-dau-tu', '/nha-dau-tu', '/dau-tu-shophouse-sun-da-nang'],
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang'],
  },
  {
    slug: '/tai-lieu-dau-tu',
    label: 'Tài liệu đầu tư',
    parentSlug: '/',
    financialSlugs: ['/nha-dau-tu', '/dau-tu-da-nang'],
    relatedSlugs: [SHOPHOUSE_SUN_HUB, '/du-an', '/review-khu-vuc'],
  },
  {
    slug: '/nha-dau-tu',
    label: 'Dữ liệu thị trường',
    parentSlug: '/',
    financialSlugs: ['/tai-lieu-dau-tu'],
    relatedSlugs: ['/dau-tu-nam-da-nang', '/du-an/bat-dong-san-nam-da-nang', SHOPHOUSE_SUN_HUB],
  },
];

/** Explicit edges for weighted / typed queries — hub spokes are intentional */
export const INTERNAL_LINK_EDGES: InternalLinkEdge[] = [
  { fromSlug: '/', toSlug: SHOPHOUSE_SUN_HUB, relation: 'children', label: 'Shophouse Sun', weight: 1 },
  { fromSlug: '/', toSlug: '/bat-dong-san', relation: 'children', label: 'Bất động sản', weight: 0.9 },
  { fromSlug: '/', toSlug: '/du-an', relation: 'children', label: 'Danh mục', weight: 0.9 },
  ...SHOPHOUSE_SUN_SUPPORTING_SLUGS.map(toSlug => ({
    fromSlug: SHOPHOUSE_SUN_HUB,
    toSlug,
    relation: 'children' as const,
    weight: 0.95,
  })),
  ...SHOPHOUSE_SUN_SUPPORTING_SLUGS.map(fromSlug => ({
    fromSlug,
    toSlug: SHOPHOUSE_SUN_HUB,
    relation: 'parent' as const,
    weight: 1,
  })),
  { fromSlug: SHOPHOUSE_SUN_HUB, toSlug: '/du-an/sun-symphony', relation: 'project', weight: 0.9 },
  { fromSlug: SHOPHOUSE_SUN_HUB, toSlug: '/du-an/sun-ponte', relation: 'project', weight: 0.85 },
  { fromSlug: SHOPHOUSE_SUN_HUB, toSlug: '/du-an/sun-cosmo', relation: 'project', weight: 0.8 },
  { fromSlug: '/du-an/sun-symphony', toSlug: SHOPHOUSE_SUN_HUB, relation: 'related', weight: 0.95 },
  { fromSlug: '/du-an/sun-symphony', toSlug: '/shophouse-khoi-de-sun-symphony', relation: 'project', weight: 0.9 },
  { fromSlug: '/du-an/sun-ponte', toSlug: SHOPHOUSE_SUN_HUB, relation: 'related', weight: 0.9 },
  { fromSlug: '/can-ho-cao-cap-da-nang', toSlug: '/can-ho-sun-group-da-nang', relation: 'related', weight: 0.9 },
  { fromSlug: '/bat-dong-san/nha-pho', toSlug: SHOPHOUSE_SUN_HUB, relation: 'related', weight: 0.85 },
  { fromSlug: '/so-sanh-shophouse-va-can-ho-sun', toSlug: '/can-ho-sun-group-da-nang', relation: 'comparison', weight: 0.9 },
  { fromSlug: '/so-sanh-shophouse-va-can-ho-sun', toSlug: '/shophouse-khoi-de-sun-symphony', relation: 'comparison', weight: 0.9 },
  { fromSlug: '/gia-shophouse-sun-da-nang', toSlug: '/dong-tien-shophouse-sun', relation: 'financial', weight: 0.85 },
  { fromSlug: '/dau-tu-shophouse-sun-da-nang', toSlug: '/phap-ly-shophouse-sun', relation: 'related', weight: 0.85 },
];

const NODE_BY_SLUG = new Map(INTERNAL_LINK_NODES.map(n => [n.slug, n]));

export function getInternalLinkNodeRecord(slug: string): InternalLinkNode | undefined {
  return NODE_BY_SLUG.get(slug);
}

export function listInternalLinkNodeRecords(): readonly InternalLinkNode[] {
  return INTERNAL_LINK_NODES;
}

export function listInternalLinkEdgeRecords(): readonly InternalLinkEdge[] {
  return INTERNAL_LINK_EDGES;
}

/** Money pages — high commercial intent paths used by content registry */
export const MONEY_PAGE_SLUGS = [
  SHOPHOUSE_SUN_HUB,
  '/gia-shophouse-sun-da-nang',
  '/dau-tu-shophouse-sun-da-nang',
  '/dong-tien-shophouse-sun',
  '/can-ho-sun-group-da-nang',
  '/bang-gia-can-ho-sun-da-nang',
  '/du-an/sun-symphony',
  '/du-an/bat-dong-san-da-nang-noi-bat',
  '/lien-he',
] as const;
