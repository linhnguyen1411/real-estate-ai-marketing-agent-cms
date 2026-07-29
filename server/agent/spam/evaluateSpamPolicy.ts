/**
 * Pure spam policy evaluator — no DB I/O.
 *
 * Priority (when multiple matches):
 * 1. allow exact
 * 2. block exact
 * 3. block pattern / phrase
 * 4. ignore
 * 5. lower_score
 * 6. default allow
 *
 * Whitelist (allow) for the same type+value beats blacklist.
 * Hard safety (future): reserved for always-on rules via metadata.hardSafety=true.
 */
import { collectPhonesFromText, phonesMatch } from './phoneSpam';
import type {
  SpamDecision,
  SpamEvaluateInput,
  SpamMatch,
  SpamRule,
  SpamRuleAction,
} from './spamTypes';
import { SPAM_POLICY_VERSION } from './spamTypes';

function isExpired(rule: SpamRule, now: Date): boolean {
  if (!rule.expiresAt) return false;
  const exp = rule.expiresAt instanceof Date ? rule.expiresAt : new Date(rule.expiresAt);
  return Number.isFinite(exp.getTime()) && exp.getTime() <= now.getTime();
}

function scopeApplies(rule: SpamRule, input: SpamEvaluateInput): boolean {
  if (rule.companyId && input.companyId && rule.companyId !== input.companyId) return false;
  if (rule.sourceId && input.sourceId && rule.sourceId !== input.sourceId) return false;
  // Global rules (null company/source) always apply within caller-loaded rule set.
  return true;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(normalizeText(needle));
}

function actionRank(action: SpamRuleAction): number {
  switch (action) {
    case 'allow':
      return 1;
    case 'block':
      return 2;
    case 'ignore':
      return 3;
    case 'lower_score':
      return 4;
    default:
      return 9;
  }
}

function collectMatches(input: SpamEvaluateInput, now: Date): SpamMatch[] {
  const matches: SpamMatch[] = [];
  const phones =
    input.phones && input.phones.length > 0
      ? input.phones
      : collectPhonesFromText(input.contentText || '');
  const content = input.contentText || '';
  const urls = [
    ...(input.urls || []),
    input.canonicalUrl || '',
    input.authorUrl || '',
    input.pageUrl || '',
  ].filter(Boolean);

  for (const rule of input.rules) {
    if (!rule.isActive || isExpired(rule, now) || !scopeApplies(rule, input)) continue;

    let matchedValue: string | null = null;

    switch (rule.type) {
      case 'phone': {
        for (const phone of phones) {
          if (phonesMatch(phone, rule)) {
            matchedValue = phone.normalized || phone.e164 || phone.raw || rule.normalizedValue || rule.rawValue;
            break;
          }
        }
        break;
      }
      case 'author_name': {
        if (input.authorName && includesPhrase(input.authorName, rule.rawValue || rule.normalizedValue || '')) {
          matchedValue = input.authorName;
        }
        break;
      }
      case 'author_profile_url':
      case 'page_url':
      case 'canonical_url': {
        const target =
          rule.type === 'author_profile_url'
            ? input.authorUrl
            : rule.type === 'page_url'
              ? input.pageUrl || input.canonicalUrl
              : input.canonicalUrl;
        const needle = (rule.normalizedValue || rule.rawValue || '').trim().toLowerCase();
        if (target && needle && target.toLowerCase().includes(needle)) {
          matchedValue = target;
        }
        break;
      }
      case 'keyword':
      case 'keyword_phrase': {
        const phrase = rule.rawValue || rule.normalizedValue || '';
        // Reject single common RE tokens as standalone block keywords (guardrail).
        if (rule.type === 'keyword' && /^(đất|nhà|bán|mua|thuê)$/i.test(phrase.trim())) {
          break;
        }
        if (phrase && includesPhrase(content, phrase)) {
          matchedValue = phrase;
        }
        break;
      }
      case 'domain': {
        const needle = (rule.normalizedValue || rule.rawValue || '').trim().toLowerCase();
        if (needle && urls.some(u => u.toLowerCase().includes(needle))) {
          matchedValue = needle;
        }
        break;
      }
      case 'source': {
        if (input.sourceId && (rule.sourceId === input.sourceId || rule.rawValue === input.sourceId)) {
          matchedValue = input.sourceId;
        }
        break;
      }
      case 'content_hash': {
        const needle = (rule.normalizedValue || rule.rawValue || '').trim();
        if (
          needle &&
          (input.contentHash === needle ||
            input.normalizedContentHash === needle ||
            rule.normalizedValue === input.normalizedContentHash)
        ) {
          matchedValue = needle;
        }
        break;
      }
      case 'near_duplicate_fingerprint': {
        const fp = (rule.rawValue || rule.normalizedValue || '').trim();
        if (fp && input.nearDuplicateFingerprint && fp === input.nearDuplicateFingerprint) {
          matchedValue = fp;
        }
        break;
      }
      case 'regex': {
        try {
          const re = new RegExp(rule.pattern || rule.rawValue, 'iu');
          if (re.test(content)) matchedValue = rule.pattern || rule.rawValue;
        } catch {
          /* invalid regex ignored */
        }
        break;
      }
      case 'classification': {
        if (input.classification && normalizeText(input.classification) === normalizeText(rule.rawValue)) {
          matchedValue = input.classification;
        }
        break;
      }
      case 'actor_role': {
        if (input.actorRole && normalizeText(input.actorRole) === normalizeText(rule.rawValue)) {
          matchedValue = input.actorRole;
        }
        break;
      }
      default:
        break;
    }

    if (matchedValue) {
      matches.push({
        ruleId: rule.id,
        type: rule.type,
        action: rule.action,
        matchedValue,
        reason: rule.reason || rule.label || null,
        priority: rule.priority ?? 100,
      });
    }
  }

  return matches;
}

