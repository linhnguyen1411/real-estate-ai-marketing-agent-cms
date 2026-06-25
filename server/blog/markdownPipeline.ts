import matter from 'gray-matter';
import { marked } from 'marked';
import { countWords, estimateReadingTime, slugifyTitle, stripMarkdown } from './textUtils';

export interface ParsedFaq {
  question: string;
  answer: string;
  sortOrder: number;
}

export interface MarkdownImportResult {
  frontmatter: Record<string, unknown>;
  contentMarkdown: string;
  contentHtml: string;
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  targetIntent: string;
  coverImage: string | null;
  status: string;
  categorySlug: string;
  tagNames: string[];
  faqs: ParsedFaq[];
  wordCount: number;
  readingTime: number;
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function extractFaqsFromMarkdown(markdown: string): { body: string; faqs: ParsedFaq[] } {
  const faqHeader = /^##\s*FAQ\s*$/im;
  const match = markdown.match(faqHeader);
  if (!match || match.index === undefined) {
    return { body: markdown, faqs: [] };
  }

  const body = markdown.slice(0, match.index).trim();
  const faqSection = markdown.slice(match.index + match[0].length).trim();
  const faqs: ParsedFaq[] = [];
  const blocks = faqSection.split(/\n(?=###\s)/);

  blocks.forEach((block, index) => {
    const lines = block.trim().split('\n');
    const heading = lines[0]?.replace(/^###\s*/, '').trim();
    const answer = lines.slice(1).join('\n').trim();
    if (heading && answer) {
      faqs.push({ question: heading, answer, sortOrder: index });
    }
  });

  return { body, faqs };
}

export function markdownToHtml(markdown: string) {
  return marked.parse(markdown, { async: false }) as string;
}

export function parseMarkdownImport(raw: string): MarkdownImportResult {
  const { data, content: rawBody } = matter(raw);
  const fm = data as Record<string, unknown>;

  const { body, faqs } = extractFaqsFromMarkdown(rawBody.trim());
  const title = String(fm.title || '').trim();
  const slug = String(fm.slug || '').trim() || (title ? slugifyTitle(title) : '');
  const excerpt = String(fm.excerpt || '').trim() || stripMarkdown(body).slice(0, 220);
  const metaTitle = String(fm.metaTitle || fm.meta_title || title).trim();
  const metaDescription = String(fm.metaDescription || fm.meta_description || excerpt).trim();
  const wordCount = countWords(body);

  return {
    frontmatter: fm,
    contentMarkdown: body,
    contentHtml: markdownToHtml(body),
    title,
    slug,
    excerpt,
    metaTitle,
    metaDescription,
    primaryKeyword: String(fm.primaryKeyword || fm.primary_keyword || '').trim(),
    targetIntent: String(fm.targetIntent || fm.target_intent || '').trim(),
    coverImage: fm.coverImage || fm.cover_image ? String(fm.coverImage || fm.cover_image) : null,
    status: String(fm.status || 'draft').trim(),
    categorySlug: String(fm.category || fm.categorySlug || '').trim(),
    tagNames: parseTagList(fm.tags),
    faqs,
    wordCount,
    readingTime: estimateReadingTime(wordCount),
  };
}
