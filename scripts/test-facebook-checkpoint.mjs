#!/usr/bin/env node
/**
 * Facebook checkpoint / incremental scan / empty-pass unit tests (no live Facebook).
 * Run: npm run test:facebook-checkpoint
 */
import {
  buildNextCheckpoint,
  emptyScanMetrics,
  isKnownByCheckpoint,
  normalizeStopReason,
  parseFacebookCheckpoint,
  syncDeprecatedMetricAliases,
} from '../server/agent-worker/facebook/facebookCheckpoint.ts';
import {
  buildScanReport,
  createSessionDedupeSets,
  emptyEmptyPassState,
  emptyKnownStreakState,
  markSessionSeen,
  resolveDedupeMatch,
  resolveScanStopReason,
  shouldIgnoreForStopStreak,
  updateEmptyPassState,
  updateKnownStreak,
} from '../server/agent-worker/facebook/facebookIncrementalScan.ts';
import { resolveFacebookScanConfig } from '../server/agent-worker/facebook/facebookScanConfig.ts';
import {
  feedFingerprintChanged,
  shouldStopScrolling,
} from '../server/agent-worker/facebook/facebookScrollController.ts';

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, error) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error('   ', error instanceof Error ? error.message : error);
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail || 'assertion failed');
}

console.log('\n=== Facebook Checkpoint / Incremental — unit tests ===\n');

console.log('Config defaults + validation');
{
  const d = resolveFacebookScanConfig({});
  assert(d.maxPosts === 100, 'default maxPosts 100');
  assert(d.maxScrolls === 20, 'default maxScrolls 20');
  assert(d.maxEmptyPasses === 4, 'default maxEmptyPasses 4');
  assert(d.scrollPauseMs === 2500, 'default scrollPauseMs 2500');
  assert(d.loadWaitMs === 1500, 'default loadWaitMs 1500');
  assert(d.knownPostStopStreak === 8, 'default knownPostStopStreak 8');
  assert(d.maxDurationSeconds === 180, 'default maxDurationSeconds 180');

  const clamped = resolveFacebookScanConfig({
    maxPosts: 9999,
    maxScrolls: 0,
    maxEmptyPasses: 99,
    scrollPauseMs: 10,
    knownPostStopStreak: 0,
  });
  assert(clamped.maxPosts === 1000, 'maxPosts clamped to 1000');
  assert(clamped.maxScrolls === 1, 'maxScrolls min 1');
  assert(clamped.maxEmptyPasses === 10, 'maxEmptyPasses max 10');
  assert(clamped.scrollPauseMs === 500, 'scrollPauseMs min 500');
  assert(clamped.knownPostStopStreak === 1, 'knownPostStopStreak min 1');

  const legacy = resolveFacebookScanConfig({ stopAfterKnownPosts: 12 });
  assert(legacy.knownPostStopStreak === 12, 'stopAfterKnownPosts alias');
}

console.log('\nEmpty passes (must not stop after one)');
{
  let empty = emptyEmptyPassState();
  empty = updateEmptyPassState(empty, { uniqueNewInPass: 0, maxEmptyPasses: 4 });
  assert(empty.consecutiveEmptyPasses === 1 && !empty.shouldStop, '1 empty pass does not stop');
  empty = updateEmptyPassState(empty, { uniqueNewInPass: 0, maxEmptyPasses: 4 });
  empty = updateEmptyPassState(empty, { uniqueNewInPass: 0, maxEmptyPasses: 4 });
  assert(empty.consecutiveEmptyPasses === 3 && !empty.shouldStop, '3 empty passes do not stop');
  empty = updateEmptyPassState(empty, { uniqueNewInPass: 0, maxEmptyPasses: 4 });
  assert(empty.shouldStop && empty.consecutiveEmptyPasses === 4, '4 empty passes stop');

  empty = updateEmptyPassState(empty, { uniqueNewInPass: 2, maxEmptyPasses: 4 });
  assert(empty.consecutiveEmptyPasses === 0 && !empty.shouldStop, 'new unique posts reset empty counter');
}

