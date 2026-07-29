/**
 * AI Scanner 2.0 — Spam Control domain types (pure; no DB I/O).
 */

export const SPAM_POLICY_VERSION = 'spam-policy-1';

export type SpamRuleType =
  | 'phone'
  | 'author_name'
  | 'author_profile_url'
  | 'page_url'
  | 'keyword'
  | 'keyword_phrase'
  | 'domain'
  | 'canonical_url'
  | 'source'
  | 'content_hash'
  | 'near_duplicate_fingerprint'
  | 'regex'
  | 'classification'
  | 'actor_role';

export type SpamRuleAction = 'block' | 'ignore' | 'lower_score' | 'allow';

export type SpamDecisionKind = 'allow' | 'block' | 'ignore' | 'lower_score';

export type SpamRuleScope = 'global' | 'company' | 'source' | 'mission';

export interface SpamRule {
  id: string;
  companyId?: string | null;
  sourceId?: string | null;
  missionId?: string | null;
  findingType?: string | null;
  type: SpamRuleType;
  action: SpamRuleAction;
  rawValue: string;
  normalizedValue?: string | null;
  e164Value?: string | null;
  pattern?: string | null;
  label?: string | null;
  reason?: string | null;
  priority: number;
  isActive: boolean;
  expiresAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SpamMatch {
  ruleId: string;
  type: SpamRuleType;
  action: SpamRuleAction;
  matchedValue: string;
  reason?: string | null;
  priority: number;
}

export interface SpamDecision {
  decision: SpamDecisionKind;
  scorePenalty: number;
  matchedRules: SpamMatch[];
  primaryReason: string | null;
  explanations: string[];
  /** True when hard block/ignore should skip AI + Finding + Telegram */
  hardGate: boolean;
  version: string;
}

export interface SpamEvaluateInput {
  contentText: string;
  authorName?: string | null;
  authorUrl?: string | null;
  pageUrl?: string | null;
  canonicalUrl?: string | null;
  contentHash?: string | null;
  normalizedContentHash?: string | null;
  nearDuplicateFingerprint?: string | null;
  phones?: Array<{ raw?: string; normalized?: string; e164?: string }>;
  urls?: string[];
  sourceId?: string | null;
  companyId?: string | null;
  classification?: string | null;
  actorRole?: string | null;
  rules: SpamRule[];
}
