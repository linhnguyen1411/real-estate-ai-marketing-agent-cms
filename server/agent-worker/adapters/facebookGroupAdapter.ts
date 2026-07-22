import type { Page } from 'playwright';
import { Prisma } from '@prisma/client';
import { assertAgentSourceActiveForScan } from '../../agent/agentDb';
import { prisma } from '../../prisma';
import { getLeadAnalysisLimits } from '../../agent/leadAnalyzer';
import {
  notifyScanHotLeads,
  notifyScanSummary,
} from '../../agent/agentNotificationService';
import { detectFacebookAuthBlock } from '../facebook/facebookCheckpointDetector';
import {
  buildNextCheckpoint,
  emptyScanMetrics,
  parseFacebookCheckpoint,
  syncDeprecatedMetricAliases,
  type FacebookScanMetrics,
} from '../facebook/facebookCheckpoint';
import {
  expandSeeMoreInFeedPosts,
  parseVisibleFacebookPostsWithStats,
} from '../facebook/facebookDomParser';
import {
  attachFacebookGraphqlCapture,
  graphqlCaptureToFacebookPost,
} from '../facebook/facebookGraphqlCapture';
import { locateFacebookGroupFeed, waitForFacebookFeedPostsHydrated } from '../facebook/facebookFeedLocator';
import {
  buildScanReport,
  createSessionDedupeSets,
  emptyEmptyPassState,
  emptyKnownStreakState,
  markSessionSeen,
  pickNewestPublishedAt,
  shouldIgnoreForStopStreak,
  updateEmptyPassState,
  updateKnownStreak,
} from '../facebook/facebookIncrementalScan';
import {
  resolveFacebookScanConfig,
  type FacebookScanConfig,
} from '../facebook/facebookScanConfig';
import {
  isFacebookGroupUrl,
  isFacebookScannableUrl,
  normalizeFacebookSourceUrl,
} from '../facebook/facebookSelectors';
import {
  closeFacebookModalIfOpen,
  ensureGroupFeedState,
  isAuthBlockedState,
  FACEBOOK_NAV_ERROR_CODES,
  type EnsureGroupFeedResult,
} from '../facebook/facebookNavigationState';
import {
  captureFacebookDebugArtifact,
  getWorkerId,
  handleFacebookAuthBlocked,
} from '../facebook/facebookSessionGuard';
import {
  ensureFacebookDiscussionTab,
  scrollFacebookGroupFeed,
  shouldStopScrolling,
  switchFacebookFeedTab,
} from '../facebook/facebookScrollController';
import { computeContentHash, normalizeText } from '../services/contentNormalizer';
import {
  findExistingFacebookPostDetailed,
  saveFacebookScannedPost,
} from '../services/contentRepository';
import { type AnalysisBudget } from '../services/findingRuleEngine';
import { processContentAfterCollect } from '../../modules/mission-engine/application/processContentAfterCollect';
import type { ScanContext, ScanMetrics, SourceAdapter } from './sourceAdapter';

/** @deprecated use FacebookScanConfig from facebookScanConfig */
export type FacebookGroupConfig = FacebookScanConfig;

const SUPPORTED_TYPE = 'facebook_group';
const FEED_WAIT_MS = 10_000;

export class FacebookGroupAdapter implements SourceAdapter {
  readonly name = 'facebook_group';

  supports(sourceType: string): boolean {
    return sourceType === SUPPORTED_TYPE;
  }

