/**
 * @deprecated LEGACY — Phase 28. Template builder removed from public pipeline.
 */
export function slugifyTag(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function countWords(text: string) {
  return text
    .replace(/[#*_\[\]()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

const BASE_LINKS = [
  { label: 'Cẩm nang nhà đầu tư', href: '/nha-dau-tu-ha-noi-mua-bat-dong-san-da-nang' },
  { label: 'Đầu tư Nam Đà Nẵng', href: '/dau-tu-nam-da-nang' },
  { label: 'Xem dữ liệu thị trường', href: '/nha-dau-tu' },
];

export function buildArticleContent(
  intro: string,
  sections: { heading: string; paragraphs: string[] }[],
  extraLinks: { label: string; href: string }[] = [],
  cta?: string
) {
  const mergedLinks = [...BASE_LINKS, ...extraLinks].slice(0, 7);
  const body = sections
    .map(section => {
      const heading = `## ${section.heading}`;
      const text = section.paragraphs.join('\n\n');
      return `${heading}\n\n${text}`;
    })
    .join('\n\n');

  const links = mergedLinks
    .map(link => `- [${link.label}](${link.href})`)
    .join('\n');

  const ctaBlock = cta ? `\n\n## Liên hệ thẩm định\n\n${cta}` : '';

  return `${intro}\n\n${body}\n\n## Liên kết hữu ích\n\n${links}${ctaBlock}`;
}

export interface SeoPostSeed {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  categorySlug: string;
  tags: string[];
  coverImage?: string;
  faqs: { question: string; answer: string }[];
  extraLinks?: { label: string; href: string }[];
  content: string;
}

export const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=90&fm=webp';
