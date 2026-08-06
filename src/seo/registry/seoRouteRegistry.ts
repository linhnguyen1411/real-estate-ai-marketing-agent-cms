import { PageType } from '../types/PageType';
import type { SchemaType } from '../types/SeoMetadata';
import { SITE } from '../siteConfig';
import { SEO_LANDING_SLUGS } from '../routes';
import { PROJECT_SLUGS } from '../portfolioHub';
import { normalizePathname } from '../utils/normalizeCanonical';

export interface SeoRouteDefinition {
  /** Route path, e.g. `/` or `/bat-dong-san/can-ho` */
  slug: string;
  pageType: PageType;
  /** Optional template id for future phases */
  template?: string;
  defaultTitle: string;
  defaultDescription: string;
  schemaType: SchemaType[];
  priority: number;
  ogType?: 'website' | 'article' | 'product';
  keywords?: string[];
  /** Preserves historical pageMeta buckets */
  group: 'static' | 'project' | 'landing';
}

const DEFAULT_PAGE_SCHEMAS: SchemaType[] = ['defaultPage', 'BreadcrumbList'];
const ARTICLE_SCHEMAS: SchemaType[] = ['defaultPage', 'BreadcrumbList', 'Article'];

function route(
  slug: string,
  pageType: PageType,
  defaultTitle: string,
  defaultDescription: string,
  opts: Partial<Pick<SeoRouteDefinition, 'template' | 'schemaType' | 'priority' | 'ogType' | 'keywords' | 'group'>> = {},
): SeoRouteDefinition {
  return {
    slug,
    pageType,
    template: opts.template || pageType,
    defaultTitle,
    defaultDescription,
    schemaType: opts.schemaType || DEFAULT_PAGE_SCHEMAS,
    priority: opts.priority ?? 0.5,
    ogType: opts.ogType || 'website',
    keywords: opts.keywords,
    group: opts.group || 'static',
  };
}

/**
 * SEO route registry — SSOT for static / hub / landing page metadata.
 * Values copied from historical `pageMeta.ts` to preserve behavior.
 */
