import { PageType } from '../types/PageType';
import type { SeoContent } from '../types/SeoContent';

/** Page types eligible for Dynamic SEO Publishing (template + SSR). */
export const PUBLISHABLE_PAGE_TYPES: readonly PageType[] = [
  PageType.PROJECT,
  PageType.FINANCIAL,
  PageType.COMPARISON,
  PageType.LEGAL,
  PageType.LOCATION,
  PageType.CATALOG,
] as const;

export function isPublishablePageType(pageType: PageType): boolean {
  return (PUBLISHABLE_PAGE_TYPES as readonly PageType[]).includes(pageType);
}

export function isPublishableSeoContent(entry: SeoContent): boolean {
  return isPublishablePageType(entry.pageType);
}
