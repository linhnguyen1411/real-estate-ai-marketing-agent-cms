/**
 * Local worker spam-rule snapshot client (MVP).
 * Fetches active rules from VPS; falls back to last known in-memory cache.
 */
import type { SpamRule } from './spamTypes';
import { setCachedSpamRules, spamRulesCacheKey, getCachedSpamRules } from './spamRuleCache';

let lastKnownRules: SpamRule[] = [];
let lastFetchedAt = 0;
const DEFAULT_REFRESH_MS = 5 * 60_000;

export async function fetchSpamRulesSnapshotFromVps(opts: {
  vpsUrl: string;
  headers?: Record<string, string>;
  companyId?: string | null;
  sourceId?: string | null;
  timeoutMs?: number;
}): Promise<SpamRule[]> {
  const base = opts.vpsUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ active: 'true', limit: '500' });
  if (opts.companyId) params.set('companyId', opts.companyId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${base}/api/agent/spam-rules?${params}`, {
      headers: opts.headers || {},
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`spam snapshot HTTP ${res.status}`);
    const json = (await res.json()) as { status?: string; data?: SpamRule[] };
    const rules = Array.isArray(json.data) ? json.data : [];
    lastKnownRules = rules;
    lastFetchedAt = Date.now();
    setCachedSpamRules(spamRulesCacheKey(opts.companyId, opts.sourceId), rules);
    setCachedSpamRules(spamRulesCacheKey(opts.companyId, null), rules);
    return rules;
  } finally {
    clearTimeout(timer);
  }
}

/** Prefer fresh snapshot; on failure use lastKnown / cache; never throw for scan path. */
export async function resolveSpamRulesForLocalScan(opts: {
  vpsUrl?: string | null;
  headers?: Record<string, string>;
  companyId?: string | null;
  sourceId?: string | null;
  localLoader: () => Promise<SpamRule[]>;
  refreshMs?: number;
}): Promise<{ rules: SpamRule[]; source: 'vps' | 'cache' | 'local' | 'last_known' }> {
  const cacheKey = spamRulesCacheKey(opts.companyId, opts.sourceId);
  const cached = getCachedSpamRules(cacheKey);
  const refreshMs = opts.refreshMs ?? DEFAULT_REFRESH_MS;
  const stale = Date.now() - lastFetchedAt > refreshMs;

  if (opts.vpsUrl && (!cached || stale)) {
    try {
      const rules = await fetchSpamRulesSnapshotFromVps({
        vpsUrl: opts.vpsUrl,
        headers: opts.headers,
        companyId: opts.companyId,
        sourceId: opts.sourceId,
      });
      return { rules, source: 'vps' };
    } catch {
      if (cached) return { rules: cached, source: 'cache' };
      if (lastKnownRules.length) return { rules: lastKnownRules, source: 'last_known' };
    }
  }

  if (cached) return { rules: cached, source: 'cache' };
  if (lastKnownRules.length) return { rules: lastKnownRules, source: 'last_known' };

  const local = await opts.localLoader();
  setCachedSpamRules(cacheKey, local);
  return { rules: local, source: 'local' };
}

export function getLastKnownSpamRules(): SpamRule[] {
  return lastKnownRules;
}