export const SEO_ROUTE_REGISTRY: SeoRouteDefinition[] = [
  route('/', PageType.HOME, SITE.defaultTitle, SITE.defaultDescription, {
    schemaType: ['defaultPage'],
    priority: 1,
    keywords: [...SITE.defaultKeywords],
  }),
  route('/bat-dong-san', PageType.CATALOG, 'Bất Động Sản Đà Nẵng 2026 | Danh Sách Căn Hộ & Đất Nền', 'Danh sách bất động sản Đà Nẵng cập nhật: căn hộ, đất nền, nhà phố Nam Đà Nẵng. Pháp lý rõ, giá minh bạch cho nhà đầu tư.', { priority: 0.9 }),
  route('/bat-dong-san/can-ho', PageType.CATALOG, 'Căn Hộ Đà Nẵng | Sun Group Ven Sông Hàn 2026', 'Căn hộ Sun Group ven sông Hàn và trung tâm Đà Nẵng — Symphony, Cosmo, cho thuê & đầu tư. Lọc theo giá, vị trí, pháp lý.', { priority: 0.8 }),
  route('/bat-dong-san/dat-nen', PageType.CATALOG, 'Đất Nền Đà Nẵng | Nam Đà Nẵng & Mai Đăng Chơn 2026', 'Đất nền Nam Đà Nẵng, Mai Đăng Chơn, Hòa Xuân — pháp lý sổ hồng, giỏ ký gửi chính chủ cho đầu tư dài hạn.', { priority: 0.8 }),
  route('/bat-dong-san/nha-pho', PageType.CATALOG, 'Nhà Phố Đà Nẵng | Kinh Doanh & Ở 2026', 'Nhà phố Đà Nẵng mặt tiền kinh doanh, shophouse khu vực trung tâm và Nam Đà Nẵng.', { priority: 0.8 }),
  route('/bat-dong-san/nam-da-nang', PageType.LOCATION, 'BĐS Nam Đà Nẵng | Khu Vực Đầu Tư Trọng Điểm 2026', 'Bất động sản Nam Đà Nẵng: xu hướng giá, dự án mới, cơ hội cho nhà đầu tư trung và dài hạn.', { priority: 0.8 }),
  route('/bat-dong-san/mai-dang-chon', PageType.LOCATION, 'Mai Đăng Chơn Đà Nẵng | Đất & Nhà Đầu Tư', 'Bất động sản Mai Đăng Chơn — danh sách đang giao dịch, pháp lý và vị trí cho nhà đầu tư.', { priority: 0.7 }),
  route('/bat-dong-san/fpt-city', PageType.LOCATION, 'FPT City Đà Nẵng | BĐS Phía Tây', 'Bất động sản khu vực FPT City & phía Tây Đà Nẵng — đất nền, nhà phố, cơ hội đầu tư.', { priority: 0.7 }),
  route('/bat-dong-san/sun-symphony', PageType.PROJECT, 'Sun Symphony Đà Nẵng | Căn Hộ Ven Sông', 'Căn hộ Sun Symphony và tài sản liên quan — giỏ hàng đang giao dịch.', { priority: 0.7 }),
  route('/bat-dong-san/sun-cosmo', PageType.PROJECT, 'Sun Cosmo Đà Nẵng | Căn Hộ Sun Group', 'Căn hộ Sun Cosmo Đà Nẵng — danh sách đang bán / cho thuê.', { priority: 0.7 }),
  route('/bat-dong-san/sun-ponte', PageType.PROJECT, 'Sun Ponte Đà Nẵng | Căn Hộ & Shophouse', 'Sun Ponte Đà Nẵng — danh sách đang giao dịch.', { priority: 0.7 }),
  route('/bat-dong-san/hoa-xuan', PageType.LOCATION, 'Hòa Xuân Đà Nẵng | Đất & Nhà', 'Bất động sản Hòa Xuân — danh sách đang giao dịch cho nhà đầu tư.', { priority: 0.7 }),
  route('/du-an', PageType.CATALOG, 'Danh Mục BĐS Đà Nẵng | Estoria', 'Ba trụ cột: Sun Group Đà Nẵng, BĐS Nam Đà Nẵng và BĐS nổi bật — danh mục bất động sản của Estoria tại Đà Nẵng.', { priority: 0.9 }),
  route('/kien-thuc-dau-tu', PageType.ARTICLE, 'Kiến Thức Đầu Tư BĐS Đà Nẵng | Hướng Dẫn 2026', 'Kiến thức đầu tư bất động sản Đà Nẵng: pháp lý, dòng tiền, chọn dự án, rủi ro và chiến lược cho người tìm kiếm cơ hội đầu tư.', { schemaType: ARTICLE_SCHEMAS, priority: 0.7 }),
  route('/tin-thi-truong', PageType.ARTICLE, 'Tin Thị Trường BĐS Đà Nẵng | Cập Nhật Mới Nhất', 'Tin tức thị trường bất động sản Đà Nẵng: giá đất, giao dịch, chính sách và xu hướng 2026.', { schemaType: ARTICLE_SCHEMAS, priority: 0.7 }),
  route('/phan-tich', PageType.ARTICLE, 'Phân Tích BĐS Đà Nẵng | Báo Cáo Đầu Tư', 'Phân tích chuyên sâu thị trường bất động sản Đà Nẵng theo khu vực, phân khúc và dòng tiền.', { schemaType: ARTICLE_SCHEMAS, priority: 0.7 }),
  route('/review-khu-vuc', PageType.LOCATION, 'Review Khu Vực Đà Nẵng | Đánh Giá Tiềm Năng', 'Review chi tiết từng khu vực Đà Nẵng: Nam Đà Nẵng, ven sông Hàn, ven biển — ưu nhược điểm đầu tư.', { schemaType: ARTICLE_SCHEMAS, priority: 0.7 }),
  route('/tin-tuc', PageType.ARTICLE, 'Tin Tức & Phân Tích BĐS Đà Nẵng 2026 | Estoria', 'Tin tức, phân tích và review khu vực bất động sản Đà Nẵng dành cho nhà đầu tư trung và dài hạn.', { schemaType: ARTICLE_SCHEMAS, priority: 0.7 }),
  route('/nha-dau-tu', PageType.FINANCIAL, 'Dữ Liệu Thị Trường BĐS Nam Đà Nẵng | Bảng Tin Đầu Tư 2026', 'Bảng tin dữ liệu đầu tư Nam Đà Nẵng: cơ hội, khu vực, dự án và phân tích cho nhà đầu tư.', { priority: 0.8 }),
  route('/gioi-thieu', PageType.ARTICLE, 'Giới Thiệu Estoria | Tư Vấn BĐS Đà Nẵng', 'Estoria — đội ngũ tư vấn bất động sản Đà Nẵng hỗ trợ nhà đầu tư bằng dữ liệu minh bạch và góc nhìn thẩm định thực tế.', { schemaType: ARTICLE_SCHEMAS, ogType: 'article', priority: 0.6 }),
  route('/tai-lieu-dau-tu', PageType.FINANCIAL, 'Tài Liệu Đầu Tư Nam Đà Nẵng | Báo Cáo & Khung Phân Tích', 'Tải báo cáo thị trường 2026, khung nhóm cơ hội đầu tư và bản đồ Nam Đà Nẵng.', { priority: 0.7 }),
  route('/lien-he', PageType.ARTICLE, 'Liên Hệ Tư Vấn BĐS Đà Nẵng | Hotline & Zalo', 'Liên hệ Estoria: hotline, Zalo, Messenger, email. Tư vấn miễn phí bất động sản Đà Nẵng cho nhà đầu tư.', { schemaType: ['defaultPage', 'BreadcrumbList', 'LocalBusiness'], priority: 0.6 }),
  route('/chinh-sach-bao-mat', PageType.LEGAL, 'Chính Sách Bảo Mật | BDSDanang.site', 'Cách BDSDanang.site thu thập và bảo vệ thông tin khi bạn liên hệ tư vấn BĐS Đà Nẵng — form, chat, Zalo và kênh chính thức.', { priority: 0.3 }),
  route('/dieu-khoan-su-dung', PageType.LEGAL, 'Điều Khoản Sử Dụng | BDSDanang.site', 'Điều khoản sử dụng BDSDanang.site: thông tin tham khảo, trách nhiệm nhà đầu tư và giới hạn tư vấn BĐS Đà Nẵng.', { priority: 0.3 }),
  route('/chinh-sach-cookie', PageType.LEGAL, 'Chính Sách Cookie | BDSDanang.site', 'Cookie trên BDSDanang.site: phiên làm việc, Google Analytics và cách quản lý tùy chọn theo dõi.', { priority: 0.3 }),
  route('/mien-tru-trach-nhiem', PageType.LEGAL, 'Miễn Trừ Trách Nhiệm | BDSDanang.site', 'Tuyên bố miễn trừ: thông tin BĐS tham khảo, không cam kết lợi nhuận, nhà đầu tư tự kiểm tra pháp lý trước giao dịch.', { priority: 0.3 }),
  route('/tac-gia/nguyen-phan-hoang-linh', PageType.ARTICLE, 'Linh Nguyễn | Tư Vấn BĐS Nam Đà Nẵng', 'Hồ sơ Linh Nguyễn — tư vấn bất động sản Nam Đà Nẵng, hỗ trợ nhà đầu tư với dữ liệu thị trường và chiến lược thẩm định.', { schemaType: ['defaultPage', 'BreadcrumbList', 'Person'], ogType: 'article', priority: 0.5 }),
];

