import { ARTICLE_TYPE_OPTIONS } from './seoCmsConstants';

export function buildSeoContentPrompt(input: {
  keyword: string;
  articleType: string;
  cta: string;
}): string {
  const typeLabel =
    ARTICLE_TYPE_OPTIONS.find(o => o.value === input.articleType)?.label || input.articleType;

  return `Bạn là chuyên gia SEO bất động sản và copywriter cao cấp.

Nhiệm vụ:
Viết một bài chuẩn SEO bằng tiếng Việt.

Thông tin đầu vào:

Từ khóa & điểm nổi bật:
${input.keyword.trim()}

Loại bài:
${typeLabel}

CTA cuối bài:
${input.cta.trim()}

Đối tượng mặc định:
* người mua ở thực
* nhà đầu tư
* người tìm hiểu thị trường

Yêu cầu nội dung:

1. Không viết kiểu brochure bán hàng.
2. Không lặp ý.
3. Không dùng outline chung.
4. Không dùng các heading sau:
   * Bối cảnh thị trường
   * Động lực tăng trưởng
   * Khả năng khai thác dòng tiền
   * Khung lựa chọn sản phẩm
   * Rủi ro vận hành
   * Checklist 90 ngày
5. Bám sát từ khóa và điểm nổi bật chính.
6. Được tự mở rộng các ý phụ liên quan:
   * vị trí
   * pháp lý
   * tiện ích
   * khai thác
   * thanh khoản
   * điểm cần kiểm chứng
   * nhóm khách hàng phù hợp
7. Nếu thiếu dữ liệu, ghi "cần kiểm chứng thực tế".
8. Không bịa số liệu chắc chắn.
9. Không cam kết lợi nhuận.
10. Không dùng Google search link.
11. Không dùng example.com.
12. Không dùng emoji trong H1/H2/H3.
13. Không đưa số điện thoại trong nội dung.
14. Không tạo CTA dạng link/button trong bài viết.
15. CTA sẽ do CMS tự tạo.
16. Bài viết tối thiểu 1200 từ.

OUTPUT BẮT BUỘC:

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
* ...
relatedSuggestions:
* ...
* ...
* ...

# H1 bài viết

Đoạn mở bài...

## H2

Nội dung...

## H2 khác

Nội dung...

## FAQ

### Câu hỏi 1

Trả lời...

### Câu hỏi 2

Trả lời...

---

Lưu ý:
* relatedSuggestions chỉ là gợi ý chủ đề liên quan, không tạo link URL.
* Không tạo mục "Bài viết liên quan" trong body.
* Không tạo mục "CTA" trong body.
* Không tạo link giả.
* Không dùng markdown link nếu không có URL thật.`;
}
