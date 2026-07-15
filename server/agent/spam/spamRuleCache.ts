/**
 * Short-lived in-memory cache for active spam rules.
 * Keyed by company (+ optional source) to avoid DB hit per post.
 */
import type { SpamRule } from '../../agent/spam/spamTypes';

type CacheEntry = {
  rules: SpamRule[];
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const store = new Map<string, CacheEntry>();

export function spamRulesCacheKey(companyId: string | null | undefined, sourceId?: string | null): string {
  return `${companyId || 'global'}::${sourceId || '*'}`;
}

export function getCachedSpamRules(key: string): SpamRule[] | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.rules;
}

export function setCachedSpamRules(key: string, rules: SpamRule[], ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { rules, expiresAt: Date.now() + ttlMs });
}

/** Invalidate all caches for a company (and global wildcard). */
export function invalidateSpamRulesCache(companyId?: string | null): void {
  if (!companyId) {
    store.clear();
    return;
  }
  const prefix = `${companyId}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix) || key.startsWith('global::')) {
      store.delete(key);
    }
  }
}

export function clearSpamRulesCacheForTests(): void {
  store.clear();
}
