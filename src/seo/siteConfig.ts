import { buildTitle } from './utils/buildTitle';
import { normalizeCanonical } from './utils/normalizeCanonical';

/** Central SEO & business config — single source of truth for public site */
export const SITE = {
  name: 'Estoria',
  brand: 'bdsdanang.site',
  domain: 'bdsdanang.site',
  url: 'https://bdsdanang.site',
  locale: 'vi_VN',
  language: 'vi',
  defaultTitle: 'Căn Hộ Sun Group, Shophouse Khối Đế & BĐS Đầu Tư Đà Nẵng | Estoria',
  /** Brand motto — footer only, not for SEO or header */
  tagline: 'Where assets tell their story',
  taglineVi: 'Nơi mỗi tài sản kể câu chuyện của mình',
  defaultDescription:
    'Estoria chuyên căn hộ Sun Group, shophouse khối đế Sun Group và bất động sản đầu tư nổi bật tại Đà Nẵng — giá, dòng tiền, pháp lý để thẩm định trước khi mua.',
  /** Schema.org RealEstateAgent display name */
  schemaName: 'Estoria — Căn hộ & Shophouse Sun Group Đà Nẵng',
  priceRange: '$$$',
  defaultKeywords: [
      'căn hộ và shophouse sun đà nẵng',
      'shophouse sun đà nẵng',
      'shophouse khối đế sun group',
      'căn hộ sun group đà nẵng đầu tư',
      'bảng giá căn hộ sun đà nẵng',
      'đầu tư shophouse sun đà nẵng',
      'dòng tiền shophouse khối đế',
      'bđs đầu tư nổi bật đà nẵng',
    ],
  logo: '/logo.jpg',
  ogImage: '/logo.jpg',
  foundingDate: '2020',
  areaServed: ['Đà Nẵng', 'Ngũ Hành Sơn', 'Sơn Trà', 'Hải Châu', 'Hòa Vang'],
} as const;

/** Phân khúc & định vị inventory — 3 trụ cột trọng tâm */
export const BRAND_FOCUS = {
  sunGroup: {
    title: 'Sun Group Đà Nẵng',
    summary:
      'Căn hộ cao cấp ven sông Hàn, shophouse, nhà phố thương mại và đất nền dự án trong hệ sinh thái Sun Group.',
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Nhà phố thương mại', 'Đất nền dự án'],
  },
  namDaNang: {
    title: 'BĐS Nam Đà Nẵng',
    summary:
      'Mũi nhọn khu vực: đất nền, nhà phố, kho xưởng, căn hộ, khách sạn và tài sản đầu tư — Mai Đăng Chơn, Hòa Xuân, Hòa Quý…',
    productTypes: ['Đất nền', 'Nhà ở', 'Kho xưởng', 'Căn hộ', 'Khách sạn', 'Đầu tư'],
  },
  noiBat: {
    title: 'BĐS nổi bật',
    summary:
      'Tài sản đáng chú ý từ nhiều khu vực — deal giá tốt, vị trí độc đáo, không gói trong một dự án hay một quận.',
    productTypes: ['Căn hộ', 'Đất & nhà', 'Shophouse', 'Khách sạn', 'Tài sản đặc biệt'],
  },
  fptCityNote:
    'FPT City chỉ xuất hiện trong bài phân tích thị trường Nam Đà Nẵng — không phải sản phẩm chủ lực.',
  expansion: 'Mở rộng dần sang ven biển miền Trung và các tỉnh thành khi có nguồn hàng phù hợp.',
  inventorySummary:
    'Sun Group Đà Nẵng · BĐS Nam Đà Nẵng · BĐS nổi bật — ba trụ cột danh mục của chúng tôi.',
} as const;

