import { parseMarkdownImport } from './markdownPipeline';
import { slugifyTitle } from './textUtils';
import { cleanMarkdownBody, sanitizeCoverImage } from './markdownCleaner';

export interface ParsedPromptMarkdown {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  coverImage: string | null;
  tagNames: string[];
  relatedSuggestions: string[];
  contentMarkdown: string;
  faqs: { question: string; answer: string }[];
  cleanWarnings: string[];
}

function parseBulletList(lines: string[], startIndex: number) {
  const items: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const bullet = trimmed.match(/^[*\-•]\s+(.+)$/);
    if (bullet) {
      items.push(bullet[1].trim());
      i++;
      continue;
    }
    break;
  }
  return { items, nextIndex: i };
}

function parseKeyValueHeader(raw: string): ParsedPromptMarkdown | null {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const meta: Record<string, string> = {};
  const tagNames: string[] = [];
  const relatedSuggestions: string[] = [];
  let i = 0;
  let listMode: 'tags' | 'related' | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    if (/^#\s+/.test(trimmed) && (Object.keys(meta).length > 0 || tagNames.length > 0)) break;
    if (/^---\s*$/.test(trimmed)) break;

    if (listMode) {
      const bullet = trimmed.match(/^[*\-•]\s+(.+)$/);
      if (bullet) {
        if (listMode === 'tags') tagNames.push(bullet[1].trim());
        else relatedSuggestions.push(bullet[1].trim());
        i++;
        continue;
      }
      if (!trimmed.startsWith('*') && !trimmed.startsWith('-')) listMode = null;
      else {
        i++;
        continue;
      }
    }

    if (/^tags:\s*$/i.test(trimmed)) {
      listMode = 'tags';
      i++;
      continue;
    }
    if (/^relatedsuggestions:\s*$/i.test(trimmed)) {
      listMode = 'related';
      i++;
      continue;
    }

    const kv = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
    if (kv) {
      meta[kv[1].toLowerCase()] = kv[2].trim();
      i++;
      continue;
    }
    break;
  }

  if (!meta.title && !lines.some(l => /^#\s+/.test(l.trim()))) return null;

  let bodyStart = i;
  while (bodyStart < lines.length && !lines[bodyStart].trim()) bodyStart++;
  let contentMarkdown = lines.slice(bodyStart).join('\n').trim();
  const title = meta.title || contentMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
  if (!title && !contentMarkdown) return null;

  const cleaned = cleanMarkdownBody(contentMarkdown);
  contentMarkdown = cleaned.body;
  const faqs = cleaned.faqs;

  const excerpt = meta.excerpt || '';
  const slug = meta.slug || slugifyTitle(title);
  const metaTitle = meta.metatitle || meta.title || title;
  const metaDescription = meta.metadescription || meta.excerpt || excerpt;

  return {
    title,
    slug,
    excerpt,
    metaTitle,
    metaDescription: metaDescription || excerpt.slice(0, 160),
    primaryKeyword: meta.primarykeyword || '',
    coverImage: sanitizeCoverImage(meta.coverimage || null),
    tagNames,
    relatedSuggestions,
    contentMarkdown,
    faqs,
    cleanWarnings: cleaned.warnings,
  };
}

export function parsePromptMarkdown(raw: string): ParsedPromptMarkdown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Markdown trống.');

  if (trimmed.startsWith('---')) {
    const legacy = parseMarkdownImport(trimmed);
    const cleaned = cleanMarkdownBody(legacy.contentMarkdown);
    return {
      title: legacy.title,
      slug: legacy.slug,
      excerpt: legacy.excerpt,
      metaTitle: legacy.metaTitle,
      metaDescription: legacy.metaDescription,
      primaryKeyword: legacy.primaryKeyword,
      coverImage: sanitizeCoverImage(legacy.coverImage),
      tagNames: legacy.tagNames,
      relatedSuggestions: [],
      contentMarkdown: cleaned.body,
      faqs: cleaned.faqs.length ? cleaned.faqs : legacy.faqs.map(f => ({ question: f.question, answer: f.answer })),
      cleanWarnings: cleaned.warnings,
    };
  }

  const kv = parseKeyValueHeader(trimmed);
  if (kv) return kv;

  throw new Error('Không đọc được format Markdown. Cần block meta (title:, slug:...) hoặc YAML frontmatter.');
}