  async scan(ctx: ScanContext): Promise<ScanMetrics> {
    const started = Date.now();
    const missionRules = (ctx.mission?.rules || {}) as Record<string, unknown>;
    const config = resolveFacebookScanConfig(ctx.source.config, {
      maxItemsPerRun: missionRules.maxItemsPerRun,
    });
    const groupUrl = normalizeFacebookSourceUrl(ctx.source.url);
    const isGroupSource = isFacebookGroupUrl(groupUrl);
    const previousCheckpoint = parseFacebookCheckpoint(ctx.source.checkpoint);

    if (!isFacebookScannableUrl(groupUrl)) {
      throw new Error(
        `URL Facebook không hỗ trợ quét (cần group /groups/... hoặc feed cá nhân https://www.facebook.com): ${groupUrl}`,
      );
    }

    // Reused, worker-owned scan tab — never drive/close the user's Facebook tab.
    const page = await ctx.browser.getScanPage({
      source: ctx.source,
      preferredDomain: 'facebook.com',
      initialUrl: groupUrl,
    });
    const analysisBudget: AnalysisBudget = {
      used: 0,
      max: getLeadAnalysisLimits().maxPerJob,
    };

    // Fresh per-job runtime state — never inherit a modal/dedup from a prior job.
    const stats: FacebookScanMetrics = emptyScanMetrics();
    let streak = emptyKnownStreakState();
    let emptyPasses = emptyEmptyPassState();
    let feedTabSwitched = false;
    let checkpointUpdated = false;
    let scanErrorCode: string | null = null;

    const sessionSets = createSessionDedupeSets();
    const newExternalIds: string[] = [];
    const newCanonicalUrls: string[] = [];
    const newContentHashes: string[] = [];
    let newestPublishedAt: string | null =
      previousCheckpoint.newestPublishedAt ?? previousCheckpoint.newestKnownPublishedAt;

    const graphqlCapture = attachFacebookGraphqlCapture(page, { groupUrl });

    const ensureFeed = async (): Promise<EnsureGroupFeedResult> => {
      const res = await ensureGroupFeedState({
        page,
        sourceUrl: groupUrl,
        ownedByWorker: true,
        pageTimeoutMs: config.pageTimeoutMs,
        feedWaitMs: FEED_WAIT_MS,
      });
      applyEnsureMetrics(stats, res);
      return res;
    };

    const processOnePost = async (
      post: import('../facebook/facebookDomParser').FacebookPostParsed,
      uniqueNewRef: { count: number },
    ): Promise<void> => {
      if (stats.uniquePostsObserved >= config.maxPosts) {
        stats.stoppedReason = 'max_posts';
        return;
      }

      const bodyText = normalizeText(post.contentText, config.maxContentChars);
      if (!bodyText || bodyText.length < 15) {
        stats.parseFailed += 1;
        return;
      }

      const contentHash = computeContentHash(post.canonicalUrl, bodyText);
      const session = markSessionSeen(sessionSets, {
        externalId: post.externalId,
        canonicalUrl: post.canonicalUrl,
        contentHash,
      });

      if (session.duplicateInSession) {
        stats.duplicateInSession += 1;
        return;
      }

      uniqueNewRef.count += 1;
      stats.uniquePostsObserved += 1;

      // Always persist + score when the agent has a DB. Stateless mode only means
      // source/mission come from hydrated payload — it must not skip findings.
      const existingHit = await findExistingFacebookPostDetailed(ctx.source.id, {
        externalId: post.externalId,
        canonicalUrl: post.canonicalUrl,
        contentText: bodyText,
      });

      const treatAsPinned = shouldIgnoreForStopStreak({
        isPinned: post.isPinned,
        publishedAt: post.publishedAt,
        newestKnownPublishedAt:
          previousCheckpoint.newestPublishedAt ?? previousCheckpoint.newestKnownPublishedAt,
      });

      if (existingHit) {
        stats.knownFromDatabase += 1;
        streak = updateKnownStreak(streak, {
          isNew: false,
          isPinned: treatAsPinned,
          knownPostStopStreak: config.knownPostStopStreak,
        });
        if (streak.shouldStop) {
          stats.stoppedReason = 'known_post_streak';
        }
        return;
      }

      streak = updateKnownStreak(streak, {
        isNew: true,
        isPinned: false,
        knownPostStopStreak: config.knownPostStopStreak,
      });

      const saved = await saveFacebookScannedPost({
        companyId: ctx.source.companyId,
        sourceId: ctx.source.id,
        post: { ...post, contentText: bodyText },
        maxContentChars: config.maxContentChars,
      });

      if (!saved) {
        stats.parseFailed += 1;
        return;
      }

      if (saved.inserted) {
        stats.newPostsInserted += 1;
        if (String(post.rawData?.parser || '').includes('Graphql')) {
          stats.graphqlPostsInserted += 1;
        }
        if (post.externalId) newExternalIds.push(post.externalId);
        if (post.canonicalUrl) newCanonicalUrls.push(post.canonicalUrl);
        newContentHashes.push(saved.record.contentHash);
        newestPublishedAt = pickNewestPublishedAt(
          newestPublishedAt,
          post.publishedAt ?? saved.record.publishedAt?.toISOString() ?? null,
        );
      } else {
        stats.knownFromDatabase += 1;
        return;
      }

      const finding = await processContentAfterCollect({
        content: saved.record,
        source: ctx.source,
        mission: ctx.mission,
        job: ctx.job,
        title: post.title,
        analysisBudget,
      });

      if (finding.ignoredByRule) stats.ignoredByRule += 1;
      if (finding.analysisRan) stats.analyzed += 1;
      if (finding.findingCreated) stats.findingsCreated += 1;
      if (finding.notificationCreated) stats.notificationsCreated += 1;
      if (finding.outOfDomain) {
        stats.outOfDomainRejected = (stats.outOfDomainRejected || 0) + 1;
        stats.falsePositivePrevented = (stats.falsePositivePrevented || 0) + 1;
      }
      if (finding.filterStage === 'domain_needs_review') {
        stats.domainNeedsReview = (stats.domainNeedsReview || 0) + 1;
        stats.domainUnknown = (stats.domainUnknown || 0) + 1;
      }
      const domain = finding.domainClassification;
      if (domain === 'real_estate') stats.domainRealEstate = (stats.domainRealEstate || 0) + 1;
      else if (domain === 'vehicle') stats.domainVehicle = (stats.domainVehicle || 0) + 1;
      else if (domain === 'consumer_goods') {
        stats.domainConsumerGoods = (stats.domainConsumerGoods || 0) + 1;
      } else if (domain === 'employment') {
        stats.domainEmployment = (stats.domainEmployment || 0) + 1;
      } else if (domain === 'general_service' || domain === 'financial_service') {
        stats.domainService = (stats.domainService || 0) + 1;
      } else if (domain === 'unknown') {
        stats.domainUnknown = (stats.domainUnknown || 0) + 1;
      }
    };

    try {
      // ---- Job start sequence (item 10) ----
      await page.goto(groupUrl, {
        waitUntil: 'domcontentloaded',
        timeout: config.pageTimeoutMs,
      });
      await page.waitForTimeout(1500);
      await assertFacebookAccess(page, ctx);
      // Discussion / "Mới nhất" tabs chỉ có trên group — bỏ qua với feed cá nhân.
      if (isGroupSource) {
        await ensureFacebookDiscussionTab(page);
      }

      // The feed can be slow to hydrate (esp. back-to-back jobs on the reused
      // tab). Retry a few times before giving up so we don't spuriously fail.
      let startEnsure = await ensureFeed();
      for (let attempt = 0; attempt < 3 && !startEnsure.ok; attempt++) {
        if (isAuthBlockedState(startEnsure.state)) break;
        await page.waitForTimeout(2500);
        startEnsure = await ensureFeed();
      }
      if (!startEnsure.ok) {
        if (isAuthBlockedState(startEnsure.state)) await assertFacebookAccess(page, ctx);
        const code = startEnsure.errorCode ?? FACEBOOK_NAV_ERROR_CODES.FEED_NOT_RECOVERED;
        throw new Error(
          `${code}: không vào được Facebook feed khi bắt đầu job (state=${startEnsure.state}).`,
        );
      }

      if (isGroupSource) {
        feedTabSwitched = await switchFacebookFeedTab(page, config.feedTab);
      }

      const initialHydration = await waitForFacebookFeedPostsHydrated(page, {
        timeoutMs: Math.max(config.loadWaitMs, 10_000),
        minHydrated: 1,
      });
      Object.assign(stats, {
        feedHydrationWaitMs: initialHydration.waitedMs,
        feedLoadingArticles: initialHydration.loading,
        feedHydratedArticles: initialHydration.hydrated,
      });

      while (true) {
        if (!ctx.stateless) {
          await assertAgentSourceActiveForScan(ctx.source.id);
        }

        const stop = shouldStopScrolling({
          scrollsPerformed: stats.scrollsPerformed,
          maxScrolls: config.maxScrolls,
          startedAt: started,
          maxDurationSeconds: config.maxDurationSeconds,
          knownPostsStreak: streak.consecutiveKnown,
          knownPostStopStreak: config.knownPostStopStreak,
          consecutiveEmptyPasses: emptyPasses.consecutiveEmptyPasses,
          maxEmptyPasses: config.maxEmptyPasses,
        });
        if (stop) {
          stats.stoppedReason = stop;
          break;
        }
        if (stats.uniquePostsObserved >= config.maxPosts) {
          stats.stoppedReason = 'max_posts';
          break;
        }

        await assertFacebookAccess(page, ctx);

        // ---- Guard BEFORE pass: must be on group_feed with a feed root ----
        const prePass = await ensureFeed();
        if (!prePass.ok) {
          if (isAuthBlockedState(prePass.state)) await assertFacebookAccess(page, ctx);
          stats.stoppedReason = prePass.stopReason ?? 'navigation_state_unknown';
          scanErrorCode = prePass.errorCode ?? FACEBOOK_NAV_ERROR_CODES.NAVIGATION_STATE_UNKNOWN;
          break;
        }

        const feed = await locateFacebookGroupFeed(page);
        if (!feed.found) {
          stats.stoppedReason = 'feed_not_recovered';
          scanErrorCode = FACEBOOK_NAV_ERROR_CODES.FEED_NOT_RECOVERED;
          break;
        }

        const passHydration = await waitForFacebookFeedPostsHydrated(page, {
          timeoutMs: Math.max(config.loadWaitMs, 6_000),
          minHydrated: 1,
        });
        const prevHydrationMs = Number((stats as unknown as Record<string, unknown>).feedHydrationWaitMs) || 0;
        Object.assign(stats, {
          feedHydrationWaitMs: prevHydrationMs + passHydration.waitedMs,
          feedLoadingArticles: passHydration.loading,
          feedHydratedArticles: passHydration.hydrated,
        });

        // Expand main-post "See more" scoped to each feed post (never comments).
        stats.seeMoreClicks += await expandSeeMoreInFeedPosts(page, feed.locator, 8);

        const parsed = await parseVisibleFacebookPostsWithStats(page);
        if (parsed.noFeed) {
          stats.parseFailed += 1;
        } else {
          stats.articleNodesObserved += parsed.articleNodesObserved;
          stats.articlesObserved += parsed.articleNodesObserved;
          stats.postCandidates += parsed.postCandidates;
          stats.postsAccepted += parsed.postsAccepted;
          stats.commentsRejected += parsed.commentsRejected;
          stats.unknownArticlesRejected += parsed.unknownArticlesRejected;
          stats.parseFailed += parsed.parseFailed;
        }

        let uniqueNewInPass = 0;
        const uniqueNewRef = { count: 0 };

        if (!parsed.noFeed) {
          for (const post of parsed.posts) {
            await processOnePost(post, uniqueNewRef);
            if (stats.stoppedReason === 'known_post_streak' || stats.stoppedReason === 'max_posts') {
              break;
            }
          }
        }

        // DOM often stays on skeleton under CDP; GraphQL already has the story text.
        const gqlPosts = graphqlCapture.drain();
        stats.graphqlPostsCaptured += gqlPosts.length;
        if (gqlPosts.length) {
          console.log(
            `[facebook] GraphQL captured ${gqlPosts.length} post text(s) this pass ` +
              `(domAccepted=${parsed.postsAccepted} comments=${parsed.commentsRejected} ` +
              `articles=${parsed.articleNodesObserved})`,
          );
        }
        for (const captured of gqlPosts) {
          await processOnePost(graphqlCaptureToFacebookPost(captured), uniqueNewRef);
          if (stats.stoppedReason === 'known_post_streak' || stats.stoppedReason === 'max_posts') {
            break;
          }
        }
        uniqueNewInPass = uniqueNewRef.count;

        if (stats.stoppedReason === 'known_post_streak' || stats.stoppedReason === 'max_posts') {
          break;
        }

        emptyPasses = updateEmptyPassState(emptyPasses, {
          uniqueNewInPass,
          maxEmptyPasses: config.maxEmptyPasses,
        });
        stats.emptyPasses = emptyPasses.consecutiveEmptyPasses;
        if (emptyPasses.shouldStop) {
          stats.stoppedReason = 'consecutive_empty_passes';
          break;
        }

        if (stats.scrollsPerformed >= config.maxScrolls) {
          stats.stoppedReason = 'max_scrolls';
          break;
        }

        // ---- Guard AFTER parse, BEFORE scroll ----
        const preScroll = await ensureFeed();
        if (!preScroll.ok) {
          if (isAuthBlockedState(preScroll.state)) await assertFacebookAccess(page, ctx);
          stats.stoppedReason = preScroll.stopReason ?? 'navigation_state_unknown';
          scanErrorCode = preScroll.errorCode ?? FACEBOOK_NAV_ERROR_CODES.NAVIGATION_STATE_UNKNOWN;
          break;
        }
        const feedForScroll = await locateFacebookGroupFeed(page);
        if (!feedForScroll.found) {
          stats.stoppedReason = 'feed_not_recovered';
          scanErrorCode = FACEBOOK_NAV_ERROR_CODES.FEED_NOT_RECOVERED;
          break;
        }

        stats.feedScrollAttempts += 1;
        const scroll = await scrollFacebookGroupFeed({
          page,
          feed: feedForScroll.locator,
          sourceUrl: groupUrl,
          scrollAmount: 900,
          pauseMs: config.scrollPauseMs,
          loadWaitMs: config.loadWaitMs,
          recoverFeed: async () => {
            const r = await ensureFeed();
            return r.ok;
          },
        });
        stats.scrollsPerformed += 1;
        if (scroll.outcome === 'success') stats.feedScrollSuccess += 1;
        if (scroll.commentScrollDetected) stats.commentScrollsDetected += 1;
        if (scroll.outcome === 'wrong_target') {
          stats.wrongScrollTargetFailures += 1;
          stats.stoppedReason = 'wrong_scroll_target';
          scanErrorCode = FACEBOOK_NAV_ERROR_CODES.WRONG_SCROLL_TARGET;
          break;
        }

        // Extra settle time so GraphQL responses land before next parse.
        await page.waitForTimeout(Math.max(500, Math.floor(config.loadWaitMs / 2)));

        // ---- Guard AFTER scroll ----
        const postScroll = await ensureFeed();
        if (!postScroll.ok) {
          if (isAuthBlockedState(postScroll.state)) await assertFacebookAccess(page, ctx);
          stats.stoppedReason = postScroll.stopReason ?? 'navigation_state_unknown';
          scanErrorCode = postScroll.errorCode ?? FACEBOOK_NAV_ERROR_CODES.NAVIGATION_STATE_UNKNOWN;
          break;
        }
      }

      if (stats.stoppedReason === 'pending') {
        stats.stoppedReason = 'consecutive_empty_passes';
      }

      stats.durationMs = Date.now() - started;
      syncDeprecatedMetricAliases(stats);

      const nextCheckpoint = buildNextCheckpoint({
        previous: previousCheckpoint,
        groupUrl,
        newExternalIds,
        newCanonicalUrls,
        newContentHashes,
        newestPublishedAt,
        scanStats: stats,
      });

      const nextScanAt = new Date(Date.now() + ctx.source.scanIntervalMinutes * 60_000);
      if (ctx.stateless && ctx.evidence) {
        ctx.evidence.patchSource({
          sourceId: ctx.source.id,
          checkpoint: nextCheckpoint,
          lastError: scanErrorCode,
          nextScanAt,
          lastScannedAt: new Date(),
        });
      } else {
        await prisma.agentSource.update({
          where: { id: ctx.source.id },
          data: {
            lastScannedAt: new Date(),
            nextScanAt,
            lastError: scanErrorCode,
            checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
          },
        });
      }
      checkpointUpdated = true;

      if (!ctx.stateless && config.notifyOnScanComplete) {
        if (stats.findingsCreated > 0) {
          const hot = await notifyScanHotLeads({
            companyId: ctx.source.companyId,
            sourceId: ctx.source.id,
            sourceName: ctx.source.name,
            findings: stats.findingsCreated,
            postsNew: stats.newPostsInserted,
          });
          if (hot.created) stats.notificationsCreated += 1;
        }

        const summary = await notifyScanSummary({
          companyId: ctx.source.companyId,
          sourceId: ctx.source.id,
          sourceName: ctx.source.name,
          postsNew: stats.newPostsInserted,
          duplicates: stats.knownFromDatabase,
          findings: stats.findingsCreated,
          stoppedReason: String(stats.stoppedReason),
        });
        if (summary.created) stats.notificationsCreated += 1;
      }

      syncDeprecatedMetricAliases(stats);

      return {
        pagesVisited: 1,
        contentsSeen: stats.uniquePostsObserved,
        contentsInserted: stats.newPostsInserted,
        findingsCreated: stats.findingsCreated,
        durationMs: stats.durationMs,
        scrollsPerformed: stats.scrollsPerformed,
        postsParsed: stats.uniquePostsObserved,
        seeMoreClicks: stats.seeMoreClicks,
        knownPostsStreak: streak.consecutiveKnown,
        emptyPasses: emptyPasses.consecutiveEmptyPasses,
        stopReason: stats.stoppedReason,
        stoppedReason: stats.stoppedReason,
        feedTabSwitched,
        checkpointUpdated,
        ...buildScanReport(stats),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Facebook scan thất bại.';
      if (ctx.stateless && ctx.evidence) {
        ctx.evidence.patchSource({
          sourceId: ctx.source.id,
          lastError: message.slice(0, 500),
        });
      } else {
        await prisma.agentSource
          .update({
            where: { id: ctx.source.id },
            data: { lastError: message.slice(0, 500) },
          })
          .catch(() => undefined);
      }
      throw error;
    } finally {
      graphqlCapture.detach();
      const gqlStats = graphqlCapture.stats();
      console.log(
        `[facebook] GraphQL capture stats responses=${gqlStats.responsesSeen} ` +
          `texts=${gqlStats.textsSeen} kept=${gqlStats.postsKept} ` +
          `inserted=${stats.graphqlPostsInserted}`,
      );
      // Recover the reused scan tab to a clean state — close any leftover modal.
      // NEVER close the tab (worker reuses it) or the external Chrome.
      await closeFacebookModalIfOpen(page).catch(() => undefined);
    }
  }
}

function applyEnsureMetrics(stats: FacebookScanMetrics, res: EnsureGroupFeedResult): void {
  if (res.modalDetected) stats.modalsDetected += 1;
  if (res.modalClosed) stats.modalsClosed += 1;
  if (res.modalCloseFailed) stats.modalCloseFailures += 1;
  if (res.recovered) {
    stats.feedStateRecoveries += 1;
    stats.modalRecoveries += 1;
  }
  if (!res.ok && !isAuthBlockedState(res.state)) {
    stats.feedStateRecoveryFailures += 1;
  }
}

async function assertFacebookAccess(page: Page, ctx: ScanContext): Promise<void> {
  const auth = await detectFacebookAuthBlock(page);
  if (!auth.blocked) return;

  await captureFacebookDebugArtifact(page, `auth-${auth.kind}`);

  await handleFacebookAuthBlocked({
    workerId: getWorkerId(),
    companyId: ctx.source.companyId,
    sourceId: ctx.source.id,
    sourceName: ctx.source.name,
    kind: auth.kind,
    reason: auth.reason,
    errorCode: auth.errorCode,
  });
}

export { resolveFacebookScanConfig as parseFacebookConfig } from '../facebook/facebookScanConfig';

export const facebookGroupAdapter = new FacebookGroupAdapter();
