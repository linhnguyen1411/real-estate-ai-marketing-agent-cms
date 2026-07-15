/**
 * Spam policy service — loads cached rules and runs pure evaluator.
 */
import { evaluateSpamPolicy } from './evaluateSpamPolicy';
import { collectPhonesFromText } from './phoneSpam';
import {
  getCachedSpamRules,
  setCachedSpamRules,
  spamRulesCacheKey,
} from './spamRuleCache';
import { loadActiveSpamRulesForScan } from './spamRuleRepository';
import type { SpamDecision, SpamEvaluateInput, SpamRule } from './spamTypes';

export async function getActiveSpamRulesCached(opts: {
  companyId?: string | null;
  sourceId?: string | null;
}): Promise<SpamRule[]> {
  const key = spamRulesCacheKey(opts.companyId, opts.sourceId);
  const hit = getCachedSpamRules(key);
  if (hit) return hit;
  const rules = await loadActiveSpamRulesForScan(opts);
  setCachedSpamRules(key, rules);
  return rules;
}

export type EvaluateContentSpamInput = {
  contentText: string;
  authorName?: string | null;
  authorUrl?: string | null;
  pageUrl?: string | null;
  canonicalUrl?: string | null;
  contentHash?: string | null;
  normalizedContentHash?: string | null;
  phones?: Array<{ raw?: string; normalized?: string; e164?: string }>;
  urls?: string[];
  sourceId?: string | null;
  companyId?: string | null;
  classification?: string | null;
  actorRole?: string | null;
  /** Pre-AI: only exact / strong rules; Post-class: include classification & actor_role */
  tier?: 'pre_ai' | 'post_class' | 'all';
  rules?: SpamRule[];
};

const PRE_AI_TYPES = new Set([
  'phone',
  'author_name',
  'author_profile_url',
  'page_url',
  'canonical_url',
  'source',
  'content_hash',
  'keyword_phrase',
  'domain',
  'keyword',
  'regex',
]);

const POST_CLASS_TYPES = new Set(['classification', 'actor_role']);

function filterRulesForTier(rules: SpamRule[], tier: EvaluateContentSpamInput['tier']): SpamRule[] {
  if (tier === 'pre_ai') return rules.filter(r => PRE_AI_TYPES.has(r.type));
  if (tier === 'post_class') return rules.filter(r => POST_CLASS_TYPES.has(r.type));
  return rules;
}

export async function evaluateContentSpam(input: EvaluateContentSpamInput): Promise<{
  decision: SpamDecision;
  rulesLoaded: number;
}> {
  const allRules =
    input.rules ||
    (await getActiveSpamRulesCached({
      companyId: input.companyId,
      sourceId: input.sourceId,
    }));
  const rules = filterRulesForTier(allRules, input.tier || 'all');
  const phones =
    input.phones && input.phones.length > 0
      ? input.phones
      : collectPhonesFromText(input.contentText || '');

  const evalInput: SpamEvaluateInput = {
    contentText: input.contentText,
    authorName: input.authorName,
    authorUrl: input.authorUrl,
    pageUrl: input.pageUrl,
    canonicalUrl: input.canonicalUrl,
    contentHash: input.contentHash,
    normalizedContentHash: input.normalizedContentHash,
    phones,
    urls: input.urls,
    sourceId: input.sourceId,
    companyId: input.companyId,
    classification: input.classification,
    actorRole: input.actorRole,
    rules,
  };

  return {
    decision: evaluateSpamPolicy(evalInput),
    rulesLoaded: rules.length,
  };
}

export { evaluateSpamPolicy, collectPhonesFromText };