export const CONTACT = {
  companyName: 'Estoria',
  representative: 'Linh Nguyễn',
  title: 'Tư vấn BĐS Đà Nẵng',
  phone: '0905777594',
  phoneDisplay: '0905 777 594',
  phoneSecondary: '0947924343',
  phoneSecondaryDisplay: '0947 92 43 43',
  phoneTel: '+84905777594',
  phoneSecondaryTel: '+84947924343',
  /** Footer & liên hệ theo phân khúc */
  hotlines: [
    {
      display: '0905 777 594',
      tel: '+84905777594',
      label: 'Tư vấn đất, nhà phố',
    },
    {
      display: '0947 92 43 43',
      tel: '+84947924343',
      label: 'Tư vấn BĐS Sun Group, Căn hộ cao cấp',
    },
  ] as const,
  email: 'linhnguyendn2305@gmail.com',
  website: 'https://bdsdanang.site',
  facebook: 'https://www.facebook.com/estoria.dn',
  messenger: 'https://m.me/estoria.dn',
  zalo: 'https://zalo.me/0905777594',
  address: 'Đà Nẵng, Việt Nam',
  mapEmbed:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2318.936374910494!2d108.22900863522636!3d16.08776098646841!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3142193732fedf65%3A0x9e332e0ce0c2fc5!2zQsSQUyBTdW4gR3JvdXAgxJDDoCBO4bq1bmc!5e1!3m2!1svi!2s!4v1782390629253!5m2!1svi!2s',
  mapLink: 'https://maps.google.com/?q=Da+Nang,+Vietnam',
  workingHours: '8:00 – 21:00 (T2–CN)',
} as const;

export const AUTHOR = {
  slug: 'nguyen-phan-hoang-linh',
  name: 'Linh Nguyễn',
  title: 'Tư vấn BĐS Đà Nẵng',
  expertise: [
    'Đất nền & nhà phố Nam Đà Nẵng',
    'Căn hộ Sun Group ven sông Hàn',
    'BĐS nổi bật',
    'Tư vấn nhà đầu tư trung và dài hạn',
    'Pháp lý & dòng tiền cho thuê',
  ],
  bio:
    'Tư vấn bất động sản tại Đà Nẵng: ưu tiên đất nền và nhà phố Nam Đà Nẵng, căn hộ Sun Group ven sông Hàn.',
  url: `${SITE.url}/tac-gia/nguyen-phan-hoang-linh`,
  image: `${SITE.url}/og-author.jpg`,
} as const;

/** Primary conversion CTA — Hanoi investor funnel */
export const PRIMARY_CTA = 'Nhận danh sách cơ hội đầu tư Đà Nẵng';

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'listings', 'bds-da-nang',
  'bat-dong-san', 'can-ho', 'dat-nen', 'nha-pho', 'du-an', 'nam-da-nang',
  'can-ho-cao-cap-da-nang', 'dat-nen-nam-hoa-xuan-da-nang',
  'bat-dong-san-nam-da-nang', 'bat-dong-san-dau-tu-da-nang', 'bat-dong-san-da-nang-noi-bat',
  'bds-noi-bat', 'shophouse', 'shophouse-khoi-de-da-nang', 'bds-dau-tu', 'bds-gia-dau-tu',
  'can-ho-sun-group-da-nang', 'shophouse-sun-group-da-nang',
  'bang-gia-sun-group', 'tin-tuc-dau-tu',
  'kien-thuc-dau-tu', 'tin-thi-truong', 'phan-tich', 'review-khu-vuc',
  'gioi-thieu', 'lien-he', 'chinh-sach-bao-mat', 'dieu-khoan-su-dung',
  'chinh-sach-cookie', 'mien-tru-trach-nhiem', 'tac-gia',
  'dau-tu-da-nang', 'dau-tu-nam-da-nang', 'dau-tu-fpt-city',
  'can-ho-da-nang-cho-thue', 'can-ho-dau-tu-da-nang',
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang', 'dat-nen-nam-da-nang',
  'tai-lieu-dau-tu', 'tin-tuc', 'nha-dau-tu', 'moi-gioi',
  'shophouse-sun-da-nang', 'gia-shophouse-sun-da-nang',
  'shophouse-khoi-de-sun-symphony', 'dau-tu-shophouse-sun-da-nang',
  'dong-tien-shophouse-sun', 'cho-thue-shophouse-sun',
  'phap-ly-shophouse-sun', 'chinh-sach-thanh-toan-shophouse-sun',
  'bang-gia-can-ho-sun-da-nang', 'so-sanh-shophouse-va-can-ho-sun',
  'du-an-sun-group-da-nang',
  'property-images', 'sitemap.xml', 'robots.txt',
]);

export function getSiteOrigin(fallback: string = SITE.url): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return fallback.replace(/\/+$/, '');
}

export function absoluteUrl(path: string, origin: string = SITE.url): string {
  if (!path) return origin;
  return normalizeCanonical(path, origin);
}

/** Footer copyright line — includes brand motto */
export function getFooterBrandLine(separator: string = ' — '): string {
  return `${SITE.name}${separator}${SITE.tagline}`;
}

export function formatPageTitle(title: string): string {
  return buildTitle(title, { appendBrand: true, brand: SITE.name });
}
