import type { FaqItem, FaqSet } from '../types/SeoContent';
import type { PageType } from '../types/PageType';
import { getFaqSetRecord, listFaqSetRecords, getFaqQaPairs } from '../data/faqRegistry';

export type ResolveFaqInput = {
  faqId?: string;
  entityId?: string;
  pageType?: PageType;
  schemaEligibleOnly?: boolean;
};

/**
 * Pure FAQ resolver — no I/O / React.
 */
export function resolveFaq(input: ResolveFaqInput): FaqSet | FaqItem[] | undefined {
  if (input.faqId) {
    const set = getFaqSetRecord(input.faqId);
    if (!set) return undefined;
    if (!input.schemaEligibleOnly && !input.entityId && !input.pageType) return set;
    return filterItems(set.items, input);
  }

  const items = listFaqSetRecords().flatMap(set => set.items);
  const filtered = filterItems(items, input);
  return filtered;
}

export function resolveFaqQaPairs(faqId: string): { question: string; answer: string }[] {
  return getFaqQaPairs(faqId);
}

function filterItems(items: FaqItem[], input: ResolveFaqInput): FaqItem[] {
  return items.filter(item => {
    if (input.schemaEligibleOnly && item.schemaEligible === false) return false;
    if (input.entityId && !(item.entityIds || []).includes(input.entityId)) return false;
    if (input.pageType && item.pageTypes && !item.pageTypes.includes(input.pageType)) return false;
    return true;
  });
}
