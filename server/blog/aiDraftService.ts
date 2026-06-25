import { generateText } from '../aiService';
import { detectArticleType, type ArticleType, categorySlugForArticleType } from './categorySuggest';
import { validateBannedHeadings } from './bannedHeadings';

export interface AiDraftInput {
  keyword: string;
  focusProducts?: string;
  area?: string;
  goal?: string;
  audience?: string;
  tone?: string;
  usePersonalExperience?: boolean;
  internalLinks?: string[];
  cta?: string;
  articleType?: ArticleType;
  /** Retry hint when banned headings detected */
  bannedViolations?: string[];
}

const ARTICLE_OUTLINES: Record<ArticleType, string> = {
  'review-project': `OUTLINE BẮT BUỘC — Review dự án (dùng đúng thứ tự H2):
## Dự án dành cho ai
## Điểm mạnh
## Điểm cần cân nhắc
## Khả năng khai thác
## Kết luận`,

  'review-area': `OUTLINE BẮT BUỘC — Review khu vực:
## Vị trí
## Cư dân
## Thanh khoản
## Ưu điểm
## Nhược điểm
## Phù hợp ai`,

  comparison: `OUTLINE BẮT BUỘC — So sánh:
## Điểm giống
## Điểm khác
## Bảng so sánh
## Ai nên chọn phương án A
## Ai nên chọn phương án B`,

  'case-study': `OUTLINE BẮT BUỘC — Case Study:
## Bối cảnh
## Nhu cầu
## Phương án
## Kết quả
## Bài học`,

  checklist: `OUTLINE BẮT BUỘC — Checklist:
## Các bước chuẩn bị
## Các lỗi thường gặp
## Danh sách kiểm tra
## Kết luận`,

  'investment-analysis': `OUTLINE BẮT BUỘC — Phân tích đầu tư:
## Câu hỏi đầu tư cần trả lời
## Dữ liệu và giả định (ghi "cần kiểm chứng" nếu thiếu số)
## Phân tích theo từng tiêu chí
## Kịch bản xấu / kịch bản cơ sở
## Kết luận thận trọng`,

  'market-news': `OUTLINE BẮT BUỘC — Tin thị trường:
## Tín hiệu nổi bật
## Tác động lên phân khúc
## Ai nên quan tâm
## Điều cần theo dõi tiếp
## Nhận định ngắn`,
};

const BANNED_HEADING_RULES = `
CẤM TUYỆT ĐỐI các heading hoặc cụm sau (FAIL nếu xuất hiện):
- Bối cảnh thị trường
- Động lực tăng trưởng
- Khả năng khai thác dòng tiền
- Khung lựa chọn sản phẩm
- Rủi ro vận hành
- Checklist 90 ngày`;

const INVENTORY_PRIORITY = `
ƯU TIÊN INVENTORY THỰC TẾ (theo thứ tự):
1. Căn hộ Sun Group: Symphony, Slight, Fours, Spana, Cora, Cosmo, Ponte
2. BĐS Nam Đà Nẵng và xu hướng mới
3. Đất nền ký gửi, nhà phố ký gửi
4. Mai Đăng Chơn, Hòa Xuân, Điện Ngọc khi phù hợp chủ đề
FPT City CHỈ được nhắc như bối cảnh / động lực vùng — KHÔNG làm trung tâm bài viết.`;

