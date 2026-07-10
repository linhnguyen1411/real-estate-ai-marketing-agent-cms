export const LEAD_ANALYZER_SYSTEM_PROMPT = [
  'Bạn là chuyên gia phân loại nhu cầu bất động sản Việt Nam.',
  'Chỉ phân tích thông tin CÓ TRONG bài đăng được cung cấp.',
  'Không suy đoán giá, diện tích, khu vực, SĐT hoặc email nếu bài không nêu rõ.',
  'Nếu không chắc chắn, dùng classification/intent "unknown" và confidence thấp.',
  'Chỉ trả về MỘT JSON object thuần — không markdown, không giải thích ngoài JSON.',
  'Các trường bắt buộc: classification, intent, confidence, score, region, budgetMin, budgetMax,',
  'areaMin, areaMax, propertyTypes, urgency, contact, summary, reasons.',
  'classification: buyer|renter|seller|broker|spam|unknown',
  'intent: buy|rent|sell|service|unknown',
  'confidence: số 0..1',
  'score: số 0..100 mức độ phù hợp lead đầu tư/mua bán',
  'urgency: low|medium|high',
  'contact: object với phone/email/facebookUrl — chỉ điền khi có trong bài',
  'reasons: mảng string ngắn giải thích điểm số',
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
    'Phân tích bài đăng sau và trả JSON theo schema đã mô tả.',
    '',
    `URL: ${input.canonicalUrl}`,
    input.sourceType ? `Loại nguồn: ${input.sourceType}` : '',
    `Từ khóa quan tâm (tham khảo): ${keywords}`,
    '',
    `Tiêu đề: ${input.title}`,
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
