export interface InternalLinkSuggestion {
  label: string;
  href: string;
  reason: string;
  score: number;
}

const LANDING_LINKS = [
  { label: 'Đầu tư Nam Đà Nẵng', href: '/dau-tu-nam-da-nang', keywords: ['nam đà nẵng', 'nam da nang'] },
  { label: 'Căn hộ đầu tư Đà Nẵng', href: '/can-ho-dau-tu-da-nang', keywords: ['căn hộ', 'sun group', 'symphony', 'cosmo'] },
  { label: 'Đất nền Nam Đà Nẵng', href: '/dat-nen-nam-da-nang', keywords: ['đất nền', 'mai đăng chơn', 'hòa xuân'] },
  { label: 'Danh mục BĐS', href: '/du-an', keywords: ['dự án', 'sun group', 'danh mục'] },
  { label: 'BĐS Nam Đà Nẵng', href: '/du-an/nam-da-nang', keywords: ['nam đà nẵng', 'mai đăng chơn'] },
  { label: 'Tài liệu đầu tư', href: '/tai-lieu-dau-tu', keywords: ['báo cáo', 'tài liệu', 'dữ liệu'] },
  { label: 'Dữ liệu thị trường', href: '/nha-dau-tu', keywords: ['dữ liệu', 'thị trường', 'bảng tin'] },
];

export function suggestInternalLinks(input: {
  title: string;
  content: string;
  categorySlug?: string;
  relatedPosts?: { title: string; slug: string; categorySlug?: string }[];
  tagSlugs?: string[];
}): InternalLinkSuggestion[] {
  const haystack = `${input.title} ${input.content}`.toLowerCase();
  const suggestions: InternalLinkSuggestion[] = [];

  for (const link of LANDING_LINKS) {
    const hits = link.keywords.filter(kw => haystack.includes(kw)).length;
    if (hits > 0) {
      suggestions.push({
        label: link.label,
        href: link.href,
        reason: 'Landing page liên quan nội dung',
        score: hits * 10,
      });
    }
  }

  for (const post of input.relatedPosts || []) {
    const overlap = post.title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && haystack.includes(w)).length;
    if (overlap >= 2 || post.categorySlug === input.categorySlug) {
      suggestions.push({
        label: post.title,
        href: `/tin-tuc/${post.slug}`,
        reason: 'Bài cùng chuyên mục hoặc chủ đề',
        score: overlap * 5 + (post.categorySlug === input.categorySlug ? 8 : 0),
      });
    }
  }

  const seen = new Set<string>();
  return suggestions
    .filter(s => {
      if (seen.has(s.href)) return false;
      seen.add(s.href);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}
