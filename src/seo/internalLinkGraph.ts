/**
 * Blog/topic cluster link helpers (legacy API).
 * Page-level internal link graph lives in `data/internalLinks.ts` + `services/resolveInternalLinks`.
 */
export type ClusterKey = 'nha-dau-tu' | 'nam-da-nang' | 'fpt-city' | 'mai-dang-chon' | 'review-khu-vuc';

export interface LinkItem {
  label: string;
  href: string;
}

interface ClusterConfig {
  key: ClusterKey;
  pillar: LinkItem;
  slugs: string[];
}

export const PILLAR_PAGES: LinkItem[] = [
  { label: 'Danh mục BĐS', href: '/du-an' },
  { label: 'BĐS Nam Đà Nẵng', href: '/du-an/nam-da-nang' },
  { label: 'BĐS nổi bật', href: '/du-an/bds-noi-bat' },
  { label: 'Sun Symphony', href: '/du-an/sun-symphony' },
  { label: 'Review khu vực', href: '/review-khu-vuc' },
  { label: 'Tài liệu đầu tư', href: '/tai-lieu-dau-tu' },
];

const CLUSTERS: ClusterConfig[] = [
  {
    key: 'nha-dau-tu',
    pillar: { label: 'Cẩm nang nhà đầu tư', href: '/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang' },
    slugs: [
      'nha-dau-tu-ha-noi-nen-mua-gi-o-da-nang-2026',
      'dau-tu-da-nang-2026-dat-nen-can-ho-hay-dong-tien',
      'nha-dau-tu-ha-noi-mua-bds-da-nang-can-kiem-tra-gi',
      'sai-lam-khi-dau-tu-bat-dong-san-da-nang-tu-xa',
      'dau-tu-can-ho-cho-thue-da-nang-chi-so-can-biet',
      'dat-nen-hay-can-ho-lua-chon-tot-hon-tai-da-nang',
      'can-ho-cao-cap-da-nang-phu-hop-nha-dau-tu-ha-noi',
      'dong-tien-cho-thue-da-nang-ky-vong-hop-ly',
    ],
  },
  {
    key: 'nam-da-nang',
    pillar: { label: 'Đầu tư Nam Đà Nẵng', href: '/dau-tu-nam-da-nang' },
    slugs: [
      'vi-sao-nha-dau-tu-phia-bac-quan-tam-nam-da-nang',
      'nam-da-nang-co-con-du-dia-tang-truong-2026',
      '5-khu-vuc-dang-chu-y-nhat-nam-da-nang',
      'dau-tu-nam-da-nang-ha-tang-dan-cu-dong-tien',
      'so-sanh-nam-da-nang-va-trung-tam-da-nang',
    ],
  },
  {
    key: 'fpt-city',
    pillar: { label: 'Phân tích FPT City', href: '/dau-tu-fpt-city' },
    slugs: [
      'fpt-city-da-nang-co-dang-dau-tu-2026',
      'tiem-nang-cho-thue-quanh-fpt-city',
      'fpt-city-phu-hop-voi-nha-dau-tu-von-bao-nhieu',
      'so-sanh-fpt-city-va-hoa-xuan',
      'chuyen-gia-cong-nghe-tao-nhu-cau-thue-quanh-fpt-city',
      'truc-fpt-city-lang-dai-hoc-non-nuoc',
    ],
  },
  {
    key: 'mai-dang-chon',
    pillar: { label: 'BĐS Nam Đà Nẵng', href: '/du-an/nam-da-nang' },
    slugs: [
      'mai-dang-chon-co-gi-dac-biet-voi-nha-dau-tu',
      'quy-dat-mat-tien-mai-dang-chon-phu-hop-mo-hinh-kinh-doanh-nao',
      'dau-tu-can-ho-dich-vu-truc-mai-dang-chon',
      'mai-dang-chon-huong-loi-tu-fpt-city-va-lang-dai-hoc',
      'checklist-phap-ly-khi-mua-dat-mat-tien-mai-dang-chon',
    ],
  },
  {
    key: 'review-khu-vuc',
    pillar: { label: 'Review khu vực', href: '/review-khu-vuc' },
    slugs: [
      'review-dien-ngoc-vung-giap-ranh-da-nang-hoi-an',
      'review-hoa-xuan-uu-diem-rui-ro-thanh-khoan',
      'review-non-nuoc-bat-dong-san-nghi-duong-can-ho-cho-thue',
      'review-lang-dai-hoc-da-nang-cho-nha-dau-tu',
      'review-sun-symphony-sun-cosmo-goc-nhin-dau-tu',
      'can-ho-gan-bien-da-nang-tiem-nang-va-rui-ro',
    ],
  },
];

