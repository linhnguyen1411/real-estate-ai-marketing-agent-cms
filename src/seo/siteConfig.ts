import { buildTitle } from './utils/buildTitle';
import { normalizeCanonical } from './utils/normalizeCanonical';

/** Central SEO & business config — single source of truth for public site */
export const SITE = {
  name: 'House & Life',
  brand: 'bdsdanang.site',
  domain: 'bdsdanang.site',
  url: 'https://bdsdanang.site',
  locale: 'vi_VN',
  language: 'vi',
  defaultTitle: 'House & Life | BĐS Đà Nẵng - Nhà Phố, Đất Nền Nam Hòa Xuân, Căn Hộ & Cho Thuê',
  /** Brand motto — Slogan mới */
  tagline: 'Vững tâm an cư - kiến tạo tương lai',
  taglineVi: 'Vững tâm an cư - kiến tạo tương lai',
  defaultDescription:
    'House & Life — Vững tâm an cư, kiến tạo tương lai. Chuyên mua bán nhà phố, đất nền Nam Hòa Xuân, bán và cho thuê căn hộ tại Đà Nẵng. Thông tin minh bạch, pháp lý chuẩn và giỏ hàng cập nhật liên tục.',
  /** Schema.org RealEstateAgent display name */
  schemaName: 'House & Life — Bất Động Sản Đà Nẵng',
  priceRange: '$$$',
  defaultKeywords: [
    'nhà phố đà nẵng',
    'đất nền nam hòa xuân',
    'bán nhà phố đà nẵng',
    'bán đất nam hòa xuân',
    'bán căn hộ đà nẵng',
    'cho thuê căn hộ đà nẵng',
    'căn hộ dịch vụ đà nẵng',
    'bđs đà nẵng uy tín',
    'bđs sun group đà nẵng',
  ],
  logo: '/logo_hl.png',
  ogImage: '/logo_hl.png',
  foundingDate: '2020',
  areaServed: ['Đà Nẵng', 'Ngũ Hành Sơn', 'Cẩm Lệ', 'Hải Châu', 'Sơn Trà', 'Hòa Vang'],
} as const;

/** Phân khúc & định vị inventory — Tái định vị theo mục tiêu mới */
export const BRAND_FOCUS = {
  nhaPhoDatNen: {
    title: 'Nhà phố & Đất nền Nam Hòa Xuân',
    summary:
      'Trọng tâm cốt lõi: chuyên sâu mua bán nhà phố trung tâm, đất nền Nam Hòa Xuân, đất nền Nam Đà Nẵng — pháp lý an toàn, sổ đỏ sẵn sàng, vị trí đắc địa.',
    productTypes: ['Nhà phố trung tâm', 'Đất nền Nam Hòa Xuân', 'Đất nền Nam Đà Nẵng', 'Shophouse'],
  },
  canHoChoThue: {
    title: 'Bán & Cho thuê Căn hộ',
    summary:
      'Chuyên phân phối căn hộ ở thực, căn hộ cao cấp và căn hộ dịch vụ cho thuê tại Đà Nẵng — tối ưu dòng tiền cho thuê và an cư lâu dài.',
    productTypes: ['Bán căn hộ', 'Cho thuê căn hộ', 'Căn hộ dòng tiền', 'Căn hộ cao cấp'],
  },
  gioHangTiemNang: {
    title: 'Giỏ hàng tiềm năng (Sun Group & BĐS Chọn lọc)',
    summary:
      'Giỏ hàng bất động sản tiềm năng chọn lọc gồm hệ sinh thái Sun Group (Symphony, Cosmo, Ponte) và các tài sản thanh khoản cao tại Đà Nẵng.',
    productTypes: ['Dự án Sun Group', 'BĐS Ven sông & Biển', 'Tài sản đặc biệt'],
  },
  fptCityNote:
    'FPT City và các khu vực lân cận nằm trong giỏ hàng mở rộng Nam Đà Nẵng theo nhu cầu khách hàng.',
  expansion: 'Mở rộng đồng bộ thị trường nhà phố, đất nền và căn hộ cho thuê toàn khu vực Đà Nẵng - Quảng Nam.',
  inventorySummary:
    'Nhà phố · Đất nền Nam Hòa Xuân · Bán & Cho thuê Căn hộ · Giỏ hàng tiềm năng Sun Group.',
} as const;

export const CONTACT = {
  companyName: 'House & Life',
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
      label: 'Tư vấn Nhà phố & Đất nền Nam Hòa Xuân',
    },
    {
      display: '0947 92 43 43',
      tel: '+84947924343',
      label: 'Tư vấn Bán & Cho thuê Căn hộ, Giỏ hàng tiềm năng',
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
  title: 'Tư vấn BĐS Đà Nẵng — House & Life',
  expertise: [
    'Nhà phố & Đất nền Nam Hòa Xuân',
    'Bán & Cho thuê Căn hộ Đà Nẵng',
    'Đất nền Nam Đà Nẵng',
    'Giỏ hàng tiềm năng Sun Group',
    'Thẩm định pháp lý & Định giá tài sản',
  ],
  bio:
    'Tư vấn bất động sản House & Life tại Đà Nẵng: chuyên sâu nhà phố, đất nền Nam Hòa Xuân, căn hộ bán & cho thuê cùng giỏ hàng tiềm năng Sun Group.',
  url: `${SITE.url}/tac-gia/nguyen-phan-hoang-linh`,
  image: `${SITE.url}/og-author.jpg`,
} as const;

/** Primary conversion CTA — Hanoi investor funnel */
export const PRIMARY_CTA = 'Nhận danh sách cơ hội đầu tư Đà Nẵng';

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'listings', 'bds-da-nang',
  'bat-dong-san', 'can-ho', 'dat-nen', 'nha-pho', 'du-an', 'nam-da-nang',
  'can-ho-cao-cap-da-nang', 'dat-nen-nam-hoa-xuan-da-nang',
  'bat-dong-san-nam-da-nang', 'bat-dong-san-dau-tu-da-nang',
  'shophouse', 'shophouse-khoi-de-da-nang', 'bds-dau-tu', 'bds-gia-dau-tu',
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
