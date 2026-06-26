export interface LandingSection {
  id: string;
  title: string;
  content: string[];
}

export interface LandingPageData {
  slug: string;
  h1: string;
  /** Nhãn ngắn cho breadcrumb — tránh cắt giữa từ khi H1 dài */
  breadcrumbLabel?: string;
  heroSubtitle: string;
  sections: LandingSection[];
  benefits: { title: string; description: string }[];
  marketPoints: { label: string; value: string }[];
  faqs: { question: string; answer: string }[];
}

const HANOI_FUNNEL_CTA =
  'Điền form bên dưới để nhận danh sách cơ hội đầu tư Đà Nẵng được lọc theo ngân sách và mục tiêu — không spam, tư vấn 1-1.';

function baseFaqs(): { question: string; answer: string }[] {
  return [
    {
      question: 'Nhà đầu tư nên bắt đầu từ đâu khi mua BĐS Đà Nẵng?',
      answer:
        'Nên xác định mục tiêu (ở, cho thuê hay tích lũy), ngân sách và thời gian nắm giữ. Sau đó chọn 2–3 khu vực trọng điểm (Nam Đà Nẵng, FPT City, ven biển) và yêu cầu danh sách sản phẩm có pháp lý rõ để so sánh trước khi xuống Đà Nẵng khảo sát.',
    },
    {
      question: 'Mua BĐS Đà Nẵng từ xa có an toàn không?',
      answer:
        'Có thể an toàn nếu làm việc với đơn vị tư vấn uy tín, kiểm tra pháp lý tại Sở Tư pháp, xem hình ảnh thực tế và ký hợp đồng qua luật sư. Estoria hỗ trợ checklist pháp lý và lịch khảo sát trực tiếp cho nhà đầu tư.',
    },
    {
      question: 'Làm sao nhận danh sách cơ hội đầu tư?',
      answer: HANOI_FUNNEL_CTA,
    },
  ];
}

