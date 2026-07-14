/**
 * Facebook source checkpoint — incremental scan state.
 * Pure data helpers; no Playwright / network.
 */

export const CHECKPOINT_MAX_EXTERNAL_IDS = 200;
export const CHECKPOINT_MAX_CANONICAL_URLS = 200;
export const CHECKPOINT_MAX_CONTENT_HASHES = 200;

/** Canonical stop reasons for Facebook group scan */
export type FacebookStopReason =
  | 'max_posts'
  | 'max_scrolls'
  | 'max_duration'
  | 'consecutive_empty_passes'
  | 'known_post_streak'
  | 'login_required'
  | 'checkpoint'
  | 'challenge'
  | 'navigation_lost'
  | 'modal_stuck'
  | 'wrong_scroll_target'
  | 'feed_not_recovered'
  | 'navigation_state_unknown'
  | 'cancelled'
  | 'error'
  | 'pending';

export interface FacebookScanMetrics {
  articlesObserved: number;
  uniquePostsObserved: number;
  newPostsInserted: number;
  knownFromDatabase: number;
  duplicateInSession: number;
  parseFailed: number;
  ignoredByRule: number;
  analyzed: number;
  findingsCreated: number;
  notificationsCreated: number;
  domainRealEstate?: number;
  domainVehicle?: number;
  domainConsumerGoods?: number;
  domainEmployment?: number;
  domainService?: number;
  domainUnknown?: number;
  outOfDomainRejected?: number;
  domainNeedsReview?: number;
  falsePositivePrevented?: number;
  /** @deprecated prefer duplicateInSession + parseFailed + ignoredByRule */
  ignored: number;
  /** @deprecated prefer uniquePostsObserved */
  postsSeen: number;
  /** @deprecated prefer newPostsInserted */
  postsNew: number;
  /** @deprecated prefer knownFromDatabase */
  duplicates: number;
  /** @deprecated prefer findingsCreated */
  findings: number;
  /** @deprecated prefer notificationsCreated */
  notifyCount: number;
  scrollsPerformed: number;
  seeMoreClicks: number;
  emptyPasses: number;
  /** Times an accidental post-detail modal/navigation was recovered back to feed */
  modalRecoveries: number;
  // --- Navigation / classification observability (Sprint FB-nav) ---
  articleNodesObserved: number;
  postCandidates: number;
  postsAccepted: number;
  commentsRejected: number;
  unknownArticlesRejected: number;
  modalsDetected: number;
  modalsOpened: number;
  modalsClosed: number;
  modalCloseFailures: number;
  feedScrollAttempts: number;
  feedScrollSuccess: number;
  commentScrollsDetected: number;
  wrongScrollTargetFailures: number;
  feedStateRecoveries: number;
  feedStateRecoveryFailures: number;
  /** Posts extracted from GraphQL network (DOM often stays skeleton under CDP) */
  graphqlPostsCaptured: number;
  graphqlPostsInserted: number;
  stoppedReason: FacebookStopReason | string;
  durationMs: number;
}

export interface FacebookSourceCheckpoint {
  lastSuccessfulScanAt: string | null;
  recentExternalIds: string[];
  recentCanonicalUrls: string[];
  recentContentHashes: string[];
  newestPublishedAt: string | null;
  lastStopReason: string | null;
  lastScanMetrics: FacebookScanMetrics | null;
  lastGroupUrl?: string;
  /** @deprecated use recentExternalIds */
  lastSeenExternalIds: string[];
  /** @deprecated use newestPublishedAt */
  newestKnownPublishedAt: string | null;
  /** @deprecated use lastScanMetrics */
  scanStats: FacebookScanMetrics | null;
  /** @deprecated legacy */
  lastScanAt?: string;
  lastDedupeKey?: string | null;
}

export function emptyScanMetrics(): FacebookScanMetrics {
  return {
    articlesObserved: 0,
    uniquePostsObserved: 0,
    newPostsInserted: 0,
    knownFromDatabase: 0,
    duplicateInSession: 0,
    parseFailed: 0,
    ignoredByRule: 0,
    analyzed: 0,
    findingsCreated: 0,
    notificationsCreated: 0,
    domainRealEstate: 0,
    domainVehicle: 0,
    domainConsumerGoods: 0,
    domainEmployment: 0,
    domainService: 0,
    domainUnknown: 0,
    outOfDomainRejected: 0,
    domainNeedsReview: 0,
    falsePositivePrevented: 0,
    ignored: 0,
    postsSeen: 0,
    postsNew: 0,
    duplicates: 0,
    findings: 0,
    notifyCount: 0,
    scrollsPerformed: 0,
    seeMoreClicks: 0,
    emptyPasses: 0,
    modalRecoveries: 0,
    articleNodesObserved: 0,
    postCandidates: 0,
    postsAccepted: 0,
    commentsRejected: 0,
    unknownArticlesRejected: 0,
    modalsDetected: 0,
    modalsOpened: 0,
    modalsClosed: 0,
    modalCloseFailures: 0,
    feedScrollAttempts: 0,
    feedScrollSuccess: 0,
    commentScrollsDetected: 0,
    wrongScrollTargetFailures: 0,
    feedStateRecoveries: 0,
    feedStateRecoveryFailures: 0,
    graphqlPostsCaptured: 0,
    graphqlPostsInserted: 0,
    stoppedReason: 'pending',
    durationMs: 0,
  };
}

