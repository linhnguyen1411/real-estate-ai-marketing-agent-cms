/**
 * Single source of truth for Facebook Group scan config defaults + validation.
 * Does not mutate AgentSource.config in the database.
 */

export interface FacebookScanConfig {
  maxPosts: number;
  maxScrolls: number;
  maxEmptyPasses: number;
  scrollPauseMs: number;
  loadWaitMs: number;
  /** Consecutive known (non-pinned) DB posts before stop */
  knownPostStopStreak: number;
  maxDurationSeconds: number;
  feedTab: string;
  pageTimeoutMs: number;
  maxContentChars: number;
  notifyOnScanComplete: boolean;
}

export const FACEBOOK_SCAN_DEFAULTS: FacebookScanConfig = {
  maxPosts: 100,
  maxScrolls: 20,
  maxEmptyPasses: 4,
  scrollPauseMs: 4000,
  loadWaitMs: 3000,
  knownPostStopStreak: 8,
  maxDurationSeconds: 180,
  feedTab: 'default',
  pageTimeoutMs: 45_000,
  maxContentChars: 12_000,
  notifyOnScanComplete: true,
};

/**
 * Resolve scan config from AgentSource.config (and optional mission maxItems).
 * Alias: stopAfterKnownPosts → knownPostStopStreak (legacy).
 */
export function resolveFacebookScanConfig(
  raw: unknown,
  options?: { maxItemsPerRun?: unknown },
): FacebookScanConfig {
  const config = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const knownStreakRaw =
    config.knownPostStopStreak ?? config.stopAfterKnownPosts;

  const resolved: FacebookScanConfig = {
    maxPosts: clampInt(config.maxPosts, 1, 1000, FACEBOOK_SCAN_DEFAULTS.maxPosts),
    maxScrolls: clampInt(config.maxScrolls, 1, 100, FACEBOOK_SCAN_DEFAULTS.maxScrolls),
    maxEmptyPasses: clampInt(config.maxEmptyPasses, 1, 10, FACEBOOK_SCAN_DEFAULTS.maxEmptyPasses),
    scrollPauseMs: clampInt(config.scrollPauseMs, 500, 10_000, FACEBOOK_SCAN_DEFAULTS.scrollPauseMs),
    loadWaitMs: clampInt(config.loadWaitMs, 500, 10_000, FACEBOOK_SCAN_DEFAULTS.loadWaitMs),
    knownPostStopStreak: clampInt(
      knownStreakRaw,
      1,
      50,
      FACEBOOK_SCAN_DEFAULTS.knownPostStopStreak,
    ),
    maxDurationSeconds: clampInt(
      config.maxDurationSeconds,
      30,
      1800,
      FACEBOOK_SCAN_DEFAULTS.maxDurationSeconds,
    ),
    feedTab: String(config.feedTab || FACEBOOK_SCAN_DEFAULTS.feedTab).trim() || 'default',
    pageTimeoutMs: clampInt(config.pageTimeoutMs, 10_000, 120_000, FACEBOOK_SCAN_DEFAULTS.pageTimeoutMs),
    maxContentChars: clampInt(
      config.maxContentChars,
      500,
      50_000,
      FACEBOOK_SCAN_DEFAULTS.maxContentChars,
    ),
    notifyOnScanComplete: config.notifyOnScanComplete !== false,
  };

  if (options?.maxItemsPerRun !== undefined) {
    resolved.maxPosts = clampInt(options.maxItemsPerRun, 1, 1000, resolved.maxPosts);
  }

  return resolved;
}

/** @deprecated use resolveFacebookScanConfig */
export function parseFacebookConfig(raw: unknown): FacebookScanConfig {
  return resolveFacebookScanConfig(raw);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}
