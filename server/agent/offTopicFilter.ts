/**
 * Hard off-topic helpers — prefer domainClassification for relevance decisions.
 * Kept for keyword boundary matching + thin wrappers used by prefilter/tests.
 */

import { evaluateRealEstateRelevance } from './domainClassification';

/** @deprecated Prefer evaluateRealEstateRelevance — kept for call sites/tests */
export function detectHardOffTopic(text: string): string | null {
  const relevance = evaluateRealEstateRelevance(text);
  if (relevance.decision !== 'reject') return null;
  if (relevance.domain.classification === 'vehicle') {
    return relevance.domain.primaryObject || 'xe cộ';
  }
  if (relevance.domain.classification === 'consumer_goods') return 'hàng tiêu dùng';
  if (relevance.domain.classification === 'employment') return 'tuyển dụng';
  if (relevance.domain.classification === 'financial_service') return 'tài chính/sim';
  if (relevance.reasonCode === 'generic_demand_no_real_estate_object') {
    return 'nhu cầu chung ngoài BĐS';
  }
  return relevance.reasonCode;
}

export function hasRealEstateDomainSignal(text: string): boolean {
  const relevance = evaluateRealEstateRelevance(text);
  return relevance.isRealEstateRelevant || relevance.decision === 'accept';
}

/**
 * Generic "cần mua / muốn bán" without any BĐS cue → not a real-estate lead.
 */
export function isGenericNonRealEstateDemand(text: string): boolean {
  const relevance = evaluateRealEstateRelevance(text);
  return (
    relevance.decision === 'reject' &&
    (relevance.reasonCode === 'generic_demand_no_real_estate_object' ||
      !relevance.isRealEstateRelevant)
  );
}

/**
 * Keyword hit with light word boundaries so "alo em" does not match inside "zalo em".
 */
export function textHasKeyword(haystack: string, keyword: string): boolean {
  const hay = String(haystack || '').toLowerCase();
  const kw = String(keyword || '')
    .trim()
    .toLowerCase();
  if (!kw || !hay) return false;

  const needsBoundary = kw.length <= 10 || /\s/.test(kw);
  if (!needsBoundary) return hay.includes(kw);

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'iu').test(hay);
}
