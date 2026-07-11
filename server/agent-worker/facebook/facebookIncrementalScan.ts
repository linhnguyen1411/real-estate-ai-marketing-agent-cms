/**
 * Pure incremental-scan helpers for Facebook Group Reader.
 * Testable with fixtures — no Playwright.
 */

import {
  isKnownByCheckpoint,
  normalizeStopReason,
  syncDeprecatedMetricAliases,
  type FacebookScanMetrics,
  type FacebookSourceCheckpoint,
} from './facebookCheckpoint';

export type DedupeMatchKind = 'externalId' | 'canonicalUrl' | 'contentHash' | null;

export interface IncrementalPostInput {
  externalId: string | null;
  canonicalUrl: string;
  contentHash: string;
  publishedAt: string | null;
  /** Pinned / featured posts must not alone stop incremental scan */
  isPinned?: boolean;
}

export interface KnownStreakState {
  consecutiveKnown: number;
  shouldStop: boolean;
  ignoredPinnedKnown: number;
}

export interface EmptyPassState {
  consecutiveEmptyPasses: number;
  shouldStop: boolean;
}

export interface SessionDedupeSets {
  seenExternalIds: Set<string>;
  seenCanonicalUrls: Set<string>;
  seenContentHashes: Set<string>;
}

/**
 * Update consecutive-known streak.
 * - New posts reset streak.
 * - Known pinned posts do NOT increment streak.
 * - Known non-pinned posts increment streak; stop when >= knownPostStopStreak.
 */
export function updateKnownStreak(
  state: KnownStreakState,
  input: {
    isNew: boolean;
    isPinned: boolean;
    /** @deprecated alias for knownPostStopStreak */
    stopAfterKnownPosts?: number;
    knownPostStopStreak?: number;
  },
): KnownStreakState {
  const threshold = input.knownPostStopStreak ?? input.stopAfterKnownPosts ?? 8;

  if (input.isNew) {
    return {
      consecutiveKnown: 0,
      shouldStop: false,
      ignoredPinnedKnown: state.ignoredPinnedKnown,
    };
  }

  if (input.isPinned) {
    return {
      consecutiveKnown: state.consecutiveKnown,
      shouldStop: false,
      ignoredPinnedKnown: state.ignoredPinnedKnown + 1,
    };
  }

  const consecutiveKnown = state.consecutiveKnown + 1;
  return {
    consecutiveKnown,
    shouldStop: consecutiveKnown >= threshold,
    ignoredPinnedKnown: state.ignoredPinnedKnown,
  };
}

export function emptyKnownStreakState(): KnownStreakState {
  return { consecutiveKnown: 0, shouldStop: false, ignoredPinnedKnown: 0 };
}

export function emptyEmptyPassState(): EmptyPassState {
  return { consecutiveEmptyPasses: 0, shouldStop: false };
}

/**
 * Empty pass = no unique posts newly observed in this session during the pass.
 * One empty pass must NOT stop; stop only when consecutiveEmptyPasses >= maxEmptyPasses.
 */
export function updateEmptyPassState(
  state: EmptyPassState,
  input: { uniqueNewInPass: number; maxEmptyPasses: number },
): EmptyPassState {
  if (input.uniqueNewInPass > 0) {
    return { consecutiveEmptyPasses: 0, shouldStop: false };
  }
  const consecutiveEmptyPasses = state.consecutiveEmptyPasses + 1;
  return {
    consecutiveEmptyPasses,
    shouldStop: consecutiveEmptyPasses >= input.maxEmptyPasses,
  };
}

export function createSessionDedupeSets(): SessionDedupeSets {
  return {
    seenExternalIds: new Set(),
    seenCanonicalUrls: new Set(),
    seenContentHashes: new Set(),
  };
}

/**
 * Session identity: externalId → canonicalUrl → contentHash.
 * Returns whether this post was already seen in the current scan.
 */
export function markSessionSeen(
  sets: SessionDedupeSets,
  post: { externalId: string | null; canonicalUrl: string; contentHash: string },
): { duplicateInSession: boolean; identityKey: string } {
  if (post.externalId && sets.seenExternalIds.has(post.externalId)) {
    return { duplicateInSession: true, identityKey: `id:${post.externalId}` };
  }
  if (post.canonicalUrl && sets.seenCanonicalUrls.has(post.canonicalUrl)) {
    return { duplicateInSession: true, identityKey: `url:${post.canonicalUrl}` };
  }
  if (sets.seenContentHashes.has(post.contentHash)) {
    return { duplicateInSession: true, identityKey: `hash:${post.contentHash}` };
  }

  if (post.externalId) sets.seenExternalIds.add(post.externalId);
  if (post.canonicalUrl) sets.seenCanonicalUrls.add(post.canonicalUrl);
  sets.seenContentHashes.add(post.contentHash);

  const identityKey = post.externalId
    ? `id:${post.externalId}`
    : post.canonicalUrl
      ? `url:${post.canonicalUrl}`
      : `hash:${post.contentHash}`;

  return { duplicateInSession: false, identityKey };
}

