import type { Page } from 'playwright';
import { Prisma } from '@prisma/client';
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
  expandSeeMoreInPosts,
  parseVisibleFacebookPostsWithStats,
} from '../facebook/facebookDomParser';
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
import { isFacebookGroupUrl, normalizeGroupUrl } from '../facebook/facebookSelectors';
import {
  captureFacebookDebugArtifact,
  getWorkerId,
  handleFacebookAuthBlocked,
} from '../facebook/facebookSessionGuard';
import {
  scrollFacebookFeed,
  shouldStopScrolling,
  switchFacebookFeedTab,
} from '../facebook/facebookScrollController';
import { computeContentHash, normalizeText } from '../services/contentNormalizer';
import {
  findExistingFacebookPostDetailed,
  saveFacebookScannedPost,
} from '../services/contentRepository';
import {
  processFindingForContent,
  resolveRuleSet,
  type AnalysisBudget,
} from '../services/findingRuleEngine';
import type { ScanContext, ScanMetrics, SourceAdapter } from './sourceAdapter';

/** @deprecated use FacebookScanConfig from facebookScanConfig */
export type FacebookGroupConfig = FacebookScanConfig;

const SUPPORTED_TYPE = 'facebook_group';

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
    const rules = resolveRuleSet(ctx.source, ctx.mission);
    const groupUrl = normalizeGroupUrl(ctx.source.url);
    const previousCheckpoint = parseFacebookCheckpoint(ctx.source.checkpoint);

    if (!isFacebookGroupUrl(groupUrl)) {
      throw new Error(`URL không phải Facebook group: ${groupUrl}`);
    }

    const page = await ctx.browser.getPage({
      source: ctx.source,
      preferredDomain: 'facebook.com',
      initialUrl: groupUrl,
    });
    const analysisBudget: AnalysisBudget = {
      used: 0,
      max: getLeadAnalysisLimits().maxPerJob,
    };

    const stats: FacebookScanMetrics = emptyScanMetrics();
    let streak = emptyKnownStreakState();
    let emptyPasses = emptyEmptyPassState();
    let feedTabSwitched = false;
    let checkpointUpdated = false;

    const sessionSets = createSessionDedupeSets();
    const newExternalIds: string[] = [];
    const newCanonicalUrls: string[] = [];
    const newContentHashes: string[] = [];
    let newestPublishedAt: string | null =
      previousCheckpoint.newestPublishedAt ?? previousCheckpoint.newestKnownPublishedAt;

    try {
      if (!page.url().includes('/groups/')) {
        await page.goto(groupUrl, {
          waitUntil: 'domcontentloaded',
          timeout: config.pageTimeoutMs,
        });
        await page.waitForTimeout(2000);
      }

      await assertFacebookAccess(page, ctx);

      feedTabSwitched = await switchFacebookFeedTab(page, config.feedTab);
      stats.seeMoreClicks += await expandSeeMoreInPosts(page, 6);

      while (true) {
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

        stats.seeMoreClicks += await expandSeeMoreInPosts(page, 4);
        const parsed = await parseVisibleFacebookPostsWithStats(page);
        stats.articlesObserved += parsed.articleCount;
        stats.parseFailed += parsed.parseFailed;

        let uniqueNewInPass = 0;

        for (const post of parsed.posts) {
          if (stats.uniquePostsObserved >= config.maxPosts) {
            stats.stoppedReason = 'max_posts';
            break;
          }

          const bodyText = normalizeText(post.contentText, config.maxContentChars);
          if (!bodyText || bodyText.length < 15) {
            stats.parseFailed += 1;
            continue;
          }

          const contentHash = computeContentHash(post.canonicalUrl, bodyText);
          const session = markSessionSeen(sessionSets, {
            externalId: post.externalId,
            canonicalUrl: post.canonicalUrl,
            contentHash,
          });

          if (session.duplicateInSession) {
            stats.duplicateInSession += 1;
            continue;
          }

          uniqueNewInPass += 1;
          stats.uniquePostsObserved += 1;

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
              break;
            }
            continue;
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
            continue;
          }

          if (saved.inserted) {
            stats.newPostsInserted += 1;
            if (post.externalId) newExternalIds.push(post.externalId);
            if (post.canonicalUrl) newCanonicalUrls.push(post.canonicalUrl);
            newContentHashes.push(saved.record.contentHash);
            newestPublishedAt = pickNewestPublishedAt(
              newestPublishedAt,
              post.publishedAt ?? saved.record.publishedAt?.toISOString() ?? null,
            );
          } else {
            // Race / unique constraint — treat as known
            stats.knownFromDatabase += 1;
            continue;
          }

          const finding = await processFindingForContent({
            content: saved.record,
            source: ctx.source,
            mission: ctx.mission,
            rules,
            title: post.title,
            analysisBudget,
          });

          if (finding.ignoredByRule) stats.ignoredByRule += 1;
          if (finding.analysisRan) stats.analyzed += 1;
          if (finding.findingCreated) stats.findingsCreated += 1;
          if (finding.notificationCreated) stats.notificationsCreated += 1;
        }

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

        // Still room to scroll? If already at max scrolls, stop next loop via shouldStopScrolling.
        if (stats.scrollsPerformed >= config.maxScrolls) {
          stats.stoppedReason = 'max_scrolls';
          break;
        }

        await scrollFacebookFeed(
          page,
          {
            maxScrolls: config.maxScrolls,
            scrollPauseMs: config.scrollPauseMs,
            maxDurationSeconds: config.maxDurationSeconds,
            loadWaitMs: config.loadWaitMs,
          },
          started,
        );
        stats.scrollsPerformed += 1;
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
      await prisma.agentSource.update({
        where: { id: ctx.source.id },
        data: {
          lastScannedAt: new Date(),
          nextScanAt,
          lastError: null,
          checkpoint: nextCheckpoint as unknown as Prisma.InputJsonValue,
        },
      });
      checkpointUpdated = true;

      if (config.notifyOnScanComplete) {
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
      // Mid-scan failure: do NOT write a new checkpoint.
      const message = error instanceof Error ? error.message : 'Facebook scan thất bại.';
      await prisma.agentSource.update({
        where: { id: ctx.source.id },
        data: { lastError: message },
      }).catch(() => undefined);
      throw error;
    }
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
