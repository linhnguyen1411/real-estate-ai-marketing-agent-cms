import { SITE } from './siteConfig';
import { SEO_LANDING_SLUGS, PROJECT_SLUGS } from './routes';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  ogType?: 'website' | 'article' | 'product';
}

function meta(path: string, title: string, description: string, keywords?: string[], ogType: PageMeta['ogType'] = 'website'): PageMeta {
  return { path, title, description, keywords, ogType };
}

export const STATIC_PAGES: PageMeta[] = [
  meta('/', SITE.defaultTitle, SITE.defaultDescription, [...SITE.defaultKeywords]),
  meta('/bat-dong-san', 'Bất Động Sản Đà Nẵng 2026 | Danh Sách Căn Hộ & Đất Nền', 'Danh sách bất động sản Đà Nẵng cập nhật: căn hộ, đất nền, nhà phố Nam Đà Nẵng. Pháp lý rõ, giá minh bạch cho nhà đầu tư.'),
  meta('/can-ho', 'Căn Hộ Đà Nẵng | Cao Cấp, Cho Thuê & Đầu Tư 2026', 'Căn hộ Đà Nẵng Sun Group, FPT City, Nam Đà Nẵng — lọc theo giá, vị trí, pháp lý. Tư vấn dòng tiền cho nhà đầu tư trung và dài hạn.'),
  meta('/dat-nen', 'Đất Nền Đà Nẵng | Nam Đà Nẵng, FPT City 2026', 'Đất nền Đà Nẵng khu Nam, FPT City, ven sông — pháp lý sổ hồng, vị trí chiến lược cho đầu tư dài hạn.'),
  meta('/nha-pho', 'Nhà Phố Đà Nẵng | Kinh Doanh & Ở 2026', 'Nhà phố Đà Nẵng mặt tiền kinh doanh, shophouse khu vực trung tâm và Nam Đà Nẵng.'),
  meta('/du-an', 'Dự Án BĐS Đà Nẵng | FPT City, Sun Cosmo, Sun Symphony', 'Tổng hợp dự án bất động sản Đà Nẵng: FPT City, Sun Cosmo, Sun Symphony, Mai Đăng Chơn — phân tích tiềm năng đầu tư.'),
  meta('/nam-da-nang', 'BĐS Nam Đà Nẵng | Khu Vực Đầu Tư Trọng Điểm 2026', 'Bất động sản Nam Đà Nẵng: xu hướng giá, dự án mới, cơ hội cho nhà đầu tư trung và dài hạn.'),
  meta('/kien-thuc-dau-tu', 'Kiến Thức Đầu Tư BĐS Đà Nẵng | Hướng Dẫn 2026', 'Kiến thức đầu tư bất động sản Đà Nẵng: pháp lý, dòng tiền, chọn dự án, rủi ro và chiến lược cho người tìm kiếm cơ hội đầu tư.'),
  meta('/tin-thi-truong', 'Tin Thị Trường BĐS Đà Nẵng | Cập Nhật Mới Nhất', 'Tin tức thị trường bất động sản Đà Nẵng: giá đất, giao dịch, chính sách và xu hướng 2026.'),
  meta('/phan-tich', 'Phân Tích BĐS Đà Nẵng | Báo Cáo Đầu Tư', 'Phân tích chuyên sâu thị trường bất động sản Đà Nẵng theo khu vực, phân khúc và dòng tiền.'),
  meta('/review-khu-vuc', 'Review Khu Vực Đà Nẵng | Đánh Giá Tiềm Năng', 'Review chi tiết từng khu vực Đà Nẵng: Nam Đà Nẵng, FPT City, ven biển — ưu nhược điểm đầu tư.'),
  meta('/tin-tuc', 'Tin Tức & Phân Tích BĐS Đà Nẵng 2026 | Estoria', 'Tin tức, phân tích và review khu vực bất động sản Đà Nẵng dành cho nhà đầu tư trung và dài hạn.'),
  meta('/nha-dau-tu', 'Dữ Liệu Thị Trường BĐS Nam Đà Nẵng | Bảng Tin Đầu Tư 2026', 'Bảng tin dữ liệu đầu tư Nam Đà Nẵng: cơ hội, khu vực, dự án và phân tích cho nhà đầu tư.'),
  meta('/gioi-thieu', 'Giới Thiệu Estoria | Tư Vấn BĐS Đà Nẵng', 'Estoria — đội ngũ tư vấn bất động sản Đà Nẵng hỗ trợ nhà đầu tư bằng dữ liệu minh bạch và góc nhìn thẩm định thực tế.', undefined, 'article'),
  meta('/tai-lieu-dau-tu', 'Tài Liệu Đầu Tư Nam Đà Nẵng | Báo Cáo & TOP 20', 'Tải báo cáo thị trường 2026, danh sách cơ hội và bản đồ đầu tư Nam Đà Nẵng.'),
  meta('/lien-he', 'Liên Hệ Tư Vấn BĐS Đà Nẵng | Hotline & Zalo', 'Liên hệ Estoria: hotline, Zalo, Messenger, email. Tư vấn miễn phí bất động sản Đà Nẵng cho nhà đầu tư.'),
  meta('/chinh-sach-bao-mat', 'Chính Sách Bảo Mật | BDSDanang.site', 'Chính sách bảo mật thông tin khách hàng và dữ liệu cá nhân trên website BDSDanang.site.'),
  meta('/dieu-khoan-su-dung', 'Điều Khoản Sử Dụng | BDSDanang.site', 'Điều khoản sử dụng website bất động sản BDSDanang.site.'),
  meta('/chinh-sach-cookie', 'Chính Sách Cookie | BDSDanang.site', 'Chính sách sử dụng cookie và công nghệ theo dõi trên BDSDanang.site.'),
  meta('/mien-tru-trach-nhiem', 'Miễn Trừ Trách Nhiệm | BDSDanang.site', 'Tuyên bố miễn trừ trách nhiệm về thông tin bất động sản trên BDSDanang.site.'),
  meta('/tac-gia/nguyen-phan-hoang-linh', 'Linh Nguyễn | Tư Vấn BĐS Nam Đà Nẵng', 'Hồ sơ Linh Nguyễn — tư vấn bất động sản Nam Đà Nẵng, hỗ trợ nhà đầu tư với dữ liệu thị trường và chiến lược thẩm định.', undefined, 'article'),
];

