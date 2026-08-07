import type { PageType } from './PageType';

export type KeywordIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL'
  | 'LOCAL';

/**
 * Keyword cluster grouped by search intent.
 */
export interface KeywordCluster {
  id: string;
  intent: KeywordIntent;
  primaryKeyword: string;
  secondaryKeywords: string[];
  targetPageType: PageType;
  relatedEntityIds?: string[];
  /** Optional target path when known */
  targetSlug?: string;
}
