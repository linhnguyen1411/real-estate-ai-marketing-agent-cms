const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const PHONE_RE = /(?:\+?84|0)(?:\s*\d){8,10}/g;
const BAD_COVER_RE = /google\.com\/search|example\.com|^#$/i;

const STRIP_SECTIONS = [
  /^##\s*CTA\s*$/im,
  /^##\s*Bài viết liên quan\s*$/im,
  /^##\s*Liên hệ\s*$/im,
];

export function isBadCoverImage(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const v = value.trim();
  if (BAD_COVER_RE.test(v)) return true;
  if (v === '#') return true;
  if (/^\[.+\]\(.+\)$/.test(v)) return true;
  return false;
}

export function sanitizeCoverImage(value: string | null | undefined): string | null {
  if (isBadCoverImage(value)) return null;
  return value!.trim();
}

function stripSection(markdown: string, sectionRe: RegExp) {
  const match = markdown.match(sectionRe);
  if (!match || match.index === undefined) return markdown;
  return markdown.slice(0, match.index).trimEnd();
}

export function extractFaqsFromBody(markdown: string) {
  const faqs: { question: string; answer: string }[] = [];
  const match = markdown.match(/^##\s*FAQ\s*$/im);
  if (!match || match.index === undefined) return { body: markdown, faqs };
  const before = markdown.slice(0, match.index).trimEnd();
  const section = markdown.slice(match.index + match[0].length);
  const blocks = section.split(/\n(?=###\s)/);
  blocks.forEach(block => {
    const lines = block.trim().split('\n');
    const q = lines[0]?.replace(/^###\s*/, '').trim();
    const a = lines.slice(1).join('\n').trim();
    if (q && a && !/^##\s/.test(q)) faqs.push({ question: q, answer: a });
  });
  return { body: before, faqs };
}

export function cleanMarkdownBody(markdown: string): { body: string; faqs: { question: string; answer: string }[]; warnings: string[] } {
  const warnings: string[] = [];
  let body = markdown.replace(/\r\n/g, '\n').trim();

  const faqResult = extractFaqsFromBody(body);
  body = faqResult.body;
  const faqs = faqResult.faqs;

  for (const re of STRIP_SECTIONS) {
    if (re.test(body)) {
      body = stripSection(body, re);
      warnings.push('Đã xóa mục CTA/Bài viết liên quan do AI tạo trong body.');
    }
  }

  if (/google\.com\/search|example\.com/i.test(body)) {
    body = body
      .replace(/\[([^\]]+)\]\([^)]*google\.com\/search[^)]*\)/gi, '$1')
      .replace(/\[([^\]]+)\]\([^)]*example\.com[^)]*\)/gi, '$1')
      .replace(/https?:\/\/[^\s)]*google\.com\/search[^\s)]*/gi, '')
      .replace(/https?:\/\/[^\s)]*example\.com[^\s)]*/gi, '');
    warnings.push('Đã xóa link google.com/search hoặc example.com.');
  }

  if (/\[([^\]]+)\]\(#\)/.test(body)) {
    body = body.replace(/\[([^\]]+)\]\(#\)/g, '$1');
    warnings.push('Đã xóa link "#" giả.');
  }

  if (PHONE_RE.test(body)) {
    body = body.replace(PHONE_RE, '');
    warnings.push('Đã xóa số điện thoại trong body.');
  }

  const headingEmoji = body.match(/^#{1,3}\s+.*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gmu);
  if (headingEmoji?.length) {
    body = body.replace(/^(#{1,3}\s+)(.*)$/gmu, (_, hashes, text) => `${hashes}${text.replace(EMOJI_RE, '').trim()}`);
    warnings.push('Đã xóa emoji trong heading.');
  }

  return { body: body.trim(), faqs, warnings: [...new Set(warnings)] };
}
