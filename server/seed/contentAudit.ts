import { countWords } from './contentBuilder';
import type { SeoPostSeed } from './contentBuilder';
import { getPostArticle } from './postArticles';

export interface PostAuditRow {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  category: string;
  wordCount: number;
  first300Chars: string;
  repeatedParagraphs: string[];
  internalLinksCount: number;
  faqCount: number;
  hasCta: boolean;
  canonical: string;
  maxSimilarity: number;
  similarTo: string[];
}

export interface ContentAuditResult {
  passed: boolean;
  posts: PostAuditRow[];
  failures: string[];
  duplicateMetaTitles: { value: string; slugs: string[] }[];
  duplicateMetaDescriptions: { value: string; slugs: string[] }[];
  duplicateParagraphs: { text: string; slugs: string[] }[];
  similarityPairs: { a: string; b: string; similarity: number }[];
}

const SIMILARITY_THRESHOLD = 0.3;
const MIN_WORD_COUNT = 700;
const MIN_PARAGRAPH_LEN = 80;
const MAX_PARAGRAPH_REUSE = 2;

const DOMAIN_STOPWORDS = new Set([
  'nha', 'dau', 'tu', 'danang', 'nang', 'bat', 'dong', 'san', 'theo', 'trong', 'voi', 'cho',
  'cac', 'khi', 'nen', 'hay', 'mot', 'cua', 'khong', 'duoc', 'neu', 'tai', 'thi', 'truong',
  'hop', 'hon', 'muc', 'gia', 'tri', 'von', 'rui', 'ro', 'tham', 'dinh', 'phap', 'ly', 'khu',
  'vuc', 'nam', 'can', 'ho', 'dat', 'nen', 'dong', 'tien', 'thue', 'dau', 'tu', '2026', 'nhu',
  'qua', 'cung', 'neu', 'chi', 'lam', 'sao', 'co', 'the', 'nhu', 'cau', 'thuc', 'te', 'truoc',
  'sau', 'nam', 'thang', 'ngay', 'tuy', 'nhung', 'vi', 'boi', 'vi', 'vay', 'nen', 'rat', 'cao',
  'thap', 'hon', 'tot', 'nhat', 'phu', 'hop', 'muc', 'tieu', 'ky', 'vong', 'loi', 'nhuan',
  'fpt', 'city', 'mai', 'dang', 'chon', 'sun', 'group', 'symphony', 'cosmo', 'ha', 'noi',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !DOMAIN_STOPWORDS.has(word))
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach(word => {
    if (setB.has(word)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Highest paragraph-level similarity between two articles (detects template reuse). */
export function maxParagraphSimilarity(bodyA: string, bodyB: string): number {
  const parasA = extractParagraphs(bodyA);
  const parasB = extractParagraphs(bodyB);
  let maxSim = 0;
  for (const a of parasA) {
    for (const b of parasB) {
      maxSim = Math.max(maxSim, jaccardSimilarity(a, b));
    }
  }
  return maxSim;
}

function getAuditableBody(slug: string, includeCta = false): string {
  const article = getPostArticle(slug);
  const parts = [article.intro];
  for (const section of article.sections) {
    parts.push(section.heading, ...section.paragraphs);
  }
  if (includeCta) {
    parts.push(article.cta);
  }
  return parts.join('\n');
}

function extractParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('>'))
    .map(line => line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .filter(line => line.length >= MIN_PARAGRAPH_LEN);
}

function countInternalLinks(content: string): number {
  const matches = content.match(/\]\(\/(?:tin-tuc|du-an|bat-dong-san|nha-dau-tu|dau-tu)[^)]*\)/g);
  return matches ? matches.length : 0;
}

function hasCta(content: string): boolean {
  return /zalo|liên hệ|tư vấn|đặt lịch|nhận bảng giá|giỏ hàng|ký gửi/i.test(content);
}

function groupDuplicates(items: { slug: string; value: string }[]): { value: string; slugs: string[] }[] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const normalized = item.value.trim();
    if (!normalized) continue;
    const list = map.get(normalized) || [];
    list.push(item.slug);
    map.set(normalized, list);
  }
  return [...map.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([value, slugs]) => ({ value, slugs }));
}

