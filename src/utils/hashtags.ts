const HASHTAG_PATTERN = /#([^\s#.,;:!?()[\]{}`]+)/g;

function cleanHashtagToken(tag: string) {
  return tag.replace(/^[`#]+|[`]+$/g, '').trim();
}

export function extractHashtagsFromText(text: string): string[] {
  const matches = String(text || '').match(HASHTAG_PATTERN) || [];
  return Array.from(new Set(
    matches
      .map(tag => cleanHashtagToken(tag.replace(/^#+/, '')))
      .filter(Boolean)
      .map(tag => `#${tag}`)
  ));
}

export function normalizeHashtag(tag: string): string {
  const trimmed = String(tag || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

export function hashtagToKeyword(tag: string): string {
  return cleanHashtagToken(String(tag || '').replace(/^#+/, ''));
}

export function hashtagsToKeywords(hashtags: string[]): string[] {
  return Array.from(new Set(hashtags.map(hashtagToKeyword).filter(Boolean)));
}

export function mergePostHashtags(content: string, explicitHashtags: string[] = []) {
  const fromContent = extractHashtagsFromText(content);
  const hashtags = Array.from(new Set([
    ...explicitHashtags.map(normalizeHashtag).filter(Boolean),
    ...fromContent
  ]));
  return {
    hashtags,
    keywords: hashtagsToKeywords(hashtags)
  };
}

export function mergeKeywordLists(...groups: string[][]): string[] {
  return Array.from(new Set(
    groups.flat().map(item => String(item || '').trim()).filter(Boolean)
  ));
}

type HashtagProperty = {
  rich_description?: string;
  description?: string;
  selling_points?: string[];
  sale_status?: string;
  ai_posts?: {
    seo?: {
      keywords?: string[];
      hashtags?: string[];
    };
  };
};

export function getPropertyContentForHashtags(property: HashtagProperty) {
  return [
    property.rich_description,
    property.description,
    ...(Array.isArray(property.selling_points) ? property.selling_points : [])
  ].filter(Boolean).join('\n');
}

export function getPropertySeoKeywordsFromContent(property: HashtagProperty, baseKeywords: string[] = []) {
  const { keywords: parsedKeywords } = mergePostHashtags(getPropertyContentForHashtags(property));
  if (parsedKeywords.length) {
    return mergeKeywordLists(baseKeywords, parsedKeywords);
  }
  return mergeKeywordLists(
    baseKeywords,
    hashtagsToKeywords(property.ai_posts?.seo?.hashtags || []),
    property.ai_posts?.seo?.keywords || []
  );
}

export function collectSiteSeoKeywords(properties: HashtagProperty[], baseKeywords: string[] = []) {
  const fromProperties = properties
    .filter(property => !['sold', 'hidden'].includes(property.sale_status || 'available'))
    .flatMap(property => getPropertySeoKeywordsFromContent(property));
  return mergeKeywordLists(baseKeywords, fromProperties);
}
