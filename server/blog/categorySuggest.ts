import { slugifyTag } from './textUtils';

export interface CategorySuggestion {
  categorySlug: string;
  categoryName: string;
  confidence: number;
  reason: string;
}

export interface TagSuggestion {
  name: string;
  slug: string;
  confidence: number;
}

const RULES: { pattern: RegExp; categorySlug: string; categoryName: string; tags: string[]; weight: number }[] = [
  {
    pattern: /sun\s*symphony|sun\s*cosmo|sun\s*group|slite|slight|spana|cora|fours|sun\s*ponte/i,
    categorySlug: 'can-ho-sun-group',
    categoryName: 'Căn hộ Sun Group',
    tags: ['Sun Group', 'căn hộ cao cấp', 'ven sông Hàn'],
    weight: 0.9,
  },
  {
    pattern: /mai\s*đăng\s*chơn|mai\s*dang\s*chon/i,
    categorySlug: 'dat-nen-nha-pho',
    categoryName: 'Đất nền - Nhà phố',
    tags: ['Mai Đăng Chơn', 'Nam Đà Nẵng', 'quỹ đất'],
    weight: 0.85,
  },
  {
    pattern: /hòa\s*xuân|hoa\s*xuan|hòa\s*quý|hoa\s*quy|điện\s*ngọc|dien\s*ngoc/i,
    categorySlug: 'review-khu-vuc',
    categoryName: 'Review khu vực',
    tags: ['review khu vực', 'Nam Đà Nẵng'],
    weight: 0.8,
  },
  {
    pattern: /đất\s*nền|dat\s*nen|nhà\s*phố|nha\s*pho|shophouse/i,
    categorySlug: 'dat-nen-nha-pho',
    categoryName: 'Đất nền - Nhà phố',
    tags: ['đất nền', 'nhà phố'],
    weight: 0.75,
  },
  {
    pattern: /fpt\s*city/i,
    categorySlug: 'phan-tich-du-an',
    categoryName: 'Phân tích dự án',
    tags: ['FPT City', 'bối cảnh thị trường'],
    weight: 0.6,
  },
  {
    pattern: /pháp\s*lý|phap\s*ly|sổ\s*hồng|quy\s*hoạch/i,
    categorySlug: 'phap-ly-bds',
    categoryName: 'Pháp lý BĐS',
    tags: ['pháp lý', 'sổ hồng'],
    weight: 0.85,
  },
  {
    pattern: /checklist|kiểm\s*tra|can\s*kiem\s*tra/i,
    categorySlug: 'kien-thuc-dau-tu',
    categoryName: 'Kiến thức đầu tư',
    tags: ['checklist', 'thẩm định'],
    weight: 0.7,
  },
  {
    pattern: /so\s*sánh|so\s*sanh|vs\b/i,
    categorySlug: 'phan-tich-du-an',
    categoryName: 'Phân tích dự án',
    tags: ['so sánh'],
    weight: 0.75,
  },
  {
    pattern: /case\s*study|một\s*khách|mot\s*khach|khách\s*hàng|khach\s*hang|câu\s*chuyện|cau\s*chuyen|thực\s*tế\s*từ/i,
    categorySlug: 'case-study',
    categoryName: 'Case Study',
    tags: ['case study'],
    weight: 0.8,
  },
  {
    pattern: /giá\s*đất|gia\s*dat|thị\s*trường|thi\s*truong|2026/i,
    categorySlug: 'tin-thi-truong',
    categoryName: 'Tin thị trường',
    tags: ['tin thị trường'],
    weight: 0.65,
  },
  {
    pattern: /nam\s*đà\s*nẵng|nam\s*da\s*nang/i,
    categorySlug: 'review-khu-vuc',
    categoryName: 'Review khu vực',
    tags: ['Nam Đà Nẵng'],
    weight: 0.7,
  },
];

export function suggestCategoryAndTags(input: {
  title: string;
  primaryKeyword?: string;
  content: string;
}): { categories: CategorySuggestion[]; tags: TagSuggestion[] } {
  const haystack = `${input.title} ${input.primaryKeyword || ''} ${input.content}`.toLowerCase();
  const categoryScores = new Map<string, CategorySuggestion>();
  const tagScores = new Map<string, TagSuggestion>();

  for (const rule of RULES) {
    if (!rule.pattern.test(haystack)) continue;
    const existing = categoryScores.get(rule.categorySlug);
    if (!existing || existing.confidence < rule.weight) {
      categoryScores.set(rule.categorySlug, {
        categorySlug: rule.categorySlug,
        categoryName: rule.categoryName,
        confidence: rule.weight,
        reason: `Phát hiện từ khóa liên quan ${rule.categoryName}`,
      });
    }
    for (const tag of rule.tags) {
      const slug = slugifyTag(tag);
      const prev = tagScores.get(slug);
      if (!prev || prev.confidence < rule.weight) {
        tagScores.set(slug, { name: tag, slug, confidence: rule.weight });
      }
    }
  }

  if (input.primaryKeyword) {
    const slug = slugifyTag(input.primaryKeyword);
    tagScores.set(slug, { name: input.primaryKeyword, slug, confidence: 0.95 });
  }

  return {
    categories: [...categoryScores.values()].sort((a, b) => b.confidence - a.confidence),
    tags: [...tagScores.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12),
  };
}

export type ArticleType =
  | 'review-project'
  | 'review-area'
  | 'comparison'
  | 'case-study'
  | 'checklist'
  | 'investment-analysis'
  | 'market-news';

/** CMS category slug for each article type (editorial format ≠ keyword guess) */
export const ARTICLE_TYPE_CATEGORY_SLUG: Record<ArticleType, string> = {
  'case-study': 'case-study',
  checklist: 'kien-thuc-dau-tu',
  'market-news': 'tin-thi-truong',
  'review-area': 'review-khu-vuc',
  'review-project': 'phan-tich-du-an',
  comparison: 'phan-tich-du-an',
  'investment-analysis': 'phan-tich-du-an',
};

export function categorySlugForArticleType(articleType?: string | null): string | null {
  if (!articleType) return null;
  return ARTICLE_TYPE_CATEGORY_SLUG[articleType as ArticleType] || null;
}

function detectArticleTypeFromText(t: string): ArticleType {
  if (/so sánh|so sanh|\bvs\b/i.test(t)) return 'comparison';
  if (/checklist|kiểm tra|can kiem tra|danh sách kiểm tra/i.test(t)) return 'checklist';
  if (/case study|một khách|mot khach|khách hàng|khach hang|câu chuyện|cau chuyen|thực tế từ/i.test(t))
    return 'case-study';
  if (/review khu|đánh giá khu|danh gia khu|khu vực/i.test(t)) return 'review-area';
  if (/tin thị trường|thi truong|giá đất|gia dat|2026/i.test(t)) return 'market-news';
  if (/phân tích đầu tư|phan tich dau tu|có nên|co nen|đáng (mua|đầu tư)/i.test(t))
    return 'investment-analysis';
  if (
    /review dự án|review du an|review\s+\w|sun symphony|sun cosmo|sun cora|sun ponte|sun group|s[\s-]?light|slight|mai đăng chơn/i.test(
      t,
    )
  )
    return 'review-project';
  return 'investment-analysis';
}

/** Title signals beat body noise (e.g. "một khách" in H1 vs checklist in body). */
export function detectArticleType(title: string, content = ''): ArticleType {
  const fromTitle = detectArticleTypeFromText(title);
  if (fromTitle !== 'investment-analysis') return fromTitle;
  return detectArticleTypeFromText(`${title} ${content}`);
}
