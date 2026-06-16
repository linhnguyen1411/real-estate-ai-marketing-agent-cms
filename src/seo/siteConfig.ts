/** Central SEO & business config — single source of truth for public site */
export const SITE = {
  name: 'Estoria',
  brand: 'BDSDanang.site',
  domain: 'bdsdanang.site',
  url: 'https://bdsdanang.site',
  locale: 'vi_VN',
  language: 'vi',
  defaultTitle: 'BĐS Đà Nẵng | Dữ Liệu Căn Hộ & Đất Nền 2026',
  defaultDescription:
    'Trung tâm thông tin và tư vấn bất động sản Đà Nẵng cho nhà đầu tư trung và dài hạn: FPT City, Sun Cosmo, Sun Symphony, Nam Đà Nẵng, căn hộ cho thuê và đất nền pháp lý rõ.',
  defaultKeywords: [
    'bất động sản đà nẵng',
    'đầu tư bđs đà nẵng',
    'nhà đầu tư hà nội mua đà nẵng',
    'căn hộ đà nẵng',
    'đất nền nam đà nẵng',
    'fpt city đà nẵng',
    'sun cosmo đà nẵng',
    'sun symphony đà nẵng',
    'căn hộ cho thuê đà nẵng',
    'mai đăng chơn'
  ],
  ogImage:
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=90&fm=webp',
  foundingDate: '2020',
  areaServed: ['Đà Nẵng', 'Hội An', 'Quảng Nam', 'Việt Nam'],
} as const;

export const CONTACT = {
  companyName: 'Estoria — Tư vấn BĐS Đà Nẵng',
  representative: 'Linh Nguyễn',
  title: 'Tư vấn BĐS Nam Đà Nẵng',
  phone: '0905777594',
  phoneDisplay: '0905 777 594',
  phoneSecondary: '0984755258',
  phoneTel: '+84905777594',
  email: 'contact@bdsdanang.site',
  website: SITE.url,
  facebook: 'https://www.facebook.com/estoria.dn',
  messenger: 'https://m.me/estoria.dn',
  zalo: 'https://zalo.me/0905777594',
  address: 'Đà Nẵng, Việt Nam',
  mapEmbed:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d61354.89327985758!2d108.2021667!3d16.0544068!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x314219c3cd6e8e79%3A0x8c8e8e8e8e8e8e8e!2zRMOgIE7hur5uZywgVmnhu4d0IE5hbQ!5e0!3m2!1svi!2s!4v1700000000000!5m2!1svi!2s',
  mapLink: 'https://maps.google.com/?q=Da+Nang,+Vietnam',
  workingHours: '8:00 – 21:00 (T2–CN)',
} as const;

export const AUTHOR = {
  slug: 'nguyen-phan-hoang-linh',
  name: 'Linh Nguyễn',
  title: 'Tư vấn BĐS Nam Đà Nẵng',
  expertise: [
    'Đầu tư bất động sản Nam Đà Nẵng',
    'Tư vấn nhà đầu tư trung và dài hạn',
    'Căn hộ cao cấp Sun Group',
    'Đất nền FPT City & khu vực ven sông',
    'Pháp lý & dòng tiền cho thuê'
  ],
  bio:
    'Tư vấn bất động sản tại Đà Nẵng, hỗ trợ nhà đầu tư đánh giá cơ hội tại Nam Đà Nẵng, FPT City, Sun Cosmo và các dự án căn hộ cho thuê.',
  url: `${SITE.url}/tac-gia/nguyen-phan-hoang-linh`,
  image: `${SITE.url}/og-author.jpg`,
} as const;

/** Primary conversion CTA — Hanoi investor funnel */
export const PRIMARY_CTA = 'Nhận danh sách cơ hội đầu tư Đà Nẵng';

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'listings', 'bds-da-nang',
  'bat-dong-san', 'can-ho', 'dat-nen', 'nha-pho', 'du-an', 'nam-da-nang',
  'kien-thuc-dau-tu', 'tin-thi-truong', 'phan-tich', 'review-khu-vuc',
  'gioi-thieu', 'lien-he', 'chinh-sach-bao-mat', 'dieu-khoan-su-dung',
  'chinh-sach-cookie', 'mien-tru-trach-nhiem', 'tac-gia',
  'dau-tu-da-nang', 'dau-tu-nam-da-nang', 'dau-tu-fpt-city',
  'can-ho-da-nang-cho-thue', 'can-ho-dau-tu-da-nang',
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang', 'dat-nen-nam-da-nang',
  'tai-lieu-dau-tu', 'tin-tuc', 'nha-dau-tu',
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
  if (/^https?:\/\//i.test(path)) return path;
  const base = origin.replace(/\/+$/, '');
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}
