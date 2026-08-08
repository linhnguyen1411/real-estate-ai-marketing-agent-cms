/** Danh mục BĐS — 3 trụ cột trọng tâm của site */

import { getFaqQaPairs } from './data/faqRegistry';

export type PortfolioPillarId = 'sun-group' | 'nam-da-nang' | 'noi-bat';

export interface PortfolioPillar {
  id: PortfolioPillarId;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  productTypes: string[];
}

/** Canonical portfolio segment slugs under /du-an/ */
export const PORTFOLIO_SLUG_NAM_DA_NANG = 'bat-dong-san-nam-da-nang';
export const PORTFOLIO_SLUG_NOI_BAT = 'bat-dong-san-da-nang-noi-bat';

export const PORTFOLIO_PILLARS: PortfolioPillar[] = [
  {
    id: 'sun-group',
    title: 'Sun Group Đà Nẵng',
    subtitle: 'Thương hiệu chủ lực',
    description:
      'Căn hộ cao cấp ven sông Hàn, shophouse, nhà phố thương mại và đất nền trong các dự án Sun Group tại Đà Nẵng.',
    href: '/du-an/du-an-sun-group-da-nang',
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Nhà phố thương mại', 'Đất nền dự án'],
  },
  {
    id: 'nam-da-nang',
    title: 'BĐS Nam Đà Nẵng',
    subtitle: 'Mũi nhọn khu vực',
    description:
      'Đa dạng loại hình tại Nam Đà Nẵng: nhà ở, đất nền, kho xưởng, căn hộ, khách sạn và tài sản đầu tư — Mai Đăng Chơn, Hòa Xuân, Hòa Quý…',
    href: `/du-an/${PORTFOLIO_SLUG_NAM_DA_NANG}`,
    productTypes: ['Đất nền', 'Nhà phố', 'Kho xưởng', 'Căn hộ', 'Khách sạn', 'Đầu tư'],
  },
  {
    id: 'noi-bat',
    title: 'BĐS nổi bật',
    subtitle: 'Cơ hội đa dạng',
    description:
      'Tài sản đáng chú ý từ nhiều khu vực — deal giá tốt, vị trí độc đáo, không gói gọn trong một dự án hay một quận.',
    href: `/du-an/${PORTFOLIO_SLUG_NOI_BAT}`,
    productTypes: ['Căn hộ', 'Đất & nhà', 'Shophouse', 'Khách sạn', 'Tài sản đặc biệt'],
  },
];

export interface ProjectData {
  slug: string;
  pillar: PortfolioPillarId;
  name: string;
  location: string;
  summary: string;
  highlights: string[];
  productTypes?: string[];
  faqs: { question: string; answer: string }[];
  ctaHref?: string;
}

/** Dự án Sun Group (trang chi tiết) — FAQ từ SEO data layer */