const SYSTEM_PROMPT = `Bạn là biên tập viên SEO cho Estoria (bdsdanang.site) — tư vấn BĐS Đà Nẵng.
Viết tiếng Việt, giọng tư vấn thật, không brochure.

QUY TẮC BẮT BUỘC:
- Mỗi bài PHẢI theo đúng outline của article type — KHÔNG dùng template chung
- KHÔNG cam kết lợi nhuận, KHÔNG bịa số liệu — thiếu số thì ghi "cần kiểm chứng thực tế"
- OUTPUT: Markdown thuần + YAML frontmatter — KHÔNG HTML, KHÔNG JSON, KHÔNG bọc \`\`\`markdown fence
- status trong frontmatter LUÔN là draft
${BANNED_HEADING_RULES}
${INVENTORY_PRIORITY}

Cấu trúc output:
---
title:
slug:
category:
tags:
metaTitle:
metaDescription:
primaryKeyword:
targetIntent:
excerpt:
status: draft
---

(Nội dung bài với H2/H3 theo outline)

## FAQ
(ít nhất 2 cặp ### Câu hỏi? + trả lời)

## Liên hệ thẩm định
(CTA theo yêu cầu, không hứa lãi)`;

function stripMarkdownFences(text: string): string {
  let out = text.trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```(?:markdown|md|yaml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }
  return out;
}

function buildUserPrompt(input: AiDraftInput, articleType: ArticleType): string {
  const outline = ARTICLE_OUTLINES[articleType];
  const categorySlug = categorySlugForArticleType(articleType) || 'phan-tich-du-an';
  const bannedNote =
    input.bannedViolations?.length ?
      `\nLẦN TRƯỚC VI PHẠM HEADING CẤM: ${input.bannedViolations.join(', ')}. KHÔNG lặp lại.\n`
    : '';

  return `Tạo bài viết SEO draft (KHÔNG publish, status=draft).

Cụm từ khóa & điểm nổi bật (dùng làm trục marketing — lồng tự nhiên vào title, H2, meta, không spam):
${input.keyword}
${input.keyword.includes(',') ? '→ Phân tích từng ý trong cụm trên; mỗi đặc điểm nổi bật nên có đoạn hoặc bullet riêng.' : '→ Mở rộng các khía cạnh: vị trí, sản phẩm, đối tượng, lợi thế cạnh tranh, rủi ro cần lưu ý.'}
Loại bài: ${articleType}
Chuyên mục (slug frontmatter category): ${categorySlug}
Sản phẩm trọng tâm: ${input.focusProducts || 'Sun Group Đà Nẵng'}
Khu vực: ${input.area || 'Đà Nẵng'}
Mục tiêu: ${input.goal || 'Hỗ trợ nhà đầu tư thẩm định'}
Đối tượng: ${input.audience || 'Nhà đầu tư'}
Giọng văn: ${input.tone || 'Tư vấn thực chiến'}
Trải nghiệm cá nhân: ${input.usePersonalExperience ? 'Có thể dùng góc nhìn tư vấn, không bịa case' : 'Không dùng case giả'}
Internal links (chèn 2–4 link markdown phù hợp): ${(input.internalLinks || []).join(', ') || '/du-an, /bat-dong-san, /tai-lieu-dau-tu'}
CTA cuối bài: ${input.cta || 'Liên hệ Zalo để được tư vấn thẩm định trước khi xuống tiền.'}
${bannedNote}
${outline}

Độ dài: 900–1400 từ. Meta title 50–60 ký tự. Meta description 140–160 ký tự.`;
}

export async function generateAiDraftMarkdown(input: AiDraftInput): Promise<{
  markdown: string;
  articleType: ArticleType;
  bannedCheck: { passed: boolean; violations: string[] };
}> {
  const articleType = input.articleType || detectArticleType(`${input.keyword} ${input.goal || ''}`);
  const prompt = buildUserPrompt(input, articleType);

  let markdown = stripMarkdownFences(
    await generateText(SYSTEM_PROMPT, prompt, { temperature: 0.42, maxOutputTokens: 8192 })
  );

  let bannedCheck = validateBannedHeadings(markdown);

  if (!bannedCheck.passed && !input.bannedViolations?.length) {
    const retry = await generateAiDraftMarkdown({
      ...input,
      articleType,
      bannedViolations: bannedCheck.violations,
    });
    return retry;
  }

  return { markdown, articleType, bannedCheck };
}
