import type { BlogArticle } from '../../src/types';

export function scoreRelatedPosts(
  candidate: {
    id: string;
    slug: string;
    title: string;
    categoryId?: string;
    tags?: { name: string; slug: string }[];
    primaryKeyword?: string | null;
  },
  input: {
    excludePostId?: string;
    categoryId?: string;
    tagIds?: string[];
    tagNames?: string[];
    primaryKeyword?: string;
    relatedSuggestions?: string[];
  },
  allTags: { id: string; name: string }[]
): number {
  if (input.excludePostId && candidate.id === input.excludePostId) return -1;
  let score = 0;
  if (input.categoryId && candidate.categoryId === input.categoryId) score += 40;

  const tagIdSet = new Set(input.tagIds || []);
  const tagNameSet = new Set((input.tagNames || []).map(t => t.toLowerCase()));
  (candidate.tags || []).forEach(tag => {
    const tagRecord = tag as { id?: string; name: string; slug: string };
    if ((tagRecord.id && tagIdSet.has(tagRecord.id)) || tagNameSet.has(tag.name.toLowerCase())) score += 15;
  });

  if (input.primaryKeyword && candidate.primaryKeyword) {
    const kw = input.primaryKeyword.toLowerCase();
    if (candidate.primaryKeyword.toLowerCase().includes(kw) || kw.includes(candidate.primaryKeyword.toLowerCase())) {
      score += 25;
    }
  }

  const haystack = `${candidate.title} ${candidate.slug} ${candidate.primaryKeyword || ''}`.toLowerCase();
  (input.relatedSuggestions || []).forEach(suggestion => {
    const words = suggestion.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const hits = words.filter(w => haystack.includes(w)).length;
    score += hits * 8;
  });

  return score;
}

export function suggestRelatedPostsFromPublished(
  published: BlogArticle[],
  input: {
    excludePostId?: string;
    categoryId?: string;
    tagIds?: string[];
    tagNames?: string[];
    primaryKeyword?: string;
    relatedSuggestions?: string[];
  },
  limit = 8
) {
  return published
    .map(post => ({
      post,
      score: scoreRelatedPosts(
        {
          id: post.id,
          slug: post.slug,
          title: post.title,
          categoryId: post.categoryId,
          tags: post.tags,
          primaryKeyword: post.primaryKeyword,
        },
        input,
        []
      ),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => ({
      id: entry.post.id,
      slug: entry.post.slug,
      title: entry.post.title,
      categoryName: entry.post.category?.name || '',
      score: entry.score,
    }));
}
