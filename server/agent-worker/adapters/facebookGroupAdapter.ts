import type { Page } from 'playwright';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import type { BrowserManager } from '../browserManager';
import { detectFacebookAuthBlock } from '../facebook/facebookCheckpointDetector';
import {
  expandSeeMoreInPosts,
  parseVisibleFacebookPosts,
} from '../facebook/facebookDomParser';
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
import {
  findExistingFacebookPost,
  saveFacebookScannedPost,
} from '../services/contentRepository';
import { processFindingForContent, resolveRuleSet } from '../services/findingRuleEngine';
import { getLeadAnalysisLimits } from '../../agent/leadAnalyzer';
import type { AnalysisBudget } from '../services/findingRuleEngine';
import type { ScanContext, ScanMetrics, SourceAdapter } from './sourceAdapter';

export interface FacebookGroupConfig {
  maxScrolls: number;
  maxPosts: number;
  maxDurationSeconds: number;
  stopAfterKnownPosts: number;
  feedTab: string;
  pageTimeoutMs: number;
  maxContentChars: number;
  scrollPauseMs: number;
}

const SUPPORTED_TYPE = 'facebook_group';

export class FacebookGroupAdapter implements SourceAdapter {
  readonly name = 'facebook_group';

  supports(sourceType: string): boolean {
    return sourceType === SUPPORTED_TYPE;
  }

  async scan(ctx: ScanContext): Promise<ScanMetrics> {
    const started = Date.now();
    const config = parseFacebookConfig(ctx.source.config);
    const rules = resolveRuleSet(ctx.source, ctx.mission);
    const groupUrl = normalizeGroupUrl(ctx.source.url);

    if (!isFacebookGroupUrl(groupUrl)) {
      throw new Error(`URL không phải Facebook group: ${groupUrl}`);
    }

    const page = await ctx.browser.getPage();
    const analysisBudget: AnalysisBudget = {
      used: 0,
      max: getLeadAnalysisLimits().maxPerJob,
    };

    let scrollsPerformed = 0;
    let postsParsed = 0;
    let contentsSeen = 0;
    let contentsInserted = 0;
    let findingsCreated = 0;
    let seeMoreClicks = 0;
    let knownPostsStreak = 0;
    let stoppedReason = 'completed';
    let feedTabSwitched = false;

    const seenKeys = new Set<string>();
    const checkpoint = (ctx.source.checkpoint || {}) as Record<string, unknown>;

    await page.goto(groupUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.pageTimeoutMs,
    });
    await page.waitForTimeout(2000);

    await assertFacebookAccess(page, ctx);

    feedTabSwitched = await switchFacebookFeedTab(page, config.feedTab);
    seeMoreClicks += await expandSeeMoreInPosts(page, 6);

    while (true) {
      const stop = shouldStopScrolling({
        scrollsPerformed,
        maxScrolls: config.maxScrolls,
        startedAt: started,
        maxDurationSeconds: config.maxDurationSeconds,
        knownPostsStreak,
        stopAfterKnownPosts: config.stopAfterKnownPosts,
      });
      if (stop) {
        stoppedReason = stop;
        break;
      }

      if (postsParsed >= config.maxPosts) {
        stoppedReason = 'max_posts';
        break;
      }

      await assertFacebookAccess(page, ctx);

      seeMoreClicks += await expandSeeMoreInPosts(page, 4);
      const posts = await parseVisibleFacebookPosts(page);

      let newInPass = 0;
      for (const post of posts) {
        if (postsParsed >= config.maxPosts) break;

        const dedupeKey = post.externalId || `${post.canonicalUrl}:${post.contentText.slice(0, 80)}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        postsParsed += 1;
        contentsSeen += 1;

        const existing = await findExistingFacebookPost(ctx.source.id, post);
        if (existing) {
          knownPostsStreak += 1;
          if (knownPostsStreak >= config.stopAfterKnownPosts) {
            stoppedReason = 'known_posts';
            break;
          }
          continue;
        }

        knownPostsStreak = 0;
        newInPass += 1;

        const saved = await saveFacebookScannedPost({
          companyId: ctx.source.companyId,
          sourceId: ctx.source.id,
          post,
          maxContentChars: config.maxContentChars,
        });

        if (saved?.inserted) contentsInserted += 1;

        if (saved) {
          const finding = await processFindingForContent({
            content: saved.record,
            source: ctx.source,
            mission: ctx.mission,
            rules,
            title: post.title,
            analysisBudget,
          });
          if (finding.findingCreated) findingsCreated += 1;
        }
      }

      if (stoppedReason === 'known_posts') break;

      if (newInPass === 0 && scrollsPerformed > 0) {
        stoppedReason = 'no_new_posts';
        break;
      }

      await scrollFacebookFeed(page, {
        maxScrolls: config.maxScrolls,
        scrollPauseMs: config.scrollPauseMs,
        maxDurationSeconds: config.maxDurationSeconds,
      }, started);
      scrollsPerformed += 1;
      await page.waitForTimeout(config.scrollPauseMs);
    }

    const durationMs = Date.now() - started;
    const nextScanAt = new Date(Date.now() + ctx.source.scanIntervalMinutes * 60_000);
    const lastPost = [...seenKeys].pop() ?? null;

    await prisma.agentSource.update({
      where: { id: ctx.source.id },
      data: {
        lastScannedAt: new Date(),
        nextScanAt,
        lastError: null,
        checkpoint: {
          ...checkpoint,
          lastScanAt: new Date().toISOString(),
          lastGroupUrl: groupUrl,
          scrollsPerformed,
          postsParsed,
          knownPostsStreak,
          stoppedReason,
          lastDedupeKey: lastPost,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      pagesVisited: 1,
      contentsSeen,
      contentsInserted,
      findingsCreated,
      durationMs,
      scrollsPerformed,
      postsParsed,
      seeMoreClicks,
      knownPostsStreak,
      stoppedReason,
      feedTabSwitched,
      checkpointUpdated: true,
    };
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
  });
}

export function parseFacebookConfig(raw: unknown): FacebookGroupConfig {
  const config = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    maxScrolls: clampInt(config.maxScrolls, 0, 40, 8),
    maxPosts: clampInt(config.maxPosts, 1, 200, 25),
    maxDurationSeconds: clampInt(config.maxDurationSeconds, 30, 600, 120),
    stopAfterKnownPosts: clampInt(config.stopAfterKnownPosts, 1, 20, 5),
    feedTab: String(config.feedTab || 'default').trim(),
    pageTimeoutMs: clampInt(config.pageTimeoutMs, 10_000, 120_000, 45_000),
    maxContentChars: clampInt(config.maxContentChars, 500, 50_000, 12_000),
    scrollPauseMs: clampInt(config.scrollPauseMs, 500, 5000, 1500),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

export const facebookGroupAdapter = new FacebookGroupAdapter();