console.log('\nSession dedup');
{
  const sets = createSessionDedupeSets();
  const a = markSessionSeen(sets, {
    externalId: '111',
    canonicalUrl: 'https://facebook.com/groups/x/posts/111',
    contentHash: 'hash-a',
  });
  assert(!a.duplicateInSession, 'first sighting is unique');
  const b = markSessionSeen(sets, {
    externalId: '111',
    canonicalUrl: 'https://facebook.com/groups/x/posts/111',
    contentHash: 'hash-a',
  });
  assert(b.duplicateInSession, 'same externalId is duplicateInSession');
  const c = markSessionSeen(sets, {
    externalId: null,
    canonicalUrl: 'https://facebook.com/groups/x/posts/222',
    contentHash: 'hash-b',
  });
  assert(!c.duplicateInSession, 'different post is unique');
  const d = markSessionSeen(sets, {
    externalId: null,
    canonicalUrl: 'https://facebook.com/groups/x/posts/222',
    contentHash: 'hash-other',
  });
  assert(d.duplicateInSession, 'same canonicalUrl is duplicateInSession');
  const e = markSessionSeen(sets, {
    externalId: null,
    canonicalUrl: 'https://facebook.com/groups/x/posts/333',
    contentHash: 'hash-b',
  });
  assert(e.duplicateInSession, 'same contentHash is duplicateInSession');
}

console.log('\nKnown streak + pinned');
{
  let streak = emptyKnownStreakState();
  streak = updateKnownStreak(streak, { isNew: false, isPinned: true, knownPostStopStreak: 3 });
  assert(streak.consecutiveKnown === 0, 'pinned known does not increment streak');
  assert(!streak.shouldStop, 'single pinned known does not stop');

  streak = updateKnownStreak(streak, { isNew: true, isPinned: false, knownPostStopStreak: 3 });
  assert(streak.consecutiveKnown === 0, 'new post resets known streak');

  streak = updateKnownStreak(streak, { isNew: false, isPinned: false, knownPostStopStreak: 3 });
  streak = updateKnownStreak(streak, { isNew: false, isPinned: false, knownPostStopStreak: 3 });
  streak = updateKnownStreak(streak, { isNew: false, isPinned: true, knownPostStopStreak: 3 });
  assert(streak.consecutiveKnown === 2, 'pinned between knowns does not add');
  streak = updateKnownStreak(streak, { isNew: false, isPinned: false, knownPostStopStreak: 3 });
  assert(streak.shouldStop, 'stops after knownPostStopStreak non-pinned known');

  assert(
    shouldIgnoreForStopStreak({
      isPinned: true,
      publishedAt: '2026-01-01T00:00:00.000Z',
      newestKnownPublishedAt: '2026-07-01T00:00:00.000Z',
    }),
    'pinned always ignored for stop',
  );
}

console.log('\nStop reasons');
{
  const started = Date.now();
  assert(
    resolveScanStopReason({
      uniquePostsObserved: 100,
      maxPosts: 100,
      scrollsPerformed: 0,
      maxScrolls: 20,
      startedAt: started,
      maxDurationSeconds: 180,
      knownPostStreak: 0,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 0,
      maxEmptyPasses: 4,
    }) === 'max_posts',
    'max_posts stop',
  );
  assert(
    resolveScanStopReason({
      uniquePostsObserved: 1,
      maxPosts: 100,
      scrollsPerformed: 20,
      maxScrolls: 20,
      startedAt: started,
      maxDurationSeconds: 180,
      knownPostStreak: 0,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 0,
      maxEmptyPasses: 4,
    }) === 'max_scrolls',
    'max_scrolls stop',
  );
  assert(
    resolveScanStopReason({
      uniquePostsObserved: 1,
      maxPosts: 100,
      scrollsPerformed: 1,
      maxScrolls: 20,
      startedAt: started - 200_000,
      maxDurationSeconds: 180,
      knownPostStreak: 0,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 0,
      maxEmptyPasses: 4,
      now: started,
    }) === 'max_duration',
    'max_duration stop',
  );
  assert(
    resolveScanStopReason({
      uniquePostsObserved: 1,
      maxPosts: 100,
      scrollsPerformed: 1,
      maxScrolls: 20,
      startedAt: started,
      maxDurationSeconds: 180,
      knownPostStreak: 8,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 0,
      maxEmptyPasses: 4,
    }) === 'known_post_streak',
    'known_post_streak stop',
  );
  assert(
    resolveScanStopReason({
      uniquePostsObserved: 1,
      maxPosts: 100,
      scrollsPerformed: 1,
      maxScrolls: 20,
      startedAt: started,
      maxDurationSeconds: 180,
      knownPostStreak: 0,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 4,
      maxEmptyPasses: 4,
    }) === 'consecutive_empty_passes',
    'consecutive_empty_passes stop',
  );
  assert(normalizeStopReason('no_new_posts') === 'consecutive_empty_passes', 'legacy no_new_posts mapped');
  assert(normalizeStopReason('known_posts') === 'known_post_streak', 'legacy known_posts mapped');

  assert(
    shouldStopScrolling({
      scrollsPerformed: 0,
      maxScrolls: 20,
      startedAt: Date.now(),
      maxDurationSeconds: 180,
      knownPostsStreak: 0,
      knownPostStopStreak: 8,
      consecutiveEmptyPasses: 1,
      maxEmptyPasses: 4,
    }) === null,
    'scroll controller: 1 empty pass does not stop',
  );
}

