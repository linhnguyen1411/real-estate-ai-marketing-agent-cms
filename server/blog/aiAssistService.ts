import { generateText } from '../aiService';
import { assembleAssistSystemPrompt } from '../ai/prompts/assemblePrompt';

export type AiAssistAction =
  | 'continue'
  | 'rewrite'
  | 'faq'
  | 'internal-links'
  | 'meta-title'
  | 'meta-description';

const ASSIST_OPTIONS = { promptContext: 'editorial' as const, temperature: 0.4 };

export async function runAiAssist(
  action: AiAssistAction,
  payload: {
    title?: string;
    content?: string;
    selection?: string;
    primaryKeyword?: string;
    excerpt?: string;
  }
): Promise<string | { question: string; answer: string }[] | { label: string; href: string }[]> {
  const title = payload.title || '';
  const content = payload.content || '';
  const keyword = payload.primaryKeyword || '';
  const system = assembleAssistSystemPrompt();

  switch (action) {
    case 'continue':
      return generateText(
        system,
        `Tiếp tục viết bài markdown (2–4 đoạn hoặc 1 section H2 mới) cho bài đang soạn.
Tiêu đề: ${title}
Từ khóa: ${keyword}
Nội dung hiện tại (cuối bài):
${content.slice(-3000)}

Viết phần tiếp theo, khớp giọng văn phân tích chuyên môn, không lặp ý đã có, không disclaimer AI.`,
        ASSIST_OPTIONS,
      );

    case 'rewrite':
      return generateText(
        system,
        `Viết lại đoạn sau — giọng chuyên gia BĐS Nam Đà Nẵng, không sales, không disclaimer:
Tiêu đề bài: ${title}
Đoạn cần viết lại:
${payload.selection || ''}`,
        ASSIST_OPTIONS,
      );

    case 'faq':
      {
        const raw = await generateText(
          system,
          `Tạo 3 cặp FAQ cho bài BĐS (markdown format):
### Câu hỏi?
Trả lời ngắn gọn, không disclaimer.

Tiêu đề bài: ${title}
Từ khóa: ${keyword}
Tóm tắt nội dung:
${content.slice(0, 2000)}`,
          ASSIST_OPTIONS,
        );
        const faqs: { question: string; answer: string }[] = [];
        const blocks = raw.split(/\n(?=###\s)/);
        for (const block of blocks) {
          const lines = block.trim().split('\n');
          const q = lines[0]?.replace(/^###\s*/, '').trim();
          const a = lines.slice(1).join('\n').trim();
          if (q && a) faqs.push({ question: q, answer: a });
        }
        return faqs.length ? faqs : [{ question: 'Có nên đầu tư ngay không?', answer: 'Cần thẩm định mục tiêu và dòng tiền trước khi quyết định.' }];
      }

    case 'internal-links':
      {
        const raw = await generateText(
          system,
          `Gợi ý 3 internal link markdown phù hợp bài này. Mỗi dòng format: [Nhãn](/duong-dan)
Chỉ dùng path có sẵn: /du-an, /bat-dong-san, /tai-lieu-dau-tu, /tin-tuc, /nam-da-nang
Tiêu đề: ${title}
Nội dung: ${content.slice(0, 1500)}`,
          ASSIST_OPTIONS,
        );
        const links: { label: string; href: string }[] = [];
        for (const m of raw.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
          links.push({ label: m[1], href: m[2] });
        }
        return links.slice(0, 4);
      }

    case 'meta-title':
      return generateText(
        system,
        `Viết meta title SEO 50–60 ký tự cho bài:
Tiêu đề: ${title}
Từ khóa: ${keyword}
Chỉ trả về 1 dòng meta title, không dấu ngoặc kép.`,
        ASSIST_OPTIONS,
      ).then(t => t.split('\n')[0].trim().slice(0, 65));

    case 'meta-description':
      return generateText(
        system,
        `Viết meta description SEO 140–160 ký tự:
Tiêu đề: ${title}
Tóm tắt: ${payload.excerpt || content.slice(0, 300)}
Chỉ trả về 1 đoạn, không dấu ngoặc kép.`,
        ASSIST_OPTIONS,
      ).then(t => t.split('\n')[0].trim().slice(0, 165));

    default:
      throw new Error('Action không hợp lệ');
  }
}
