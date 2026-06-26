import { RESERVED_SLUGS } from './siteConfig';

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const MAIN_NAV: NavItem[] = [
  { label: 'Trang chủ', href: '/' },
  { label: 'Bất động sản', href: '/bat-dong-san' },
  { label: 'Danh mục', href: '/du-an' },
  {
    label: 'Kiến thức đầu tư',
    href: '/kien-thuc-dau-tu',
    children: [
      { label: 'Tin tức', href: '/tin-tuc' },
      { label: 'Kiến thức đầu tư', href: '/kien-thuc-dau-tu' },
      { label: 'Phân tích', href: '/phan-tich' },
      { label: 'Review khu vực', href: '/review-khu-vuc' },
    ],
  },
  { label: 'Dữ liệu thị trường', href: '/nha-dau-tu' },
  { label: 'Tài liệu đầu tư', href: '/tai-lieu-dau-tu' },
  { label: 'Liên hệ', href: '/lien-he' },
];

export const FOOTER_LEGAL = [
  { label: 'Chính sách bảo mật', href: '/chinh-sach-bao-mat' },
  { label: 'Điều khoản sử dụng', href: '/dieu-khoan-su-dung' },
  { label: 'Chính sách cookie', href: '/chinh-sach-cookie' },
  { label: 'Miễn trừ trách nhiệm', href: '/mien-tru-trach-nhiem' },
];

export const SEO_LANDING_SLUGS = [
  'dau-tu-da-nang',
  'dau-tu-nam-da-nang',
  'dau-tu-fpt-city',
  'can-ho-da-nang-cho-thue',
  'can-ho-dau-tu-da-nang',
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang',
  'dat-nen-nam-da-nang',
] as const;

export { PROJECT_SLUGS } from './portfolioHub';

export function isReservedSlug(slug: string) {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isPropertySlugCandidate(slug: string) {
  const normalized = decodeURIComponent(slug || '').toLowerCase();
  if (!normalized || isReservedSlug(normalized)) return false;
  return true;
}