const LEAD_MAGNET_ANCHORS = [
  'nhận báo cáo thị trường',
  'xem dữ liệu đầu tư',
  'nhận danh sách cơ hội đầu tư',
  'tải tài liệu đầu tư',
  'nhận báo cáo Nam Đà Nẵng',
];

export function getClusterKeyFromSlug(slug: string): ClusterKey | null {
  const normalized = slug.toLowerCase();
  const cluster = CLUSTERS.find(item => item.slugs.includes(normalized));
  return cluster?.key ?? null;
}

export function getClusterConfig(slug: string): ClusterConfig | null {
  const normalized = slug.toLowerCase();
  return CLUSTERS.find(item => item.slugs.includes(normalized)) ?? null;
}

export function getClusterRelatedSlugs(slug: string, limit = 4): string[] {
  const cluster = getClusterConfig(slug);
  if (!cluster) return [];
  return cluster.slugs.filter(item => item !== slug).slice(0, limit);
}

export function getPillarLinkForSlug(slug: string): LinkItem | null {
  return getClusterConfig(slug)?.pillar ?? null;
}

export function getLeadMagnetLinkForSlug(slug: string): LinkItem {
  const hash = slug.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    label: LEAD_MAGNET_ANCHORS[hash % LEAD_MAGNET_ANCHORS.length],
    href: '/tai-lieu-dau-tu',
  };
}

export function getRelatedProjectLinksForSlug(slug: string): LinkItem[] {
  if (slug.includes('fpt-city')) return [{ label: 'Phân tích FPT City', href: '/dau-tu-fpt-city' }];
  if (slug.includes('mai-dang-chon')) return [{ label: 'BĐS Nam Đà Nẵng', href: '/du-an/nam-da-nang' }];
  if (slug.includes('sun-symphony') || slug.includes('sun-cosmo')) {
    return [{ label: 'Sun Group Đà Nẵng', href: '/du-an#sun-group' }];
  }
  if (slug.includes('can-ho')) return [{ label: 'Danh mục căn hộ', href: '/bat-dong-san/can-ho' }];
  return [];
}

export function getRelatedAreaLinksForSlug(slug: string): LinkItem[] {
  if (!slug.startsWith('review-')) return [];
  if (slug.includes('dien-ngoc')) {
    return [
      { label: 'Review Hòa Xuân', href: '/tin-tuc/review-hoa-xuan-uu-diem-rui-ro-thanh-khoan' },
      { label: 'Review Non Nước', href: '/tin-tuc/review-non-nuoc-bat-dong-san-nghi-duong-can-ho-cho-thue' },
      { label: 'Review Làng Đại học', href: '/tin-tuc/review-lang-dai-hoc-da-nang-cho-nha-dau-tu' },
    ];
  }
  return [
    { label: 'Review Điện Ngọc', href: '/tin-tuc/review-dien-ngoc-vung-giap-ranh-da-nang-hoi-an' },
    { label: 'Review Hòa Xuân', href: '/tin-tuc/review-hoa-xuan-uu-diem-rui-ro-thanh-khoan' },
    { label: 'Review Non Nước', href: '/tin-tuc/review-non-nuoc-bat-dong-san-nghi-duong-can-ho-cho-thue' },
  ];
}
