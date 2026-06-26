import { ENDING_ALTERNATIVES, LOCAL_KNOWLEDGE_HINTS } from './contentRules';

/** PHASE 25 — SEO layer: structure without stuffing */

export const SEO_PROMPT_LAYER = `SEO (tự nhiên, không nhồi):
- Keyword density tự nhiên — không lặp cụm từ khóa > 3 lần liên tiếp
- Mỗi H2 phải khác cấu trúc ngữ pháp — không cùng mẫu "X và Y" / "Tại sao X"
- Không dùng cùng outline cho mọi bài

MỖI BÀI BẮT BUỘC CÓ:
- Ít nhất 3 insight riêng (quan sát không ai chép từ template)
- Ít nhất 2 đoạn so sánh (khu vực, sản phẩm, hoặc phân khúc)
- Ít nhất 1 góc nhìn phản biện (hạn chế, đánh đổi — không disclaimer)

SECTION GENERATOR:
- Mỗi H2 thuộc MỘT loại section khác nhau (vị trí / so sánh / khai thác / thanh khoản / nhóm KH / điều cần quan sát...)
- KHÔNG viết mọi H2 kiểu essay chung chung
- Đặt tiêu đề H2 cụ thể theo chủ đề bài — không copy tiêu đề mẫu

${LOCAL_KNOWLEDGE_HINTS}

${ENDING_ALTERNATIVES}

OUTPUT KỸ THUẬT:
- Markdown + YAML frontmatter
- status: draft
- KHÔNG HTML, KHÔNG JSON body, KHÔNG bọc \`\`\`markdown fence
- FAQ: ít nhất 2 cặp ### Câu hỏi? + trả lời
- Meta title 50–60 ký tự, meta description 140–160 ký tự`;

export const SEO_CLIPBOARD_OUTPUT_FORMAT = `OUTPUT BẮT BUỘC:

Trả về đúng Markdown.
Không giải thích.
Không dùng code block.

Format:

title: ...
slug: ...
excerpt: ...
metaTitle: ...
metaDescription: ...
primaryKeyword: ...
coverImage:
tags:
* ...
relatedSuggestions:
* ...

# H1 bài viết

(Nội dung với H2 đa dạng)

## FAQ

### Câu hỏi 1
Trả lời...

relatedSuggestions chỉ là gợi ý chủ đề — không tạo link URL giả trong body.`;
