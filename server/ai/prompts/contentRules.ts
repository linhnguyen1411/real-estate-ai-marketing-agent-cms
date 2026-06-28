/** PHASE 25 — Anti-AI / anti-boilerplate phrase rules */

export const BANNED_PHRASES = [
  'cần kiểm chứng thực tế',
  'cần khảo sát thực tế',
  'chỉ mang tính tham khảo',
  'nhà đầu tư nên cân nhắc',
  'nhà đầu tư nên',
  'không cam kết lợi nhuận',
  'phụ thuộc nhiều yếu tố',
  'phụ thuộc vào',
  'trong bối cảnh',
  'nổi bật',
  'đáng chú ý',
  'động lực tăng trưởng',
  'hệ sinh thái',
  'bức tranh',
  'cực kỳ tiềm năng',
  'rất đáng đầu tư',
  'siêu hấp dẫn',
  'không có gì đảm bảo',
  'điều này phụ thuộc',
  'tuy nhiên,',
  'tuy nhiên ',
] as const;

export const BANNED_PHRASE_MAX_COUNT = 2;

export const BANNED_ENDING_PATTERNS = [
  /cần kiểm chứng/i,
  /nhà đầu tư nên/i,
  /không có gì đảm bảo/i,
  /không cam kết/i,
  /chỉ mang tính tham khảo/i,
];

export const BANNED_HEADING_LABELS = [
  'Bối cảnh thị trường',
  'Động lực tăng trưởng',
  'Khả năng khai thác dòng tiền',
  'Khung lựa chọn sản phẩm',
  'Rủi ro vận hành',
  'Checklist 90 ngày',
] as const;

export const BANNED_HEADING_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /bối cảnh thị trường/i, label: 'Bối cảnh thị trường' },
  { pattern: /động lực tăng trưởng/i, label: 'Động lực tăng trưởng' },
  { pattern: /khả năng khai thác dòng tiền/i, label: 'Khả năng khai thác dòng tiền' },
  { pattern: /khung lựa chọn sản phẩm/i, label: 'Khung lựa chọn sản phẩm' },
  { pattern: /rủi ro vận hành/i, label: 'Rủi ro vận hành' },
  { pattern: /checklist\s*90\s*ngày/i, label: 'Checklist 90 ngày' },
];

export const ENDING_ALTERNATIVES = `
Kết bài bằng một trong các hướng (chọn 1, không disclaimer):
- Điều đáng theo dõi tiếp theo là...
- Yếu tố quyết định nằm ở...
- Với nhóm vốn ... thì phương án phù hợp hơn là...
- Điểm khác biệt của khu vực này nằm ở...`;

export const LOCAL_KNOWLEDGE_HINTS = `
Địa danh có thể nhắc khi liên quan (không ép): Nam Đà Nẵng, Ngũ Hành Sơn, Hòa Quý, Hòa Xuân, Điện Ngọc, Non Nước, BRG, Làng Đại học, FPT City.`;