export const PROJECT_PAGES: PageMeta[] = PROJECT_SLUGS.map(slug => {
  const titles: Record<string, string> = {
    'fpt-city': 'Dự Án FPT City Đà Nẵng | Đất Nền & Căn Hộ Đầu Tư',
    'sun-cosmo': 'Sun Cosmo Đà Nẵng | Căn Hộ Cao Cấp Sun Group',
    'sun-symphony': 'Sun Symphony Đà Nẵng | BĐS Nghỉ Dưỡng Cao Cấp',
    'mai-dang-chon': 'Mai Đăng Chơn Đà Nẵng | Khu Đô Thị Mới Nam Đà Nẵng',
  };
  const descs: Record<string, string> = {
    'fpt-city': 'Phân tích dự án FPT City Đà Nẵng: vị trí, quy hoạch, giá đất, tiềm năng cho nhà đầu tư Hà Nội.',
    'sun-cosmo': 'Sun Cosmo Đà Nẵng — căn hộ cao cấp Sun Group, tiện ích, giá bán và cơ hội đầu tư dòng tiền.',
    'sun-symphony': 'Sun Symphony Đà Nẵng — dự án nghỉ dưỡng cao cấp, phân tích đầu tư và thị trường thứ cấp.',
    'mai-dang-chon': 'Mai Đăng Chơn Nam Đà Nẵng — khu đô thị mới, đất nền và nhà phố tiềm năng.',
  };
  return meta(`/du-an/${slug}`, titles[slug] || slug, descs[slug] || '', undefined, 'article');
});

export const LANDING_PAGES: PageMeta[] = SEO_LANDING_SLUGS.map(slug => {
  const map: Record<string, [string, string]> = {
    'dau-tu-da-nang': ['Đầu Tư BĐS Đà Nẵng 2026 | Hướng Dẫn Cho Nhà Đầu Tư', 'Hướng dẫn đầu tư bất động sản Đà Nẵng toàn diện: chọn khu vực, pháp lý, dòng tiền và rủi ro cho nhà đầu tư mới.'],
    'dau-tu-nam-da-nang': ['Đầu Tư Nam Đà Nẵng | Cơ Hội & Rủi Ro 2026', 'Phân tích đầu tư bất động sản Nam Đà Nẵng: quy hoạch, giá đất, dự án trọng điểm.'],
    'dau-tu-fpt-city': ['Đầu Tư FPT City Đà Nẵng | Chiến Lược 2026', 'Chiến lược đầu tư FPT City: đất nền, shophouse, timeline và checklist nhà đầu tư Hà Nội.'],
    'can-ho-da-nang-cho-thue': ['Căn Hộ Cho Thuê Đà Nẵng | Dòng Tiền Ổn Định', 'Căn hộ cho thuê Đà Nẵng: yield, khu vực hot, checklist chọn căn đầu tư dòng tiền.'],
    'can-ho-dau-tu-da-nang': ['Căn Hộ Đầu Tư Đà Nẵng | Sun Group & FPT City', 'Căn hộ đầu tư Đà Nẵng: so sánh dự án, giá vào, thanh khoản thị trường thứ cấp.'],
    'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang': ['Nhà Đầu Tư Hà Nội Mua BĐS Đà Nẵng | Hướng Dẫn', 'Hướng dẫn nhà đầu tư Hà Nội mua bất động sản Đà Nẵng: quy trình, pháp lý, khảo sát từ xa.'],
    'dat-nen-nam-da-nang': ['Đất Nền Nam Đà Nẵng | Cơ Hội Đầu Tư 2026', 'Đất nền Nam Đà Nẵng: bản đồ giá, pháp lý, dự án ven sông và checklist mua đất an toàn.'],
  };
  const [title, description] = map[slug] || [slug, ''];
  return meta(`/${slug}`, title, description, undefined, 'article');
});

export function getPageMetaByPath(pathname: string): PageMeta | undefined {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const all = [...STATIC_PAGES, ...PROJECT_PAGES, ...LANDING_PAGES];
  return all.find(page => page.path === normalized);
}

export function getAllStaticPaths(): string[] {
  return [
    ...STATIC_PAGES.map(p => p.path),
    ...PROJECT_PAGES.map(p => p.path),
    ...LANDING_PAGES.map(p => p.path),
  ].filter(p => p !== '/');
}