/** @deprecated use emptyScanMetrics */
export function emptyScanStats(): FacebookScanMetrics {
  return emptyScanMetrics();
}

export type FacebookScanStats = FacebookScanMetrics;

export function syncDeprecatedMetricAliases(metrics: FacebookScanMetrics): FacebookScanMetrics {
  metrics.postsSeen = metrics.uniquePostsObserved;
  metrics.postsNew = metrics.newPostsInserted;
  metrics.duplicates = metrics.knownFromDatabase;
  metrics.findings = metrics.findingsCreated;
  metrics.notifyCount = metrics.notificationsCreated;
  metrics.ignored =
    metrics.duplicateInSession + metrics.parseFailed + metrics.ignoredByRule;
  return metrics;
}

export function parseFacebookCheckpoint(raw: unknown): FacebookSourceCheckpoint {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const metricsRaw =
    (data.lastScanMetrics && typeof data.lastScanMetrics === 'object'
      ? (data.lastScanMetrics as Record<string, unknown>)
      : null) ??
    (data.scanStats && typeof data.scanStats === 'object'
      ? (data.scanStats as Record<string, unknown>)
      : null);

  const recentExternalIds = toStringList(
    data.recentExternalIds ?? data.lastSeenExternalIds,
    CHECKPOINT_MAX_EXTERNAL_IDS,
  );
  const recentCanonicalUrls = toStringList(
    data.recentCanonicalUrls,
    CHECKPOINT_MAX_CANONICAL_URLS,
  );
  const recentContentHashes = toStringList(
    data.recentContentHashes,
    CHECKPOINT_MAX_CONTENT_HASHES,
  );
  const newestPublishedAt =
    nullableIso(data.newestPublishedAt) ?? nullableIso(data.newestKnownPublishedAt);
  const metrics = metricsRaw ? parseMetrics(metricsRaw) : null;

  return {
    lastSuccessfulScanAt: nullableIso(data.lastSuccessfulScanAt) ?? nullableIso(data.lastScanAt),
    recentExternalIds,
    recentCanonicalUrls,
    recentContentHashes,
    newestPublishedAt,
    lastStopReason:
      data.lastStopReason != null
        ? String(data.lastStopReason)
        : metrics?.stoppedReason
          ? String(metrics.stoppedReason)
          : null,
    lastScanMetrics: metrics,
    lastGroupUrl: typeof data.lastGroupUrl === 'string' ? data.lastGroupUrl : undefined,
    lastSeenExternalIds: recentExternalIds,
    newestKnownPublishedAt: newestPublishedAt,
    scanStats: metrics,
    lastScanAt: nullableIso(data.lastScanAt) ?? undefined,
    lastDedupeKey: data.lastDedupeKey == null ? null : String(data.lastDedupeKey),
  };
}

/**
 * Build next checkpoint only after a successful scan.
 * Prepends newly seen IDs/hashes/URLs; keeps bounded lists.
 */
export function buildNextCheckpoint(input: {
  previous: FacebookSourceCheckpoint;
  groupUrl: string;
  newExternalIds: string[];
  newCanonicalUrls?: string[];
  newContentHashes: string[];
  newestPublishedAt: string | null;
  scanStats: FacebookScanMetrics;
  completedAt?: Date;
}): FacebookSourceCheckpoint {
  const completedAt = (input.completedAt ?? new Date()).toISOString();
  const metrics = syncDeprecatedMetricAliases({ ...input.scanStats });
  const recentExternalIds = mergeUniqueFront(
    input.newExternalIds,
    input.previous.recentExternalIds.length
      ? input.previous.recentExternalIds
      : input.previous.lastSeenExternalIds,
    CHECKPOINT_MAX_EXTERNAL_IDS,
  );
  const recentCanonicalUrls = mergeUniqueFront(
    input.newCanonicalUrls ?? [],
    input.previous.recentCanonicalUrls,
    CHECKPOINT_MAX_CANONICAL_URLS,
  );
  const recentContentHashes = mergeUniqueFront(
    input.newContentHashes,
    input.previous.recentContentHashes,
    CHECKPOINT_MAX_CONTENT_HASHES,
  );
  const newestPublishedAt = pickNewestIso(
    input.newestPublishedAt,
    input.previous.newestPublishedAt ?? input.previous.newestKnownPublishedAt,
  );

  return {
    lastSuccessfulScanAt: completedAt,
    recentExternalIds,
    recentCanonicalUrls,
    recentContentHashes,
    newestPublishedAt,
    lastStopReason: String(metrics.stoppedReason || 'pending'),
    lastScanMetrics: metrics,
    lastGroupUrl: input.groupUrl,
    lastSeenExternalIds: recentExternalIds,
    newestKnownPublishedAt: newestPublishedAt,
    scanStats: metrics,
    lastScanAt: completedAt,
  };
}

