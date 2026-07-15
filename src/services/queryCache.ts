/**
 * Lightweight in-memory TTL cache for CMS read APIs.
 * Not a replacement for TanStack Query — enough for bootstrap + module reuse.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export const CACHE_TTL_MS = {
  dashboard: 30_000,
  findings: 30_000,
  notifications: 20_000,
  navigationCounts: 20_000,
  crm: 120_000,
  properties: 120_000,
  settings: 10 * 60_000,
  channels: 10 * 60_000,
  automations: 120_000,
} as const;

export type CacheTtlKey = keyof typeof CACHE_TTL_MS;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await loader();
  return cacheSet(key, value, ttlMs);
}

/** Invalidate one key or all keys starting with prefix. */
export function cacheInvalidate(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

export function cacheInvalidateMany(keys: string[]): void {
  for (const key of keys) cacheInvalidate(key);
}

/** After promote / CRM mutate: drop related module caches without full CMS reload. */
export function invalidateAfterLeadPromote(): void {
  cacheInvalidateMany([
    'dashboard',
    'navigation-counts',
    'findings',
    'investor-leads',
    'crm',
    'notifications',
  ]);
}

export function invalidateCrmModule(): void {
  cacheInvalidateMany(['dashboard', 'navigation-counts', 'crm', 'properties']);
}
