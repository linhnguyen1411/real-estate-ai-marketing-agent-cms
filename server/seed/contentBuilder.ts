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
  extraLinks: { label: string; href: string }[] = []
) {
  const mergedLinks = [...BASE_LINKS, ...extraLinks].slice(0, 7);
  const body = sections
    .map((section, index) => {
      const heading = `## ${section.heading}`;
      const inlineLink = index < 2 ? mergedLinks[index] : null;
      const inlineNote = inlineLink
        ? `Nhà đầu tư quan tâm chủ đề này có thể tham khảo thêm [${inlineLink.label}](${inlineLink.href}) để mở rộng góc nhìn thẩm định.`
        : '';
      const text = [...section.paragraphs, inlineNote].filter(Boolean).join('\n\n');
      return `${heading}\n\n${text}`;
    })
    .join('\n\n');

  const links = mergedLinks
    .map(link => `- [${link.label}](${link.href})`)
    .join('\n');

  return `${intro}\n\n${body}\n\n## Liên kết hữu ích\n\n${links}`;
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
