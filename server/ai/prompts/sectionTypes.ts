import type { ArticleType } from '../../blog/categorySuggest';

/** Mỗi loại section = một góc viết khác nhau — tránh essay template */
export const SECTION_TYPE_GUIDE: Record<string, string> = {
  location: 'Phân tích vị trí — đường, nút giao thông, hướng kết nối, không chung chung',
  comparison: 'So sánh với 1 khu vực hoặc sản phẩm khác cùng phân khúc',
  usage: 'Khai thác sử dụng thực tế — ở, cho thuê, kinh doanh',
  liquidity: 'Thanh khoản — ai mua, tốc độ giao dịch, yếu tố ảnh hưởng',
  audience: 'Nhóm khách hàng phù hợp — phân loại rõ, không gộp chung',
  watchpoints: 'Điều cần quan sát thêm — cụ thể, không disclaimer',
  strengths: 'Điểm mạnh có dữ kiện — không cảm thán',
  tradeoffs: 'Hạn chế / đánh đổi — thẳng thắn, không kết luận mơ hồ',
  legal: 'Pháp lý & hồ sơ — nêu điểm cần đối chiếu',
  cashflow: 'Dòng tiền / khai thác — kịch bản, không cam kết lãi',
  context: 'Bối cảnh ngắn — tối đa 1 đoạn, không heading "bối cảnh thị trường"',
  scenario: 'Kịch bản xấu / cơ sở — số giả định phải ghi rõ là giả định',
  signal: 'Tín hiệu thị trường cụ thể — sự kiện, hạ tầng, không "động lực tăng trưởng"',
  lesson: 'Bài học rút ra — từ case, không moralize',
};

export const ARTICLE_SECTION_PLANS: Record<ArticleType, string[]> = {
  'review-project': ['location', 'strengths', 'tradeoffs', 'usage', 'audience', 'watchpoints'],
  'review-area': ['location', 'comparison', 'liquidity', 'audience', 'tradeoffs', 'watchpoints'],
  comparison: ['comparison', 'strengths', 'tradeoffs', 'audience', 'cashflow', 'watchpoints'],
  'case-study': ['context', 'audience', 'usage', 'scenario', 'lesson', 'watchpoints'],
  checklist: ['legal', 'usage', 'tradeoffs', 'watchpoints', 'audience'],
  'investment-analysis': ['context', 'cashflow', 'scenario', 'comparison', 'tradeoffs', 'watchpoints'],
  'market-news': ['signal', 'comparison', 'audience', 'watchpoints', 'liquidity'],
};

export function buildSectionOutlineInstruction(articleType: ArticleType): string {
  const plan = ARTICLE_SECTION_PLANS[articleType] || ARTICLE_SECTION_PLANS['review-project'];
  const lines = plan.map((key, index) => {
    const guide = SECTION_TYPE_GUIDE[key] || key;
    return `${index + 1}. H2 loại "${key}": ${guide}`;
  });

  return `OUTLINE SECTION (đặt tiêu đề H2 CỤ THỂ theo chủ đề bài — KHÔNG copy tiêu đề mẫu):
Mỗi H2 phải thuộc một loại section KHÁC NHAU:
${lines.join('\n')}

Sau các H2 chính: thêm ## FAQ và phần CTA ngắn theo yêu cầu.`;
}