export const LANDING_PAGES_DATA: Record<string, LandingPageData> = {
  'dau-tu-da-nang': {
    slug: 'dau-tu-da-nang',
    h1: 'Đầu Tư Bất Động Sản Đà Nẵng 2026 — Hướng Dẫn Toàn Diện',
    heroSubtitle: 'Chiến lược chọn khu vực, pháp lý và dòng tiền cho nhà đầu tư trung và dài hạn',
    marketPoints: [
      { label: 'Tăng trưởng dân số', value: 'Ổn định ~1.2M+' },
      { label: 'Hạ tầng', value: 'Sân bay, cao tốc, cầu mới' },
      { label: 'Phân khúc hot', value: 'Căn hộ + Nam Đà Nẵng' },
      { label: 'Khách Bắc', value: 'Chiếm tỷ trọng tăng' },
    ],
    benefits: [
      { title: 'Dữ liệu thực tế', description: 'Giá, pháp lý và hình ảnh từng sản phẩm — không quảng cáo ảo.' },
      { title: 'Tư vấn 1-1', description: 'Đội ngũ Estoria hỗ trợ khách Hà Nội khảo sát và chốt từ xa.' },
      { title: 'Lọc theo mục tiêu', description: 'Dòng tiền, tích lũy hoặc ở — danh sách riêng cho từng nhu cầu.' },
      { title: 'Minh bạch pháp lý', description: 'Checklist sổ hồng, HĐMB, quy hoạch trước khi đặt cọc.' },
    ],
    sections: [
      {
        id: 'overview',
        title: 'Vì sao Đà Nẵng vẫn là điểm đến đầu tư BĐS phía Nam?',
        content: [
          'Đà Nẵng duy trì vị thế đô thị trung tâm miền Trung với hạ tầng giao thông kết nối Bắc — Nam thuận lợi. Trong bối cảnh 2026, dòng vốn liên vùng tiếp tục tìm kiếm thị trường có thanh khoản tốt hơn so với TP.HCM nhưng vẫn đủ quy mô và tiềm năng tăng giá.',
          'Phân khúc căn hộ cao cấp (Sun Group, FPT City) và đất nền Nam Đà Nẵng là hai nhóm sản phẩm được nhà đầu tư Bắc quan tâm nhất: một bên cho dòng tiền cho thuê và thanh khoản, một bên cho tích lũy dài hạn theo quy hoạch.',
          'Điểm mấu chốt không phải “mua mọi thứ ở Đà Nẵng” mà là chọn đúng khu vực — đúng thời điểm — đúng pháp lý. Bài viết này tổng hợp khung tư duy trước khi anh/chị nhận danh sách cơ hội đầu tư được lọc cá nhân hóa.',
        ],
      },
      {
        id: 'segments',
        title: 'Ba phân khúc đầu tư trọng tâm',
        content: [
          '**Căn hộ cho thuê:** Phù hợp nhà đầu tư cần dòng tiền ổn định. Ưu tiên dự án đã bàn giao, khu vực có nhu cầu thuê thực (gần biển, trung tâm, khu công nghệ). Yield thực tế cần trừ chi phí quản lý, thuế và thời gian trống phòng.',
          '**Căn hộ tích lũy:** Mua ở giai đoạn mở bán hoặc thị trường thứ cấp giảm sâu. Rủi ro cao hơn nhưng biên lợi nhuận lớn nếu chọn đúng dự án có hạ tầng xác nhận.',
          '**Đất nền Nam Đà Nẵng:** Phù hợp vốn lớn, thời gian nắm giữ 3–7 năm. Bắt buộc kiểm tra quy hoạch, lộ giới và lịch sử pháp lý từng lô.',
        ],
      },
      {
        id: 'process',
        title: 'Quy trình 5 bước cho nhà đầu tư từ xa',
        content: [
          '1. Xác định mục tiêu và ngân sách (bao gồm thuế, phí sang tên, chi phí sửa chữa nếu cho thuê).',
          '2. Nhận danh sách 5–10 sản phẩm phù hợp — so sánh trên cùng một bảng tiêu chí.',
          '3. Kiểm tra pháp lý từng sản phẩm (sổ, quy hoạch, tranh chấp).',
          '4. Khảo sát trực tiếp hoặc video call walkthrough cùng tư vấn viên.',
          '5. Đàm phán, ký hợp đồng qua công chứng và lập kế hoạch cho thuê / bán lại.',
        ],
      },
      {
        id: 'risks',
        title: 'Rủi ro cần nhận diện',
        content: [
          'Mua theo lời cam kết lợi nhuận không có căn cứ; không kiểm tra pháp lý; vượt đòn bẩy tài chính; chọn khu vực chưa có hạ tầng xác nhận. Estoria cam kết trình bày cả ưu và nhược điểm từng sản phẩm trước khi khách quyết định.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang': {
    slug: 'nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang',
    h1: 'Nhà Đầu Tư Hà Nội Mua Bất Động Sản Đà Nẵng',
    heroSubtitle: 'Quy trình, pháp lý và checklist khảo sát từ xa — cập nhật 2026',
    marketPoints: [
      { label: 'Bay HN–DAD', value: '~1h15' },
      { label: 'Khảo sát', value: '1–2 ngày' },
      { label: 'Pháp lý', value: 'Công chứng tại ĐN' },
      { label: 'Hỗ trợ', value: 'Tư vấn 1-1' },
    ],
    benefits: [
      { title: 'Lịch khảo sát gọn', description: 'Sắp xếp xem 5–8 sản phẩm trong 1–2 ngày tại Đà Nẵng.' },
      { title: 'So sánh bảng Excel', description: 'Giá, diện tích, pháp lý, yield trên cùng một file.' },
      { title: 'Đồng hành pháp lý', description: 'Giới thiệu luật sư, công chứng khi cần.' },
      { title: 'Sau bán hàng', description: 'Hỗ trợ cho thuê, quản lý căn sau khi mua.' },
    ],
    sections: [
      {
        id: 'why',
        title: 'Vì sao nhà đầu tư Hà Nội chọn Đà Nẵng?',
        content: [
          'Giá vào thấp hơn nhiều phân khúc tại Hà Nội với cùng chất lượng sống biển và hạ tầng. Thanh khoản thị trường thứ cấp căn hộ tốt hơn nhiều tỉnh nhỏ. Chính quyền Đà Nẵng ổn định, thông tin quy hoạch tra cứu được.',
          'Nhiều khách Estoria tại Hà Nội mua căn cho thuê hoặc đất nền Nam Đà Nẵng với tầm nhìn 5 năm, kết hợp nghỉ dưỡng gia đình.',
        ],
      },
      {
        id: 'checklist',
        title: 'Checklist mua từ xa',
        content: [
          'Xác minh sổ đỏ / HĐMB tại Văn phòng đăng ký đất đai.',
          'Yêu cầu video walkthrough 360° hoặc livestream xem nhà.',
          'Không chuyển tiền vào tài khoản cá nhân không hợp đồng.',
          'Giữ lại toàn bộ biên nhận, hợp đồng và trao đổi Zalo/email.',
          'Dự phòng 10–15% ngân sách cho phí phát sinh và sửa chữa.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'dau-tu-nam-da-nang': {
    slug: 'dau-tu-nam-da-nang',
    h1: 'Đầu Tư Bất Động Sản Nam Đà Nẵng',
    heroSubtitle: 'Quy hoạch, giá đất và dự án ven sông — phân tích 2026',
    marketPoints: [
      { label: 'Xu hướng', value: 'Mở rộng đô thị' },
      { label: 'Sản phẩm', value: 'Đất nền, nhà phố' },
      { label: 'Khách hàng', value: 'Đầu tư dài hạn' },
      { label: 'Rủi ro', value: 'Quy hoạch' },
    ],
    benefits: [
      { title: 'Bản đồ khu vực', description: 'Phân tích từng tiểu khu Nam Đà Nẵng.' },
      { title: 'Giá thực tế', description: 'Cập nhật giao dịch gần nhất, không giá ảo.' },
      { title: 'Pháp lý lô đất', description: 'Kiểm tra lộ giới, quy hoạch từng lô.' },
      { title: 'Timeline', description: 'Gợi ý thời điểm vào theo chu kỳ.' },
    ],
    sections: [
      {
        id: 'intro',
        title: 'Nam Đà Nẵng trong bức tranh đầu tư',
        content: [
          'Nam Đà Nẵng là hướng mở rộng đô thị tự nhiên với quỹ đất lớn, nhiều dự án ven sông và khu đô thị mới. Đây là lựa chọn của nhà đầu tư chấp nhận illiquidity (khó bán nhanh) để đổi lấy biên tăng giá dài hạn.',
          'FPT City, Mai Đăng Chơn và các khu dân cư ven sông Cẩm Lệ — Hòa Xuân tạo thành tam giác được quan tâm. Mỗi khu có đặc thù pháp lý và nhịp tăng giá khác nhau.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'dau-tu-fpt-city': {
    slug: 'dau-tu-fpt-city',
    h1: 'Đầu Tư FPT City Đà Nẵng — Chiến Lược & Checklist',
    breadcrumbLabel: 'Đầu tư FPT City',
    heroSubtitle: 'Đất nền, shophouse và căn hộ trong hệ sinh thái FPT — khung phân tích, không phải bảng chào bán',
    marketPoints: [
      { label: 'Chủ đầu tư', value: 'FPT / đối tác' },
      { label: 'Vị trí', value: 'Nam Đà Nẵng' },
      { label: 'Sản phẩm', value: 'Đa dạng' },
      { label: 'Thanh khoản', value: 'Trung bình+' },
    ],
    benefits: [
      { title: 'Hạ tầng nội khu', description: 'Đường nội bộ, tiện ích, an ninh đồng bộ.' },
      { title: 'Cộng đồng cư dân', description: 'FPT, công nghệ, ổn định dân cư.' },
      { title: 'Đa sản phẩm', description: 'Từ đất nền đến căn hộ — lựa chọn theo vốn.' },
      { title: 'Tư vấn chọn lô', description: 'So sánh vị trí, hướng, giá từng phân khu.' },
    ],
    sections: [
      {
        id: 'about',
        title: 'FPT City là gì?',
        content: [
          'FPT City là khu đô thị phức hợp phía Nam Đà Nẵng, gắn với thương hiệu FPT, Khu CNC và Làng Đại học Hòa Quý. Khu vực hút nhà đầu tư thích quy hoạch rõ, hạ tầng đồng bộ và cộng đồng lao động tri thức có thu nhập ổn định.',
          'Cần phân biệt từng phân khu (đất nền, nhà phố, căn hộ, shophouse) vì thanh khoản, chi phí sở hữu và mô hình khai thác khác nhau đáng kể — không gom chung cả dự án vào một nhãn “đã xong hạ tầng”.',
        ],
      },
      {
        id: 'strategy',
        title: 'Chiến lược đầu tư theo mục tiêu',
        content: [
          '**Tích lũy 3–5 năm:** Ưu tiên đất nền ven trục đã có đường nội bộ, so sánh tiến độ từng block bằng ảnh vệ tinh theo quý. Chấp nhận thanh khoản chậm trong giai đoạn chờ hạ tầng.',
          '**Dòng tiền trung hạn:** Căn hộ 1–2PN đã bàn giao quanh FPT City hoặc Khu CNC — lấy giá thuê thực tế từ 3 căn tương đương, trừ phí quản lý và thời gian trống phòng.',
          '**Kinh doanh / shophouse:** Chỉ vào khi có dự toán lấp đầy thuê kinh doanh và cư dân đã về ổn định — shophouse giai đoạn đầu có thể trống 18–24 tháng.',
        ],
      },
      {
        id: 'checklist',
        title: 'Checklist trước khi xuống tiền tại FPT City',
        content: [
          'Xác định mục tiêu (tích lũy / dòng tiền / kinh doanh) và trần ngân sách all-in (mua + thuế + sửa + dự phòng 12 tháng).',
          'So sánh 5 giao dịch tương đương cùng loại tài sản — lấy từ tin thật, không chỉ brochure.',
          'Kiểm tra tiến độ đường nội bộ phân khu, ranh giới quy hoạch đất ở và CNC trên bản đồ sử dụng đất.',
          'Tra cứu thế chấp, công chứng và mục đích sử dụng đất trên sổ trước đặt cọc.',
          'Khảo sát trực tiếp tối thiểu 1–2 ngày tại Nam Đà Nẵng — hoặc video walkthrough có timestamp.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'can-ho-da-nang-cho-thue': {
    slug: 'can-ho-da-nang-cho-thue',
    h1: 'Căn Hộ Cho Thuê Đà Nẵng — Dòng Tiền & Yield',
    heroSubtitle: 'Chọn căn, khu vực và quản lý cho thuê hiệu quả',
    marketPoints: [
      { label: 'Yield TB', value: '4–7%/năm' },
      { label: 'Khu hot', value: 'Biển, trung tâm' },
      { label: 'Khách thuê', value: 'CN, expat, du lịch' },
      { label: 'Chi phí', value: 'QL + thuế' },
    ],
    benefits: [
      { title: 'Tính yield thực', description: 'Trừ phí quản lý, trống phòng, thuế.' },
      { title: 'Chọn tầng & view', description: 'Ảnh hưởng trực tiếp tới giá thuê.' },
      { title: 'Nội thất', description: 'Gói setup tối giản cho thuê ngay.' },
      { title: 'Quản lý', description: 'Giới thiệu đơn vị quản lý uy tín.' },
    ],
    sections: [
      {
        id: 'yield',
        title: 'Cách tính yield căn hộ cho thuê Đà Nẵng',
        content: [
          'Yield = (Thu nhập thuê năm − Chi phí) / Tổng vốn bỏ ra × 100%. Chi phí gồm: phí quản lý, sửa chữa, thuế, thời gian trống phòng. Nhiều quảng cáo chỉ tính yield gộp — nhà đầu tư cần yield ròng.',
          'Căn 1–2 phòng ngủ gần biển hoặc trung tâm thường có tỷ lệ lấp đầy tốt hơn căn lớn. Sun Cosmo, các dự án đã bàn giao ven biển là nhóm được hỏi nhiều.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'can-ho-dau-tu-da-nang': {
    slug: 'can-ho-dau-tu-da-nang',
    h1: 'Căn Hộ Đầu Tư Đà Nẵng 2026',
    heroSubtitle: 'So sánh dự án, giá vào và thanh khoản thứ cấp',
    marketPoints: [
      { label: 'Dự án', value: 'Sun, FPT, khác' },
      { label: 'Giá vào', value: 'Theo từng đợt' },
      { label: 'TT2', value: 'Thanh khoản tốt' },
      { label: 'Rủi ro', value: 'Pháp lý, tiến độ' },
    ],
    benefits: [
      { title: 'So sánh dự án', description: 'Bảng điểm theo 10 tiêu chí.' },
      { title: 'Giá thị trường', description: 'Cập nhật chào bán thực tế.' },
      { title: 'Pháp lý căn hộ', description: 'Sổ hồng, phí bảo trì, quỹ.' },
      { title: 'Exit strategy', description: 'Kế hoạch bán lại hoặc cho thuê.' },
    ],
    sections: [
      {
        id: 'compare',
        title: 'Tiêu chí chọn căn hộ đầu tư',
        content: [
          'Vị trí thực tế (không chỉ trên bản đồ marketing), tiến độ bàn giao, uy tín chủ đầu tư, phí quản lý, mật độ cho thuê xung quanh, và lịch sử giao dịch thị trường thứ cấp.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
  'dat-nen-nam-da-nang': {
    slug: 'dat-nen-nam-da-nang',
    h1: 'Đất Nền Nam Đà Nẵng — Cơ Hội & Checklist Pháp Lý',
    heroSubtitle: 'Chọn lô, kiểm tra quy hoạch và tránh rủi ro',
    marketPoints: [
      { label: 'Quỹ đất', value: 'Đa dạng' },
      { label: 'Giá', value: 'Theo khu vực' },
      { label: 'Pháp lý', value: 'Bắt buộc kiểm tra' },
      { label: 'TG nắm giữ', value: '3–7 năm' },
    ],
    benefits: [
      { title: 'Checklist pháp lý', description: 'Sổ, quy hoạch, lộ giới, tranh chấp.' },
      { title: 'So sánh lô', description: 'Hướng, diện tích, đường vào.' },
      { title: 'Giá khu vực', description: 'Bảng giá tham chiếu cập nhật.' },
      { title: 'Tư vấn đàm phán', description: 'Hỗ trợ thương lượng với chủ đất.' },
    ],
    sections: [
      {
        id: 'legal',
        title: 'Pháp lý đất nền — không được bỏ qua',
        content: [
          'Tra cứu quy hoạch tại cổng thông tin địa chính hoặc qua dịch vụ uy tín. Xác minh chủ sở hữu trên sổ khớp CMND/CCCD. Kiểm tra thế chấp ngân hàng, tranh chấp, diện tích thực đo. Không đặt cọc khi chưa có xác nhận pháp lý bằng văn bản.',
        ],
      },
    ],
    faqs: baseFaqs(),
  },
};

export function getLandingPage(slug: string): LandingPageData | undefined {
  return LANDING_PAGES_DATA[slug];
}