export function isKnownByCheckpoint(
  checkpoint: FacebookSourceCheckpoint,
  keys: { externalId: string | null; contentHash: string; canonicalUrl?: string | null },
): boolean {
  if (keys.externalId && checkpoint.recentExternalIds.includes(keys.externalId)) {
    return true;
  }
  if (keys.canonicalUrl && checkpoint.recentCanonicalUrls.includes(keys.canonicalUrl)) {
    return true;
  }
  return checkpoint.recentContentHashes.includes(keys.contentHash);
}

function parseMetrics(raw: Record<string, unknown>): FacebookScanMetrics {
  const uniquePostsObserved = pickMetric(raw, 'uniquePostsObserved', 'postsSeen');
  const newPostsInserted = pickMetric(raw, 'newPostsInserted', 'postsNew');
  const knownFromDatabase = pickMetric(raw, 'knownFromDatabase', 'duplicates');
  const duplicateInSession = num(raw.duplicateInSession);
  const parseFailed = num(raw.parseFailed);
  const ignoredByRule = num(raw.ignoredByRule);
  const findingsCreated = pickMetric(raw, 'findingsCreated', 'findings');
  const notificationsCreated = pickMetric(raw, 'notificationsCreated', 'notifyCount');
  const ignored = num(
    raw.ignored ?? duplicateInSession + parseFailed + ignoredByRule,
  );

  return syncDeprecatedMetricAliases({
    articlesObserved: num(raw.articlesObserved),
    uniquePostsObserved,
    newPostsInserted,
    knownFromDatabase,
    duplicateInSession,
    parseFailed,
    ignoredByRule,
    analyzed: num(raw.analyzed),
    findingsCreated,
    notificationsCreated,
    ignored,
    postsSeen: uniquePostsObserved,
    postsNew: newPostsInserted,
    duplicates: knownFromDatabase,
    findings: findingsCreated,
    notifyCount: notificationsCreated,
    scrollsPerformed: num(raw.scrollsPerformed),
    seeMoreClicks: num(raw.seeMoreClicks),
    emptyPasses: num(raw.emptyPasses),
    modalRecoveries: num(raw.modalRecoveries),
    articleNodesObserved: num(raw.articleNodesObserved),
    postCandidates: num(raw.postCandidates),
    postsAccepted: num(raw.postsAccepted),
    commentsRejected: num(raw.commentsRejected),
    unknownArticlesRejected: num(raw.unknownArticlesRejected),
    modalsDetected: num(raw.modalsDetected),
    modalsOpened: num(raw.modalsOpened),
    modalsClosed: num(raw.modalsClosed),
    modalCloseFailures: num(raw.modalCloseFailures),
    feedScrollAttempts: num(raw.feedScrollAttempts),
    feedScrollSuccess: num(raw.feedScrollSuccess),
    commentScrollsDetected: num(raw.commentScrollsDetected),
    wrongScrollTargetFailures: num(raw.wrongScrollTargetFailures),
    feedStateRecoveries: num(raw.feedStateRecoveries),
    feedStateRecoveryFailures: num(raw.feedStateRecoveryFailures),
    graphqlPostsCaptured: num(raw.graphqlPostsCaptured),
    graphqlPostsInserted: num(raw.graphqlPostsInserted),
    stoppedReason: normalizeStopReason(raw.stoppedReason ?? raw.stopReason),
    durationMs: num(raw.durationMs),
  });
}

/** Prefer modern key when present; otherwise legacy. Avoids 0 from empty modern fields masking legacy. */
function pickMetric(
  raw: Record<string, unknown>,
  modernKey: string,
  legacyKey: string,
): number {
  if (Object.prototype.hasOwnProperty.call(raw, modernKey)) {
    return num(raw[modernKey]);
  }
  return num(raw[legacyKey]);
}

export function normalizeStopReason(value: unknown): string {
  const raw = String(value || 'pending');
  if (raw === 'no_new_posts') return 'consecutive_empty_passes';
  if (raw === 'known_posts' || raw === 'completed') {
    return raw === 'known_posts' ? 'known_post_streak' : 'consecutive_empty_passes';
  }
  return raw;
}

function mergeUniqueFront(newer: string[], older: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...newer, ...older]) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function toStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const str = String(item || '').trim();
    if (!str || seen.has(str)) continue;
    seen.add(str);
    out.push(str);
    if (out.length >= max) break;
  }
  return out;
}

function nullableIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pickNewestIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
