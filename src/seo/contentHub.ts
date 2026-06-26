
export interface ContentCategory {
  slug: string;
  title: string;
  description: string;
  path: string;
  keywords: string[];
}

export const CONTENT_HUB_CATEGORIES: ContentCategory[] = [
  {
    slug: 'kien-thuc-dau-tu',
    title: 'Kiến thức đầu tư',
    description: 'Hướng dẫn đầu tư BĐS Đà Nẵng từ cơ bản đến nâng cao.',
    path: '/kien-thuc-dau-tu',
    keywords: ['kiến thức đầu tư bđs', 'hướng dẫn mua đất đà nẵng'],
  },
  {
    slug: 'tin-thi-truong',
    title: 'Tin thị trường',
    description: 'Cập nhật giá, giao dịch và chính sách mới.',
    path: '/tin-thi-truong',
    keywords: ['tin bđs đà nẵng', 'giá đất đà nẵng'],
  },
  {
    slug: 'phan-tich',
    title: 'Phân tích',
    description: 'Báo cáo phân tích theo khu vực và phân khúc.',
    path: '/phan-tich',
    keywords: ['phân tích bđs đà nẵng'],
  },
  {
    slug: 'review-khu-vuc',
    title: 'Review khu vực',
    description: 'Đánh giá tiềm năng từng khu vực Đà Nẵng.',
    path: '/review-khu-vuc',
    keywords: ['review khu vực đà nẵng'],
  },
  {
    slug: 'du-an',
    title: 'Danh mục BĐS',
    description: 'Sun Group Đà Nẵng, BĐS Nam Đà Nẵng và BĐS nổi bật — danh mục bất động sản Estoria tại Đà Nẵng.',
    path: '/du-an',
    keywords: ['danh mục bđs đà nẵng', 'sun group đà nẵng'],
  },
  {
    slug: 'can-ho',
    title: 'Căn hộ',
    description: 'Căn hộ Sun Group ven sông Hàn và trung tâm.',
    path: '/can-ho',
    keywords: ['căn hộ đà nẵng', 'căn hộ sun group'],
  },
  {
    slug: 'dat-nen',
    title: 'Đất nền',
    description: 'Đất nền Nam Đà Nẵng và đất nền dự án Sun Group.',
    path: '/dat-nen',
    keywords: ['đất nền đà nẵng'],
  },
  {
    slug: 'phap-ly',
    title: 'Pháp lý',
    description: 'Sổ hồng, quy hoạch, thủ tục sang tên.',
    path: '/kien-thuc-dau-tu#phap-ly',
    keywords: ['pháp lý bđs đà nẵng'],
  },
];

export { PROJECTS, getSunGroupProjects, getProjectBySlug } from './portfolioHub';
export type { ProjectData } from './portfolioHub';