const PROJECT_TITLES: Record<string, string> = {
  'sun-cosmo': 'Sun Cosmo Đà Nẵng | Căn Hộ Cao Cấp Sun Group',
  'sun-symphony': 'Sun Symphony Đà Nẵng | Căn Hộ Ven Sông Hàn',
  'sun-ponte': 'Sun Ponte Đà Nẵng | Shophouse & Căn Hộ Sun Group',
  'nam-da-nang': 'BĐS Nam Đà Nẵng | Đất, Nhà, Kho Xưởng & Đầu Tư',
  'bds-noi-bat': 'BĐS Nổi Bật | Cơ Hội Đa Dạng',
};

const PROJECT_DESCS: Record<string, string> = {
  'sun-cosmo': 'Sun Cosmo Đà Nẵng — căn hộ cao cấp Sun Group trung tâm, tiện ích, giá bán và cơ hội đầu tư dòng tiền.',
  'sun-symphony': 'Sun Symphony Đà Nẵng — quần thể Sun Group ven sông Hàn: căn hộ view sông, shophouse và đất nền dự án.',
  'sun-ponte': 'Sun Ponte Đà Nẵng — căn hộ và shophouse Sun Group ven sông Hàn trong hệ sinh thái Sun tại Đà Nẵng.',
  'nam-da-nang': 'BĐS Nam Đà Nẵng: đất nền, nhà phố, kho xưởng, căn hộ, khách sạn — Mai Đăng Chơn, Hòa Xuân, Hòa Quý…',
  'bds-noi-bat': 'BĐS nổi bật — tài sản đa khu vực, deal đáng thẩm định, cập nhật trên trang BĐS.',
};

