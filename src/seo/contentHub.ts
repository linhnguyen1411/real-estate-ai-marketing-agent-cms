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
    title: 'Dự án',
    description: 'FPT City, Sun Cosmo, Sun Symphony và hơn thế.',
    path: '/du-an',
    keywords: ['dự án bđs đà nẵng'],
  },
  {
    slug: 'can-ho',
    title: 'Căn hộ',
    description: 'Căn hộ cao cấp, cho thuê và đầu tư.',
    path: '/can-ho',
    keywords: ['căn hộ đà nẵng'],
  },
  {
    slug: 'dat-nen',
    title: 'Đất nền',
    description: 'Đất nền Nam Đà Nẵng và ven sông.',
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

export interface ProjectData {
  slug: string;
  name: string;
  location: string;
  summary: string;
  highlights: string[];
  faqs: { question: string; answer: string }[];
}

export const PROJECTS: Record<string, ProjectData> = {
  'fpt-city': {
    slug: 'fpt-city',
    name: 'FPT City Đà Nẵng',
    location: 'Nam Đà Nẵng',
    summary: 'Khu đô thị phức hợp phía Nam với hạ tầng đồng bộ, đa sản phẩm từ đất nền đến căn hộ.',
    highlights: ['Hạ tầng nội khu', 'Cộng đồng FPT', 'Đa phân khúc giá', 'Tiềm năng dài hạn'],
    faqs: [
      { question: 'FPT City có phù hợp nhà đầu tư Hà Nội?', answer: 'Phù hợp nếu mục tiêu tích lũy 3–5 năm và chấp nhận thanh khoản trung bình. Nên so sánh với đất nền Nam Đà Nẵng khác trước khi quyết định.' },
      { question: 'Làm sao nhận danh sách sản phẩm FPT City?', answer: 'Điền form nhận danh sách cơ hội đầu tư Đà Nẵng — chúng tôi lọc sản phẩm FPT City theo ngân sách của anh/chị.' },
    ],
  },
  'sun-cosmo': {
    slug: 'sun-cosmo',
    name: 'Sun Cosmo Đà Nẵng',
    location: 'Đà Nẵng',
    summary: 'Căn hộ cao cấp thương hiệu Sun Group, tiện ích resort, phù hợp đầu tư và nghỉ dưỡng.',
    highlights: ['Thương hiệu Sun Group', 'Tiện ích cao cấp', 'Cho thuê ngắn hạn', 'Thanh khoản TT2'],
    faqs: [
      { question: 'Sun Cosmo cho thuê có ổn không?', answer: 'Tùy tầng, view và nội thất. Cần tính yield ròng sau phí quản lý và mùa thấp điểm.' },
    ],
  },
  'sun-symphony': {
    slug: 'sun-symphony',
    name: 'Sun Symphony Đà Nẵng',
    location: 'Đà Nẵng',
    summary: 'Dự án nghỉ dưỡng cao cấp trong hệ sinh thái Sun, hướng tới khách hàng premium.',
    highlights: ['Nghỉ dưỡng cao cấp', 'Sun Group', 'Thương hiệu quốc tế', 'Tiềm năng brand'],
    faqs: [
      { question: 'Sun Symphony khác Sun Cosmo thế nào?', answer: 'Symphony định vị nghỉ dưỡng cao cấp hơn; Cosmo đa dạng hơn về sản phẩm và giá. Cần xem mục tiêu đầu tư cụ thể.' },
    ],
  },
  'mai-dang-chon': {
    slug: 'mai-dang-chon',
    name: 'Mai Đăng Chơn',
    location: 'Nam Đà Nẵng',
    summary: 'Khu đô thị mới Nam Đà Nẵng với quỹ đất và nhà phố tiềm năng.',
    highlights: ['Khu đô thị mới', 'Nam Đà Nẵng', 'Đất + nhà phố', 'Giá vào hợp lý'],
    faqs: [
      { question: 'Mai Đăng Chơn có đáng đầu tư?', answer: 'Cần đánh giá tiến độ hạ tầng, pháp lý từng lô và so sánh với FPT City cùng khu vực.' },
    ],
  },
};
