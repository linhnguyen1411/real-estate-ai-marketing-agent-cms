import { BANNED_HEADING_LABELS, BANNED_PHRASES } from './contentRules';

export function buildValidatorRewritePrompt(input: {
  markdown: string;
  violations: string[];
}): string {
  return `Bạn là biên tập viên. Viết lại bài markdown sau để loại bỏ dấu vết AI và boilerplate.

VI PHẠM PHÁT HIỆN:
${input.violations.map(v => `- ${v}`).join('\n')}

QUY TẮC REWRITE:
- Giữ cấu trúc YAML frontmatter và slug
- Giữ ý chính, đổi cách diễn đạt
- Loại bỏ hoàn toàn các cụm cấm: ${BANNED_PHRASES.slice(0, 12).join(', ')}...
- Loại bỏ heading cấm: ${BANNED_HEADING_LABELS.join(', ')}
- Không thêm disclaimer AI
- Không thêm giải thích ngoài bài viết
- H2 phải đa dạng cấu trúc
- Kết bài bằng insight cụ thể, không "nhà đầu tư nên"

BÀI CẦN VIẾT LẠI:
${input.markdown}`;
}

export const VALIDATOR_AUDIT_CHECKLIST = `
Tự kiểm tra trước khi trả kết quả:
1. Có câu / cụm AI disclaimer không?
2. Có boilerplate lặp không?
3. Có 2 đoạn giống nhau không?
4. Có H2 cùng cấu trúc không?
5. FPT có lấn át Sun Group không (nếu bài về Sun)?
6. Giọng có quá quảng cáo không?
Nếu có → sửa ngay trong output, không giải thích.`;