for (const slug of PROJECT_SLUGS) {
  SEO_ROUTE_REGISTRY.push(
    route(`/du-an/${slug}`, PageType.PROJECT, PROJECT_TITLES[slug] || slug, PROJECT_DESCS[slug] || '', {
      schemaType: ARTICLE_SCHEMAS,
      ogType: 'article',
      priority: 0.8,
      group: 'project',
    }),
  );
}

const LANDING_MAP: Record<string, [string, string]> = {
  'dau-tu-da-nang': ['Đầu Tư BĐS Đà Nẵng 2026 | Hướng Dẫn Cho Nhà Đầu Tư', 'Hướng dẫn đầu tư bất động sản Đà Nẵng toàn diện: chọn khu vực, pháp lý, dòng tiền và rủi ro cho nhà đầu tư mới.'],
  'dau-tu-nam-da-nang': ['Đầu Tư Nam Đà Nẵng | Cơ Hội & Rủi Ro 2026', 'Phân tích đầu tư bất động sản Nam Đà Nẵng: quy hoạch, giá đất, dự án trọng điểm.'],
  'dau-tu-fpt-city': ['Đầu Tư FPT City Đà Nẵng | Chiến Lược 2026', 'Chiến lược đầu tư FPT City: đất nền, shophouse, timeline và checklist nhà đầu tư Hà Nội.'],
  'can-ho-da-nang-cho-thue': ['Căn Hộ Cho Thuê Đà Nẵng | Dòng Tiền Ổn Định', 'Căn hộ cho thuê Đà Nẵng: yield, khu vực hot, checklist chọn căn đầu tư dòng tiền.'],
  'can-ho-dau-tu-da-nang': ['Căn Hộ Đầu Tư Đà Nẵng | Sun Group Ven Sông Hàn', 'Căn hộ đầu tư Đà Nẵng: Sun Group ven sông Hàn, giá vào, thanh khoản thị trường thứ cấp.'],
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang': ['Nhà Đầu Tư Hà Nội Mua BĐS Đà Nẵng | Hướng Dẫn', 'Hướng dẫn nhà đầu tư Hà Nội mua bất động sản Đà Nẵng: quy trình, pháp lý, khảo sát từ xa.'],
  'dat-nen-nam-da-nang': ['Đất Nền Nam Đà Nẵng | Cơ Hội Đầu Tư 2026', 'Đất nền Nam Đà Nẵng: bản đồ giá, pháp lý, dự án ven sông và checklist mua đất an toàn.'],
};

for (const slug of SEO_LANDING_SLUGS) {
  const [title, description] = LANDING_MAP[slug] || [slug, ''];
  SEO_ROUTE_REGISTRY.push(
    route(`/${slug}`, PageType.ARTICLE, title, description, {
      schemaType: ARTICLE_SCHEMAS,
      ogType: 'article',
      priority: 0.7,
      group: 'landing',
    }),
  );
}

const BY_SLUG = new Map(SEO_ROUTE_REGISTRY.map(entry => [normalizePathname(entry.slug), entry]));

export function getSeoRouteByPath(pathname: string): SeoRouteDefinition | undefined {
  return BY_SLUG.get(normalizePathname(pathname));
}

export function getAllSeoRoutePaths(): string[] {
  return SEO_ROUTE_REGISTRY.map(entry => entry.slug).filter(slug => slug !== '/');
}