/**
 * Dedup priority: externalId > canonicalUrl > contentHash.
 */
export function resolveDedupeMatch(input: {
  externalId: string | null;
  canonicalUrl: string;
  contentHash: string;
  existsByExternalId: boolean;
  existsByCanonicalUrl: boolean;
  existsByContentHash: boolean;
}): DedupeMatchKind {
  if (input.externalId && input.existsByExternalId) return 'externalId';
  if (input.canonicalUrl && input.existsByCanonicalUrl) return 'canonicalUrl';
  if (input.existsByContentHash) return 'contentHash';
  return null;
}

export function isDuplicateAgainstCheckpoint(
  checkpoint: FacebookSourceCheckpoint,
  post: Pick<IncrementalPostInput, 'externalId' | 'contentHash' | 'canonicalUrl'>,
): boolean {
  return isKnownByCheckpoint(checkpoint, {
    externalId: post.externalId,
    contentHash: post.contentHash,
    canonicalUrl: post.canonicalUrl,
  });
}

/**
 * Decide if a known post should be treated as pinned for streak purposes.
 * If publishedAt is older than newestKnownPublishedAt by > 7 days → treat as stale/pinned-like.
 */
export function shouldIgnoreForStopStreak(input: {
  isPinned: boolean;
  publishedAt: string | null;
  newestKnownPublishedAt: string | null;
}): boolean {
  if (input.isPinned) return true;
  if (!input.publishedAt || !input.newestKnownPublishedAt) return false;
  const published = new Date(input.publishedAt).getTime();
  const newest = new Date(input.newestKnownPublishedAt).getTime();
  if (Number.isNaN(published) || Number.isNaN(newest)) return false;
  return published < newest - 7 * 24 * 60 * 60 * 1000;
}

export function buildScanReport(stats: FacebookScanMetrics): Record<string, unknown> {
  const synced = syncDeprecatedMetricAliases({ ...stats });
  const stopReason = normalizeStopReason(synced.stoppedReason);

  return {
    stopReason,
    scrollsCompleted: synced.scrollsPerformed,
    emptyPasses: synced.emptyPasses,
    durationMs: synced.durationMs,
    metrics: {
      articlesObserved: synced.articlesObserved,
      uniquePostsObserved: synced.uniquePostsObserved,
      newPostsInserted: synced.newPostsInserted,
      knownFromDatabase: synced.knownFromDatabase,
      duplicateInSession: synced.duplicateInSession,
      parseFailed: synced.parseFailed,
      ignoredByRule: synced.ignoredByRule,
      analyzed: synced.analyzed,
      findingsCreated: synced.findingsCreated,
      notificationsCreated: synced.notificationsCreated,
    },
    // Backward-compatible flat fields
    postsSeen: synced.uniquePostsObserved,
    postsNew: synced.newPostsInserted,
    duplicates: synced.knownFromDatabase,
    ignored: synced.ignored,
    analyzed: synced.analyzed,
    findings: synced.findingsCreated,
    notifyCount: synced.notificationsCreated,
    scrollsPerformed: synced.scrollsPerformed,
    seeMoreClicks: synced.seeMoreClicks,
    stoppedReason: stopReason,
    articlesObserved: synced.articlesObserved,
    uniquePostsObserved: synced.uniquePostsObserved,
    newPostsInserted: synced.newPostsInserted,
    knownFromDatabase: synced.knownFromDatabase,
    duplicateInSession: synced.duplicateInSession,
    parseFailed: synced.parseFailed,
    ignoredByRule: synced.ignoredByRule,
    findingsCreated: synced.findingsCreated,
    notificationsCreated: synced.notificationsCreated,
  };
}

export function pickNewestPublishedAt(
  current: string | null,
  candidate: string | null,
): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() >= new Date(current).getTime() ? candidate : current;
}

/** Pure stop-check helpers for unit tests (mirrors scroll controller order). */
export function resolveScanStopReason(input: {
  uniquePostsObserved: number;
  maxPosts: number;
  scrollsPerformed: number;
  maxScrolls: number;
  startedAt: number;
  maxDurationSeconds: number;
  knownPostStreak: number;
  knownPostStopStreak: number;
  consecutiveEmptyPasses: number;
  maxEmptyPasses: number;
  now?: number;
}): string | null {
  if (input.uniquePostsObserved >= input.maxPosts) return 'max_posts';
  if (input.knownPostStreak >= input.knownPostStopStreak) return 'known_post_streak';
  if (input.scrollsPerformed >= input.maxScrolls) return 'max_scrolls';
  const now = input.now ?? Date.now();
  if ((now - input.startedAt) / 1000 >= input.maxDurationSeconds) return 'max_duration';
  if (input.consecutiveEmptyPasses >= input.maxEmptyPasses) {
    return 'consecutive_empty_passes';
  }
  return null;
}
