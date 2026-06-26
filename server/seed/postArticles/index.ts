import type { PostArticleContent } from './types';
import { POST_ARTICLES_01_10 } from './posts-01-10';
import { POST_ARTICLES_11_20 } from './posts-11-20';
import { POST_ARTICLES_21_30 } from './posts-21-30';

export type { PostArticleContent } from './types';

export const POST_ARTICLES: Record<string, PostArticleContent> = {
  ...POST_ARTICLES_01_10,
  ...POST_ARTICLES_11_20,
  ...POST_ARTICLES_21_30,
};

export function getPostArticle(slug: string): PostArticleContent {
  const article = POST_ARTICLES[slug];
  if (!article) {
    throw new Error(`Missing article content for slug: ${slug}`);
  }
  return article;
}