export function auditSeoPosts(posts: SeoPostSeed[]): ContentAuditResult {
  const failures: string[] = [];
  const paragraphMap = new Map<string, string[]>();
  const auditRows: PostAuditRow[] = [];
  const similarityPairs: { a: string; b: string; similarity: number }[] = [];

  for (const post of posts) {
    const auditableBody = getAuditableBody(post.slug);
    const paragraphs = extractParagraphs(auditableBody);
    for (const paragraph of paragraphs) {
      const key = paragraph.slice(0, 200);
      const slugs = paragraphMap.get(key) || [];
      slugs.push(post.slug);
      paragraphMap.set(key, slugs);
    }
  }

  const duplicateParagraphs = [...paragraphMap.entries()]
    .filter(([, slugs]) => slugs.length > MAX_PARAGRAPH_REUSE)
    .map(([text, slugs]) => ({ text: text.slice(0, 120) + '…', slugs: [...new Set(slugs)] }));

  const duplicateMetaTitles = groupDuplicates(posts.map(p => ({ slug: p.slug, value: p.metaTitle })));
  const duplicateMetaDescriptions = groupDuplicates(posts.map(p => ({ slug: p.slug, value: p.metaDescription })));

  for (const dup of duplicateMetaTitles) {
    failures.push(`Duplicate metaTitle "${dup.value}" in: ${dup.slugs.join(', ')}`);
  }
  for (const dup of duplicateMetaDescriptions) {
    failures.push(`Duplicate metaDescription in: ${dup.slugs.join(', ')}`);
  }
  for (const dup of duplicateParagraphs) {
    failures.push(`Paragraph reused on ${dup.slugs.length} posts (${dup.slugs.join(', ')})`);
  }

  for (let i = 0; i < posts.length; i += 1) {
    const bodyA = getAuditableBody(posts[i].slug);
    for (let j = i + 1; j < posts.length; j += 1) {
      const bodyB = getAuditableBody(posts[j].slug);
      const sim = maxParagraphSimilarity(bodyA, bodyB);
      if (sim > SIMILARITY_THRESHOLD) {
        similarityPairs.push({ a: posts[i].slug, b: posts[j].slug, similarity: sim });
        failures.push(
          `Similarity ${(sim * 100).toFixed(1)}% between ${posts[i].slug} and ${posts[j].slug}`
        );
      }
    }
  }

  for (const post of posts) {
    const wordCount = countWords(getAuditableBody(post.slug, true));
    const internalLinksCount = countInternalLinks(post.content) + (post.extraLinks?.length || 0);
    const faqCount = post.faqs?.length || 0;
    const cta = hasCta(post.content) || hasCta(getPostArticle(post.slug).cta);
    const canonical = `/tin-tuc/${post.slug}`;
    const paragraphs = extractParagraphs(getAuditableBody(post.slug));
    const repeatedParagraphs = paragraphs.filter(p => {
      const key = p.slice(0, 200);
      return (paragraphMap.get(key)?.length || 0) > 1;
    });

    let maxSimilarity = 0;
    const similarTo: string[] = [];
    const auditableBody = getAuditableBody(post.slug);
    for (const other of posts) {
      if (other.slug === post.slug) continue;
      const sim = maxParagraphSimilarity(auditableBody, getAuditableBody(other.slug));
      if (sim > maxSimilarity) maxSimilarity = sim;
      if (sim > SIMILARITY_THRESHOLD) similarTo.push(other.slug);
    }

    if (wordCount < MIN_WORD_COUNT) {
      failures.push(`${post.slug}: wordCount ${wordCount} < ${MIN_WORD_COUNT}`);
    }
    if (faqCount < 1) {
      failures.push(`${post.slug}: missing FAQ`);
    }
    if (internalLinksCount < 1) {
      failures.push(`${post.slug}: missing internal links`);
    }
    if (!cta) {
      failures.push(`${post.slug}: missing CTA`);
    }
    if (!post.metaTitle?.trim()) {
      failures.push(`${post.slug}: missing metaTitle`);
    }
    if (!post.metaDescription?.trim()) {
      failures.push(`${post.slug}: missing metaDescription`);
    }

    auditRows.push({
      slug: post.slug,
      title: post.title,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      h1: post.title,
      category: post.categorySlug,
      wordCount,
      first300Chars: post.content.replace(/\s+/g, ' ').slice(0, 300),
      repeatedParagraphs: repeatedParagraphs.slice(0, 3).map(p => p.slice(0, 100) + '…'),
      internalLinksCount,
      faqCount,
      hasCta: cta,
      canonical,
      maxSimilarity,
      similarTo,
    });
  }

  return {
    passed: failures.length === 0,
    posts: auditRows,
    failures,
    duplicateMetaTitles,
    duplicateMetaDescriptions,
    duplicateParagraphs,
    similarityPairs,
  };
}

