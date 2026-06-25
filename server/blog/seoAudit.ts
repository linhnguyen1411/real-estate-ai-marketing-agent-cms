import { countWords, stripMarkdown } from './textUtils';

export interface SeoAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  message: string;
  value?: string | number;
}

export interface SeoAuditReport {
  passed: boolean;
  score: number;
  checks: SeoAuditCheck[];
  warnings: string[];
  errors: string[];
  h1: string;
  h2Count: number;
  internalLinksCount: number;
  externalLinksCount: number;
  faqCount: number;
  wordCount: number;
}

function countHeadings(markdown: string, level: number) {
  const re = new RegExp(`^#{${level}}\\s+.+$`, 'gm');
  return (markdown.match(re) || []).length;
}

function countLinks(markdown: string, internal: boolean) {
  const links = [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  return links.filter(([, , href]) => {
    const h = href.trim();
    if (internal) return h.startsWith('/');
    return /^https?:\/\//i.test(h);
  }).length;
}

export function runSeoAudit(input: {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string | null;
  primaryKeyword?: string | null;
  faqCount?: number;
  ctaGenerated?: boolean;
  relatedPostCount?: number;
  tagCount?: number;
  targetIntent?: string | null;
}): SeoAuditReport {
  const checks: SeoAuditCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const metaTitleLen = input.metaTitle.length;
  const metaDescLen = input.metaDescription.length;
  const wordCount = countWords(input.contentMarkdown);
  const h2Count = countHeadings(input.contentMarkdown, 2);
  const internalLinks = countLinks(input.contentMarkdown, true);
  const externalLinks = countLinks(input.contentMarkdown, false);
  const faqCount = input.faqCount ?? 0;
  const h1 = input.title;

  const add = (check: SeoAuditCheck) => {
    checks.push(check);
    if (!check.passed) {
      if (check.severity === 'error') errors.push(check.message);
      else warnings.push(check.message);
    }
  };

  add({
    id: 'meta-title-length',
    label: 'Meta title',
    passed: metaTitleLen >= 30 && metaTitleLen <= 65,
    severity: metaTitleLen < 20 || metaTitleLen > 70 ? 'error' : 'warning',
    message: `Meta title ${metaTitleLen} ký tự (khuyến nghị 30–65)`,
    value: metaTitleLen,
  });

  add({
    id: 'meta-description-length',
    label: 'Meta description',
    passed: metaDescLen >= 120 && metaDescLen <= 165,
    severity: metaDescLen < 80 || metaDescLen > 180 ? 'error' : 'warning',
    message: `Meta description ${metaDescLen} ký tự (khuyến nghị 120–165)`,
    value: metaDescLen,
  });

  add({
    id: 'slug',
    label: 'Slug',
    passed: Boolean(input.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)),
    severity: 'error',
    message: input.slug ? 'Slug hợp lệ' : 'Thiếu slug',
    value: input.slug,
  });

  add({
    id: 'h1',
    label: 'H1 (title)',
    passed: Boolean(h1 && h1.length >= 10),
    severity: 'error',
    message: h1 ? 'Có tiêu đề H1' : 'Thiếu tiêu đề',
  });

  add({
    id: 'h2-count',
    label: 'H2 count',
    passed: h2Count >= 3,
    severity: h2Count < 2 ? 'error' : 'warning',
    message: `${h2Count} tiêu đề H2 (khuyến nghị ≥ 3)`,
    value: h2Count,
  });

  add({
    id: 'word-count',
    label: 'Word count',
    passed: wordCount >= 700,
    severity: wordCount < 500 ? 'error' : 'warning',
    message: `${wordCount} từ (khuyến nghị ≥ 700)`,
    value: wordCount,
  });

  add({
    id: 'internal-links',
    label: 'Internal links',
    passed: internalLinks >= 2,
    severity: 'warning',
    message: `${internalLinks} liên kết nội bộ (khuyến nghị ≥ 2)`,
    value: internalLinks,
  });

  add({
    id: 'faq',
    label: 'FAQ',
    passed: faqCount >= 2,
    severity: 'warning',
    message: `${faqCount} câu FAQ (khuyến nghị ≥ 2)`,
    value: faqCount,
  });

  add({
    id: 'cta',
    label: 'CTA (CMS)',
    passed: true,
    severity: 'info',
    message: input.targetIntent
      ? `CTA tự sinh theo bài — intent: ${input.targetIntent} (không nằm trong content)`
      : 'CTA tự sinh theo bài khi publish (không parse từ markdown)',
  });

  add({
    id: 'tags',
    label: 'Tags',
    passed: (input.tagCount ?? 0) >= 1,
    severity: 'warning',
    message: `${input.tagCount ?? 0} tag (khuyến nghị ≥ 1)`,
    value: input.tagCount ?? 0,
  });

  add({
    id: 'related-posts',
    label: 'Related posts',
    passed: (input.relatedPostCount ?? 0) >= 1,
    severity: 'warning',
    message: `${input.relatedPostCount ?? 0} bài liên quan đã chọn (khuyến nghị 3–6)`,
    value: input.relatedPostCount ?? 0,
  });

  add({
    id: 'canonical',
    label: 'Canonical',
    passed: true,
    severity: 'info',
    message: input.canonicalUrl ? 'Canonical đã đặt' : 'Canonical mặc định theo slug',
  });

  if (input.primaryKeyword) {
    const plain = stripMarkdown(input.contentMarkdown).toLowerCase();
    const kw = input.primaryKeyword.toLowerCase();
    const count = plain.split(kw).length - 1;
    const density = wordCount > 0 ? (count / wordCount) * 100 : 0;
    add({
      id: 'keyword-stuffing',
      label: 'Keyword density',
      passed: density <= 2.5,
      severity: density > 3.5 ? 'error' : 'warning',
      message: `Từ khóa chính xuất hiện ~${density.toFixed(1)}% (khuyến nghị ≤ 2.5%)`,
      value: density,
    });
  }

  const passedErrors = checks.filter(c => c.severity === 'error' && !c.passed).length === 0;
  const score = Math.round((checks.filter(c => c.passed).length / checks.length) * 100);

  return {
    passed: passedErrors,
    score,
    checks,
    warnings,
    errors,
    h1,
    h2Count,
    internalLinksCount: internalLinks,
    externalLinksCount: externalLinks,
    faqCount,
    wordCount,
  };
}