export const PROJECTS: Record<string, ProjectData> = {
  'du-an-sun-group-da-nang': {
    slug: 'du-an-sun-group-da-nang',
    pillar: 'sun-group',
    name: 'Dự án Sun Group Đà Nẵng',
    location: 'Đà Nẵng',
    summary:
      'Tổng quan danh mục Sun Group tại Đà Nẵng: căn hộ cao cấp ven sông Hàn, shophouse khối đế và sản phẩm đầu tư trong hệ sinh thái Symphony, Cosmo, Ponte.',
    highlights: ['Căn hộ ven sông Hàn', 'Shophouse khối đế', 'Symphony · Cosmo · Ponte', 'Quỹ căn ngoại giao'],
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Nhà phố thương mại', 'Đất nền dự án'],
    faqs: getFaqQaPairs('faq-sun-symphony'),
    ctaHref: '/can-ho-cao-cap-da-nang',
  },
  'sun-symphony': {
    slug: 'sun-symphony',
    pillar: 'sun-group',
    name: 'Sun Symphony',
    location: 'Ven sông Hàn · Đà Nẵng',
    summary:
      'Quần thể cao cấp Sun Group ven sông Hàn: Symphony, S Light, Spana, Cora, FourS — căn hộ view sông, shophouse và sản phẩm dòng tiền.',
    highlights: ['Ven sông Hàn', 'Symphony · S Light · Spana', 'Căn ngoại giao', 'Dòng tiền & tích sản'],
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Đất nền dự án'],
    faqs: getFaqQaPairs('faq-sun-symphony'),
    ctaHref: '/can-ho-cao-cap-da-nang',
  },
  'sun-cosmo': {
    slug: 'sun-cosmo',
    pillar: 'sun-group',
    name: 'Sun Cosmo',
    location: 'Trung tâm Đà Nẵng',
    summary: 'Căn hộ cao cấp Sun Group tại trung tâm — tiện ích đồng bộ, phù hợp ở và đầu tư cho thuê.',
    highlights: ['Sun Group', 'Trung tâm thành phố', 'Tiện ích cao cấp', 'Thanh khoản TT2'],
    productTypes: ['Căn hộ cao cấp', 'Shophouse'],
    faqs: getFaqQaPairs('faq-sun-cosmo'),
    ctaHref: '/can-ho-cao-cap-da-nang',
  },
  'sun-ponte': {
    slug: 'sun-ponte',
    pillar: 'sun-group',
    name: 'Sun Ponte',
    location: 'Ven sông Hàn · Đà Nẵng',
    summary: 'Dòng sản phẩm Sun Group ven sông — căn hộ và shophouse thương mại trong hệ sinh thái Sun tại Đà Nẵng.',
    highlights: ['Sông Hàn', 'Shophouse', 'Sun Group', 'Thương mại & ở'],
    productTypes: ['Căn hộ', 'Shophouse', 'Nhà phố thương mại'],
    faqs: getFaqQaPairs('faq-sun-ponte'),
    ctaHref: '/can-ho-cao-cap-da-nang',
  },
  [PORTFOLIO_SLUG_NAM_DA_NANG]: {
    slug: PORTFOLIO_SLUG_NAM_DA_NANG,
    pillar: 'nam-da-nang',
    name: 'BĐS Nam Đà Nẵng',
    location: 'Nam Đà Nẵng',
    summary:
      'Phân khúc mũi nhọn của chúng tôi: đất nền, nhà phố, kho xưởng, căn hộ, khách sạn và tài sản đầu tư tập trung tại Nam Đà Nẵng — Mai Đăng Chơn, Hòa Xuân, Hòa Quý, Cẩm Lệ…',
    highlights: ['Đất nền & nhà phố', 'Kho xưởng', 'Khách sạn', 'Mai Đăng Chơn'],
    productTypes: ['Đất nền', 'Nhà ở', 'Kho xưởng', 'Căn hộ', 'Khách sạn', 'Đầu tư'],
    faqs: getFaqQaPairs('faq-nam-da-nang'),
    ctaHref: '/bat-dong-san-nam-da-nang',
  },
  [PORTFOLIO_SLUG_NOI_BAT]: {
    slug: PORTFOLIO_SLUG_NOI_BAT,
    pillar: 'noi-bat',
    name: 'BĐS nổi bật',
    location: 'Đà Nẵng & vùng lân cận',
    summary:
      'Các tài sản đáng chú ý được lọc theo pháp lý và tiềm năng — rải rác nhiều khu vực, không gói trong một dự án cố định. Cập nhật thường xuyên trên trang BĐS.',
    highlights: ['Đa khu vực', 'Deal đáng thẩm định', 'Giá & vị trí hấp dẫn', 'Cập nhật liên tục'],
    productTypes: ['Căn hộ', 'Đất & nhà', 'Shophouse', 'Khách sạn', 'Tài sản đặc biệt'],
    faqs: getFaqQaPairs('faq-bds-noi-bat'),
    ctaHref: '/bat-dong-san-dau-tu-da-nang',
  },
};

/** Dự án Sun Group (trang chi tiết) */
export const SUN_GROUP_PROJECT_SLUGS = ['sun-symphony', 'sun-cosmo', 'sun-ponte'] as const;

/** Hub Sun Group + trang phân khúc (không phải dự án developer đơn lẻ) */
export const PORTFOLIO_SEGMENT_SLUGS = [
  'du-an-sun-group-da-nang',
  PORTFOLIO_SLUG_NAM_DA_NANG,
  PORTFOLIO_SLUG_NOI_BAT,
] as const;

export const PROJECT_SLUGS = [...SUN_GROUP_PROJECT_SLUGS, ...PORTFOLIO_SEGMENT_SLUGS] as const;

export {
  SUN_GROUP_CHILD_PROJECT_SLUGS,
  SUN_GROUP_PORTFOLIO_SLUGS,
  isSunGroupPortfolioSlug,
  matchesPortfolioProject,
  matchesSunGroupProperty,
} from './portfolioPropertyMatch';

/** URL cũ → chuyển hướng (giữ SEO, không gãy link) */
export const LEGACY_PROJECT_REDIRECTS: Record<string, string> = {
  'fpt-city': '/bat-dong-san/fpt-city',
  'mai-dang-chon': '/bat-dong-san/mai-dang-chon',
  'gio-hang-ky-gui': `/du-an/${PORTFOLIO_SLUG_NOI_BAT}`,
  'nam-da-nang': `/du-an/${PORTFOLIO_SLUG_NAM_DA_NANG}`,
  'bds-noi-bat': `/du-an/${PORTFOLIO_SLUG_NOI_BAT}`,
};

export function getSunGroupProjects() {
  return SUN_GROUP_PROJECT_SLUGS.map(slug => PROJECTS[slug]).filter(Boolean);
}

export function getProjectBySlug(slug: string) {
  return PROJECTS[slug];
}
