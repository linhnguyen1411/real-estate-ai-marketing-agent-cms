/** Danh mục BĐS — 3 trụ cột trọng tâm của site */

export type PortfolioPillarId = 'sun-group' | 'nam-da-nang' | 'noi-bat';

export interface PortfolioPillar {
  id: PortfolioPillarId;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  productTypes: string[];
}

export const PORTFOLIO_PILLARS: PortfolioPillar[] = [
  {
    id: 'sun-group',
    title: 'Sun Group Đà Nẵng',
    subtitle: 'Thương hiệu chủ lực',
    description:
      'Căn hộ cao cấp ven sông Hàn, shophouse, nhà phố thương mại và đất nền trong các dự án Sun Group tại Đà Nẵng.',
    href: '/du-an#sun-group',
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Nhà phố thương mại', 'Đất nền dự án'],
  },
  {
    id: 'nam-da-nang',
    title: 'BĐS Nam Đà Nẵng',
    subtitle: 'Mũi nhọn khu vực',
    description:
      'Đa dạng loại hình tại Nam Đà Nẵng: nhà ở, đất nền, kho xưởng, căn hộ, khách sạn và tài sản đầu tư — Mai Đăng Chơn, Hòa Xuân, Hòa Quý…',
    href: '/du-an/nam-da-nang',
    productTypes: ['Đất nền', 'Nhà phố', 'Kho xưởng', 'Căn hộ', 'Khách sạn', 'Đầu tư'],
  },
  {
    id: 'noi-bat',
    title: 'BĐS nổi bật',
    subtitle: 'Cơ hội đa dạng',
    description:
      'Tài sản đáng chú ý từ nhiều khu vực — deal giá tốt, vị trí độc đáo, không gói gọn trong một dự án hay một quận.',
    href: '/du-an/bds-noi-bat',
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

const SUN_FAQ_DEFAULT = [
  {
    question: 'Làm sao nhận bảng giá căn Sun Group đang mở bán?',
    answer: 'Liên hệ hotline hoặc Zalo — chúng tôi gửi giỏ hàng ngoại giao và căn thứ cấp phù hợp ngân sách, kèm pháp lý sơ bộ.',
  },
];

export const PROJECTS: Record<string, ProjectData> = {
  'sun-symphony': {
    slug: 'sun-symphony',
    pillar: 'sun-group',
    name: 'Sun Symphony',
    location: 'Ven sông Hàn · Đà Nẵng',
    summary:
      'Quần thể cao cấp Sun Group ven sông Hàn: Symphony, S Light, Spana, Cora, FourS — căn hộ view sông, shophouse và sản phẩm dòng tiền.',
    highlights: ['Ven sông Hàn', 'Symphony · S Light · Spana', 'Căn ngoại giao', 'Dòng tiền & tích sản'],
    productTypes: ['Căn hộ cao cấp', 'Shophouse', 'Đất nền dự án'],
    faqs: [
      {
        question: 'Sun Symphony khác các tòa S Light / Spana thế nào?',
        answer: 'Mỗi tòa có vị trí, view và chính sách cho thuê khác nhau. Cần so sánh giá/m², phí quản lý và thanh khoản thứ cấp trước khi chọn.',
      },
      ...SUN_FAQ_DEFAULT,
    ],
    ctaHref: '/can-ho',
  },
  'sun-cosmo': {
    slug: 'sun-cosmo',
    pillar: 'sun-group',
    name: 'Sun Cosmo',
    location: 'Trung tâm Đà Nẵng',
    summary: 'Căn hộ cao cấp Sun Group tại trung tâm — tiện ích đồng bộ, phù hợp ở và đầu tư cho thuê.',
    highlights: ['Sun Group', 'Trung tâm thành phố', 'Tiện ích cao cấp', 'Thanh khoản TT2'],
    productTypes: ['Căn hộ cao cấp', 'Shophouse'],
    faqs: [
      {
        question: 'Sun Cosmo cho thuê có ổn không?',
        answer: 'Tùy tầng, view và nội thất. Cần tính yield ròng sau phí quản lý và mùa thấp điểm du lịch.',
      },
      ...SUN_FAQ_DEFAULT,
    ],
    ctaHref: '/can-ho',
  },
  'sun-ponte': {
    slug: 'sun-ponte',
    pillar: 'sun-group',
    name: 'Sun Ponte',
    location: 'Ven sông Hàn · Đà Nẵng',
    summary: 'Dòng sản phẩm Sun Group ven sông — căn hộ và shophouse thương mại trong hệ sinh thái Sun tại Đà Nẵng.',
    highlights: ['Sông Hàn', 'Shophouse', 'Sun Group', 'Thương mại & ở'],
    productTypes: ['Căn hộ', 'Shophouse', 'Nhà phố thương mại'],
    faqs: SUN_FAQ_DEFAULT,
    ctaHref: '/can-ho',
  },
  'nam-da-nang': {
    slug: 'nam-da-nang',
    pillar: 'nam-da-nang',
    name: 'BĐS Nam Đà Nẵng',
    location: 'Nam Đà Nẵng',
    summary:
      'Phân khúc mũi nhọn của chúng tôi: đất nền, nhà phố, kho xưởng, căn hộ, khách sạn và tài sản đầu tư tập trung tại Nam Đà Nẵng — Mai Đăng Chơn, Hòa Xuân, Hòa Quý, Cẩm Lệ…',
    highlights: ['Đất nền & nhà phố', 'Kho xưởng', 'Khách sạn', 'Mai Đăng Chơn'],
    productTypes: ['Đất nền', 'Nhà ở', 'Kho xưởng', 'Căn hộ', 'Khách sạn', 'Đầu tư'],
    faqs: [
      {
        question: 'Nam Đà Nẵng nên ưu tiên loại hình nào?',
        answer: 'Tùy vốn và mục tiêu: đất nền/nhà phố cho tích sản dài hạn; kho xưởng hoặc khách sạn cho dòng tiền thương mại. Nên thẩm định pháp lý từng lô.',
      },
      {
        question: 'Mai Đăng Chơn thuộc phân khúc nào?',
        answer: 'Mai Đăng Chơn nằm trong danh mục BĐS Nam Đà Nẵng — quỹ đất mặt tiền và nhà phố thương mại, không tách riêng như dự án Sun Group.',
      },
    ],
    ctaHref: '/nam-da-nang',
  },
  'bds-noi-bat': {
    slug: 'bds-noi-bat',
    pillar: 'noi-bat',
    name: 'BĐS nổi bật',
    location: 'Đà Nẵng & vùng lân cận',
    summary:
      'Các tài sản đáng chú ý được lọc theo pháp lý và tiềm năng — rải rác nhiều khu vực, không gói trong một dự án cố định. Cập nhật thường xuyên trên trang BĐS.',
    highlights: ['Đa khu vực', 'Deal đáng thẩm định', 'Giá & vị trí hấp dẫn', 'Cập nhật liên tục'],
    productTypes: ['Căn hộ', 'Đất & nhà', 'Shophouse', 'Khách sạn', 'Tài sản đặc biệt'],
    faqs: [
      {
        question: 'BĐS nổi bật khác danh mục Sun Group / Nam Đà Nẵng thế nào?',
        answer: 'Sun Group và Nam Đà Nẵng là hai trụ cột có định hướng rõ. BĐS nổi bật gom các deal đặc biệt — giá tốt, cắt lỗ, hoặc vị trí độc đáo — từ nhiều nơi, kể cả ngoài Nam Đà Nẵng.',
      },
      {
        question: 'Làm sao xem danh sách BĐS nổi bật hiện tại?',
        answer: 'Vào trang Bất động sản hoặc liên hệ Zalo để nhận danh sách cập nhật theo ngân sách và loại hình bạn quan tâm.',
      },
    ],
    ctaHref: '/bat-dong-san',
  },
};

/** Dự án Sun Group (trang chi tiết) */
export const SUN_GROUP_PROJECT_SLUGS = ['sun-symphony', 'sun-cosmo', 'sun-ponte'] as const;

/** Trang phân khúc (không phải dự án developer) */
export const PORTFOLIO_SEGMENT_SLUGS = ['nam-da-nang', 'bds-noi-bat'] as const;

export const PROJECT_SLUGS = [...SUN_GROUP_PROJECT_SLUGS, ...PORTFOLIO_SEGMENT_SLUGS] as const;

/** URL cũ → chuyển hướng (giữ SEO, không gãy link) */
export const LEGACY_PROJECT_REDIRECTS: Record<string, string> = {
  'fpt-city': '/nam-da-nang',
  'mai-dang-chon': '/du-an/nam-da-nang',
  'gio-hang-ky-gui': '/du-an/bds-noi-bat',
};

export function getSunGroupProjects() {
  return SUN_GROUP_PROJECT_SLUGS.map(slug => PROJECTS[slug]).filter(Boolean);
}

export function getProjectBySlug(slug: string) {
  return PROJECTS[slug];
}