export function formatAuditMarkdown(result: ContentAuditResult): string {
  const lines = [
    '# Content Duplication Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    result.passed ? '**PASS** — all validation rules satisfied.' : `**FAIL** — ${result.failures.length} issue(s).`,
    '',
    `- Posts audited: **${result.posts.length}**`,
    `- Duplicate metaTitle groups: **${result.duplicateMetaTitles.length}**`,
    `- Duplicate metaDescription groups: **${result.duplicateMetaDescriptions.length}**`,
    `- Duplicate paragraph groups: **${result.duplicateParagraphs.length}**`,
    `- High-similarity pairs (>30%): **${result.similarityPairs.length}**`,
    '',
    '## Validation rules',
    '',
    '- Unique metaTitle and metaDescription per post',
    '- No paragraph >80 chars reused on more than 2 posts',
    '- Pairwise max paragraph similarity ≤ 30% (no reused body blocks across posts)',
    '- wordCount ≥ 700',
    '- At least 1 FAQ, internal link, and CTA per post',
    '',
    '## Per-post audit',
    '',
    '| Slug | Words | FAQs | Links | CTA | Max sim | metaTitle |',
    '|------|-------|------|-------|-----|---------|-----------|',
  ];

  for (const row of result.posts) {
    lines.push(
      `| \`${row.slug}\` | ${row.wordCount} | ${row.faqCount} | ${row.internalLinksCount} | ${row.hasCta ? '✓' : '✗'} | ${(row.maxSimilarity * 100).toFixed(0)}% | ${row.metaTitle.slice(0, 40)}… |`
    );
  }

  if (result.failures.length > 0) {
    lines.push('', '## Failures', '');
    result.failures.forEach(f => lines.push(`- ${f}`));
  }

  lines.push('', '## Post details', '');
  for (const row of result.posts) {
    lines.push(`### ${row.slug}`, '');
    lines.push(`- **title:** ${row.title}`);
    lines.push(`- **metaTitle:** ${row.metaTitle}`);
    lines.push(`- **metaDescription:** ${row.metaDescription}`);
    lines.push(`- **H1:** ${row.h1}`);
    lines.push(`- **category:** ${row.category}`);
    lines.push(`- **canonical:** ${row.canonical}`);
    lines.push(`- **wordCount:** ${row.wordCount}`);
    lines.push(`- **first 300 chars:** ${row.first300Chars}…`);
    if (row.repeatedParagraphs.length) {
      lines.push(`- **repeated paragraphs:** ${row.repeatedParagraphs.join(' | ')}`);
    }
    if (row.similarTo.length) {
      lines.push(`- **similar to:** ${row.similarTo.join(', ')}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