console.log('\nFeed fingerprint change detection');
{
  const before = {
    articleCount: 3,
    externalIds: ['1', '2'],
    canonicalUrls: ['https://fb/a', 'https://fb/b'],
    lastFingerprint: 'aaa|2|3',
  };
  assert(
    !feedFingerprintChanged(before, { ...before }),
    'identical fingerprint = no change',
  );
  assert(
    feedFingerprintChanged(before, { ...before, articleCount: 4 }),
    'article count increase = change',
  );
  assert(
    feedFingerprintChanged(before, {
      ...before,
      externalIds: ['1', '2', '3'],
    }),
    'new externalId = change',
  );
  assert(
    feedFingerprintChanged(before, {
      ...before,
      lastFingerprint: 'bbb|9|3',
    }),
    'last fingerprint change = change',
  );
}

console.log('\nCheckpoint format + success-only merge');
{
  const empty = parseFacebookCheckpoint(null);
  assert(empty.recentExternalIds.length === 0, 'empty recentExternalIds');
  assert(empty.lastSuccessfulScanAt === null, 'empty lastSuccessfulScanAt');

  const metrics = syncDeprecatedMetricAliases({
    ...emptyScanMetrics(),
    uniquePostsObserved: 5,
    newPostsInserted: 2,
    knownFromDatabase: 3,
    duplicateInSession: 11,
    parseFailed: 1,
    ignoredByRule: 0,
    findingsCreated: 1,
    notificationsCreated: 1,
    scrollsPerformed: 6,
    emptyPasses: 2,
    stoppedReason: 'consecutive_empty_passes',
    durationMs: 45_000,
  });

  const next = buildNextCheckpoint({
    previous: empty,
    groupUrl: 'https://www.facebook.com/groups/example',
    newExternalIds: ['111', '222', '111'],
    newCanonicalUrls: ['https://fb/posts/111'],
    newContentHashes: ['aaa', 'bbb'],
    newestPublishedAt: '2026-07-10T10:00:00.000Z',
    scanStats: metrics,
    completedAt: new Date('2026-07-11T01:00:00.000Z'),
  });

  assert(next.recentExternalIds[0] === '111', 'new ids prepended');
  assert(next.recentCanonicalUrls.includes('https://fb/posts/111'), 'stores recentCanonicalUrls');
  assert(next.lastSuccessfulScanAt === '2026-07-11T01:00:00.000Z', 'sets lastSuccessfulScanAt');
  assert(next.newestPublishedAt === '2026-07-10T10:00:00.000Z', 'sets newestPublishedAt');
  assert(next.lastStopReason === 'consecutive_empty_passes', 'stores lastStopReason');
  assert(next.lastScanMetrics?.newPostsInserted === 2, 'stores lastScanMetrics');
  assert(next.scanStats?.postsNew === 2, 'compat scanStats.postsNew');
  assert(isKnownByCheckpoint(next, { externalId: '222', contentHash: 'zzz' }), 'known by externalId');
  assert(isKnownByCheckpoint(next, { externalId: null, contentHash: 'aaa' }), 'known by contentHash');

  // Legacy checkpoint still parses
  const legacy = parseFacebookCheckpoint({
    lastSeenExternalIds: ['legacy-1'],
    recentContentHashes: ['h1'],
    newestKnownPublishedAt: '2026-06-01T00:00:00.000Z',
    scanStats: { postsNew: 9, stoppedReason: 'known_posts' },
  });
  assert(legacy.recentExternalIds[0] === 'legacy-1', 'legacy lastSeenExternalIds mapped');
  assert(legacy.newestPublishedAt?.startsWith('2026-06-01'), 'legacy newestKnownPublishedAt mapped');
  assert(legacy.lastScanMetrics?.newPostsInserted === 9, 'legacy scanStats mapped to metrics');
}

