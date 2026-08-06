import type { KeywordCluster, KeywordIntent } from '../types/KeywordCluster';
import {
  getKeywordClusterRecord,
  listKeywordClusterRecords,
} from '../data/keywordClusters';

export type ResolveKeywordClusterInput = {
  id?: string;
  intent?: KeywordIntent;
  entityId?: string;
  targetSlug?: string;
};

/**
 * Pure keyword-cluster resolver — no I/O.
 */
export function resolveKeywordCluster(
  input: ResolveKeywordClusterInput,
): KeywordCluster | KeywordCluster[] | undefined {
  if (input.id) return getKeywordClusterRecord(input.id);

  let results = [...listKeywordClusterRecords()];
  if (input.intent) {
    results = results.filter(item => item.intent === input.intent);
  }
  if (input.entityId) {
    results = results.filter(item => (item.relatedEntityIds || []).includes(input.entityId!));
  }
  if (input.targetSlug) {
    results = results.filter(item => item.targetSlug === input.targetSlug);
  }

  if (!input.intent && !input.entityId && !input.targetSlug) return results;
  return results.length === 1 ? results[0] : results;
}
