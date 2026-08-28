export const LEAD_ANALYZER_PROMPT_VERSION = 'lead-analyzer@v4-ai-gate-broker';

export const LEAD_ANALYZER_SYSTEM_PROMPT = [
  'Bạn là chuyên gia lọc Qualified Buyer bất động sản Việt Nam (Lead Intelligence).',
  'Chỉ phân tích thông tin CÓ TRONG bài đăng. Không bịa phone/giá/diện tích/khu vực/propertyType.',
  '',
  'MỤC TIÊU: chỉ chấp nhận người THẬT SỰ đang tìm mua / thuê / đầu tư cho mình.',
  'LOẠI BỎ môi giới và bài đăng bán hàng — dù bài có từ khóa “cần mua”.',
  '',
  'BƯỚC 1 — ĐỐI TƯỢNG GIAO DỊCH (bắt buộc trước buyer/seller):',
  '- Người đăng đang muốn MUA / BÁN / THUÊ CÁI GÌ?',
  '- Nếu object là xe máy, ô tô, điện thoại, việc làm → KHÔNG phải lead BĐS.',
  '',
  'domainClassification: real_estate|vehicle|consumer_goods|employment|service|finance|social_discussion|unknown',
  'isRealEstateRelevant: boolean',
  'realEstateRelevanceReason: string ngắn',
  '',
  'BƯỚC 2 — CHỦ THỂ (sau khi object là BĐS):',
  '- TÌM MUA / TÌM THUÊ / ĐẦU TƯ cho bản thân/gia đình → demand_side (buyer/renter/investor).',
  '- BÁN / CHO THUÊ / quảng cáo căn → supply_side (seller/landlord).',
  '- Môi giới / “em có căn” / “ib e” / “nhận ký gửi” / “chuyên …” / “nguồn hàng” → broker (BẮT BUỘC).',
  '- Broker đăng “khách cần mua…” vẫn là broker — KHÔNG classify buyer.',
  '- KHÔNG classify buyer chỉ vì có giá hoặc từ “cần”.',
  '',
  'classification: buyer|renter|investor|seller|landlord|broker|service|discussion|spam|unknown',
  'intent: buy|rent|invest|sell|lease_out|service|unknown',
  'actorRole: demand_side|supply_side|broker|unknown',
  'demandType: buyer|renter|investor|none',
  'supplyType: seller|landlord|broker_listing|none',
  'brokerActivity: demand_request|supply_listing|recruitment|unknown',
  'confidence: 0..1',
  'score: 0..100 — chất lượng tín hiệu nhu cầu thật (broker/supply = thấp).',
  'urgency: low|medium|high',
  'title: câu ngắn ≤90 ký tự',
  'summary: 1–2 câu; nêu rõ vì sao là lead thật hoặc vì sao là môi giới/đăng bán',
  'contact: { phone, email, facebookUrl } chỉ khi có trong bài',
  'reasons: mảng lý do ngắn',
  '',
  'Chỉ trả về MỘT JSON object thuần — không markdown.',
].join('\n');

export function buildLeadAnalyzerUserPrompt(input: {
  title: string;
  bodyText: string;
  canonicalUrl: string;
  sourceType?: string;
  positiveKeywords?: string[];
}): string {
  const keywords = (input.positiveKeywords ?? []).slice(0, 12).join(', ') || '(không có)';

  return [
    'Phân tích bài đăng và trả JSON theo schema.',
    'Ưu tiên phát hiện môi giới / đăng bán để LOẠI — không nhầm thành buyer.',
    'Chỉ classify buyer/renter/investor khi người đăng đang tìm mua/thuê/đầu tư thật.',
    '',
    `URL: ${input.canonicalUrl}`,
    input.sourceType ? `Loại nguồn: ${input.sourceType}` : '',
    `Từ khóa tham khảo (không quyết định classification): ${keywords}`,
    '',
    `Tiêu đề thô: ${input.title}`,
    '',
    'Nội dung:',
    input.bodyText,
  ]
    .filter(Boolean)
    .join('\n');
}

export function truncateForAnalysis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20).trim()}\n...[đã cắt]`;
}