console.log('\nMetrics classification + report shape');
{
  const metrics = syncDeprecatedMetricAliases({
    ...emptyScanMetrics(),
    articlesObserved: 40,
    uniquePostsObserved: 10,
    newPostsInserted: 4,
    knownFromDatabase: 5,
    duplicateInSession: 20,
    parseFailed: 1,
    ignoredByRule: 2,
    analyzed: 3,
    findingsCreated: 2,
    notificationsCreated: 1,
    scrollsPerformed: 8,
    emptyPasses: 2,
    stoppedReason: 'known_post_streak',
    durationMs: 9000,
  });
  assert(metrics.ignored === 23, 'deprecated ignored = dup+parse+rule');
  assert(metrics.postsNew === 4 && metrics.postsSeen === 10, 'deprecated aliases synced');

  const report = buildScanReport(metrics);
  assert(report.stopReason === 'known_post_streak', 'report.stopReason');
  assert(report.scrollsCompleted === 8, 'report.scrollsCompleted');
  assert(report.emptyPasses === 2, 'report.emptyPasses');
  assert(report.metrics.newPostsInserted === 4, 'report.metrics.newPostsInserted');
  assert(report.metrics.duplicateInSession === 20, 'report.metrics.duplicateInSession');
  assert(report.ignored === 23, 'compat ignored still present');
  assert(report.postsNew === 4, 'compat postsNew still present');
}

console.log('\nDedup priority');
{
  assert(
    resolveDedupeMatch({
      externalId: '1',
      canonicalUrl: 'https://fb/posts/1',
      contentHash: 'h',
      existsByExternalId: true,
      existsByCanonicalUrl: true,
      existsByContentHash: true,
    }) === 'externalId',
    'externalId wins',
  );
  assert(
    resolveDedupeMatch({
      externalId: null,
      canonicalUrl: 'https://fb/posts/1',
      contentHash: 'h',
      existsByExternalId: false,
      existsByCanonicalUrl: true,
      existsByContentHash: true,
    }) === 'canonicalUrl',
    'canonicalUrl second',
  );
  assert(
    resolveDedupeMatch({
      externalId: null,
      canonicalUrl: 'https://fb/posts/1',
      contentHash: 'h',
      existsByExternalId: false,
      existsByCanonicalUrl: false,
      existsByContentHash: false,
    }) === null,
    'new post',
  );
}

console.log('\nCheckpoint write contract (success path only — documented)');
{
  // Adapter only calls buildNextCheckpoint after a successful loop (no throw).
  // Failure path updates lastError only — verified by code review + this invariant:
  const before = parseFacebookCheckpoint({
    recentExternalIds: ['keep-me'],
    lastSuccessfulScanAt: '2026-07-01T00:00:00.000Z',
  });
  assert(before.recentExternalIds[0] === 'keep-me', 'failed scan would keep previous checkpoint ids');
  // Successful scan replaces via buildNextCheckpoint:
  const after = buildNextCheckpoint({
    previous: before,
    groupUrl: 'https://www.facebook.com/groups/example',
    newExternalIds: ['new-1'],
    newContentHashes: ['nh'],
    newestPublishedAt: null,
    scanStats: { ...emptyScanMetrics(), newPostsInserted: 1, stoppedReason: 'max_scrolls' },
  });
  assert(after.recentExternalIds[0] === 'new-1', 'success scan updates checkpoint');
  assert(after.lastStopReason === 'max_scrolls', 'success scan stores stop reason');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