/**
 * Resolve conflicts:
 * - For the same type + matchedValue, allow beats block/ignore/lower_score
 * - Else pick highest actionRank, then lower priority number, then first
 */
export function evaluateSpamPolicy(input: SpamEvaluateInput, now = new Date()): SpamDecision {
  const matches = collectMatches(input, now);
  if (matches.length === 0) {
    return {
      decision: 'allow',
      scorePenalty: 0,
      matchedRules: [],
      primaryReason: null,
      explanations: ['default_allow'],
      hardGate: false,
      version: SPAM_POLICY_VERSION,
    };
  }

  // Group by type+matchedValue to apply whitelist override
  const byKey = new Map<string, SpamMatch[]>();
  for (const m of matches) {
    const key = `${m.type}::${normalizeText(m.matchedValue)}`;
    const list = byKey.get(key) || [];
    list.push(m);
    byKey.set(key, list);
  }

  const effective: SpamMatch[] = [];
  for (const list of byKey.values()) {
    const allow = list.find(m => m.action === 'allow');
    if (allow) {
      effective.push(allow);
      continue;
    }
    list.sort((a, b) => actionRank(a.action) - actionRank(b.action) || a.priority - b.priority);
    effective.push(list[0]);
  }

  effective.sort((a, b) => actionRank(a.action) - actionRank(b.action) || a.priority - b.priority);

  // If any remaining allow-only outcomes and no adversarial actions → allow
  const adversarial = effective.filter(m => m.action !== 'allow');
  if (adversarial.length === 0) {
    return {
      decision: 'allow',
      scorePenalty: 0,
      matchedRules: effective,
      primaryReason: 'whitelist',
      explanations: effective.map(m => `allow:${m.type}:${m.matchedValue}`),
      hardGate: false,
      version: SPAM_POLICY_VERSION,
    };
  }

  const winner = adversarial[0];
  const decision = winner.action as SpamDecision['decision'];
  const scorePenalty =
    decision === 'lower_score' ? Math.max(5, Math.min(40, 100 - (winner.priority || 50))) : 0;

  return {
    decision,
    scorePenalty,
    matchedRules: effective,
    primaryReason:
      winner.type === 'phone' && decision === 'block'
        ? 'blocked_phone'
        : winner.reason || `${decision}_${winner.type}`,
    explanations: effective.map(m => `${m.action}:${m.type}:${m.matchedValue}`),
    hardGate: decision === 'block' || decision === 'ignore',
    version: SPAM_POLICY_VERSION,
  };
}
