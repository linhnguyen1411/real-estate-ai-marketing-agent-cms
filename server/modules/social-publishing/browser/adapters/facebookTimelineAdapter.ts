/**
 * Facebook Timeline browser destination — live DOM publisher.
 * Completes compose / multi-image upload / publish / verify / permalink /
 * evidence / retry. No Graph API. Reuses Browser Runtime via page factory.
 */

import fs from 'fs/promises';
import type { Locator, Page } from 'playwright';
import { detectFacebookAuthBlock } from '../../../../agent-worker/facebook/facebookCheckpointDetector';
import { buildEvidencePaths, hashDomContent } from '../../runtime/publishEvidenceService';
import { DESTINATION_CAPABILITY_PRESETS } from '../capabilities';
import type {
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
} from '../types';
import type { DestinationActionState } from '../actions/destinationActionHost';
import {
  type DestinationPageFactory,
  GenericBrowserDestinationAdapter,
} from './genericBrowserDestinationAdapter';
import {
  clickTimelinePublish,
  collectPermalinkCandidates,
  dismissTimelineDialogs,
  extractFacebookPermalink,
  findTimelineComposer,
  localMediaPaths,
  openTimelineComposer,
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
  typeIntoComposer,
  uploadTimelineMedia,
} from './facebookTimelineDom';

type TimelineJobMeta = {
  postId?: string;
  permalink?: string;
  composerOpened?: boolean;
  screenshotBeforeTaken?: boolean;
  screenshotAfterTaken?: boolean;
};

export class FacebookTimelineAdapter extends GenericBrowserDestinationAdapter {
  readonly key = 'facebook_timeline' as const;
  readonly capabilities = DESTINATION_CAPABILITY_PRESETS.facebook_timeline;
  readonly selectorMap = {
    composer:
      '[role="dialog"] [contenteditable="true"][role="textbox"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]',
    fileInput: 'input[type="file"]',
    publishButtonRoleName: /^(post|publish|đăng|share)$/i,
  };

  private readonly timelineMeta = new Map<string, TimelineJobMeta>();

  initialUrl(ctx: BrowserDestinationContext): string {
    const configured = ctx.destinationConfig?.profileUrl;
    if (typeof configured === 'string' && configured.trim()) return configured.trim();
    return 'https://www.facebook.com/';
  }

  private metaFor(ctx: BrowserDestinationContext): TimelineJobMeta {
    const existing = this.timelineMeta.get(ctx.publishJobId);
    if (existing) return existing;
    const created: TimelineJobMeta = {};
    this.timelineMeta.set(ctx.publishJobId, created);
    return created;
  }

  protected async ensureAuthenticatedImpl(
    page: Page,
    _ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const auth = await detectFacebookAuthBlock(page);
    if (auth.blocked) {
      throw new Error(auth.reason || 'facebook_auth_blocked');
    }
    return this.ok('ensureAuthenticated', { url: page.url() });
  }

  private async snapshotBefore(ctx: BrowserDestinationContext, page: Page): Promise<void> {
    const state = this.stateFor(ctx);
    const meta = this.metaFor(ctx);
    if (!state.screenshotBeforePath || meta.screenshotBeforeTaken) return;
    await fs.mkdir(state.evidenceDir || '.', { recursive: true }).catch(() => undefined);
    await page.screenshot({ path: state.screenshotBeforePath, fullPage: true }).catch(() => undefined);
    meta.screenshotBeforeTaken = true;
  }

  private async snapshotAfter(ctx: BrowserDestinationContext, page: Page): Promise<void> {
    const state = this.stateFor(ctx);
    const meta = this.metaFor(ctx);
    if (!state.screenshotAfterPath) return;
    await fs.mkdir(state.evidenceDir || '.', { recursive: true }).catch(() => undefined);
    await page.screenshot({ path: state.screenshotAfterPath, fullPage: true }).catch(() => undefined);
    meta.screenshotAfterTaken = true;
  }

  private async ensureComposerOpen(page: Page, ctx: BrowserDestinationContext): Promise<Locator> {
    const meta = this.metaFor(ctx);
    return this.withRetry(async () => {
      const composer = await openTimelineComposer(page);
      meta.composerOpened = true;
      return composer;
    }, 2, 700);
  }

  /**
   * Multi-image upload — opens composer first (workflow runs upload before fill).
   */
  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    const files = localMediaPaths(ctx.media);
    if (!page || ctx.dryRun) {
      return this.ok('uploadMedia', {
        mediaCount: files.length,
        dryRun: Boolean(ctx.dryRun || !page),
      });
    }

    await this.snapshotBefore(ctx, page);

    try {
      await this.ensureComposerOpen(page, ctx);
      if (files.length === 0) {
        return this.ok('uploadMedia', { mediaCount: 0 });
      }

      const result = await this.withRetry(
        () => uploadTimelineMedia(page, files),
        2,
        800,
      );
      return this.ok('uploadMedia', {
        mediaCount: result.uploaded,
        method: result.method,
        multiImage: files.length > 1,
      });
    } catch (error) {
      throw this.mapError(error, 'uploadMedia');
    }
  }

  async composeStrategy(
    page: Page,
    _composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    await this.snapshotBefore(ctx, page);

    const composer = await this.ensureComposerOpen(page, ctx);
    await this.withRetry(
      () => typeIntoComposer(page, composer, ctx.body, ctx.linkUrl),
      2,
      500,
    );

    // Confirm editor still present and non-empty when possible
    const active = (await findTimelineComposer(page)) || composer;
    const text = await active.innerText().catch(() => '');
    if (ctx.body.trim() && text.trim().length === 0) {
      // Retry type once more if fill didn't stick
      await typeIntoComposer(page, active, ctx.body, ctx.linkUrl);
    }

    return this.ok('compose', {
      bodyLength: ctx.body.length,
      hasLink: Boolean(ctx.linkUrl),
      composerReady: true,
    });
  }

  async publishStrategy(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const state = this.stateFor(ctx);
    const meta = this.metaFor(ctx);

    let timedOut = false;
    let clicked = false;
    try {
      clicked = await this.withRetry(async () => {
        const ok = await clickTimelinePublish(page);
        if (!ok) throw new Error('browser_publish_button_not_found');
        return true;
      }, 2, 600);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(msg)) timedOut = true;
      else throw error;
    }

    await this.wait(2_500);

    const signals = await collectPermalinkCandidates(page);
    let parsed = parsePublishSuccess({
      currentUrl: signals.currentUrl,
      bodyText: signals.bodyText,
    });

    if (!parsed.success) {
      const recovered = recoverAfterPublishClickTimeout({
        timedOut: timedOut || !clicked,
        currentUrl: signals.currentUrl,
        bodyText: signals.bodyText,
      });
      if (recovered.recovered && recovered.success) {
        parsed = { success: true, reason: recovered.reason };
      }
    }

    const permalinkInfo = extractFacebookPermalink(signals);
    if (permalinkInfo.permalink) {
      meta.permalink = permalinkInfo.permalink;
      state.publishedUrl = permalinkInfo.permalink;
    }
    if (permalinkInfo.postId) {
      meta.postId = permalinkInfo.postId;
    }

    if (!parsed.success && !permalinkInfo.permalink) {
      throw new Error(`browser_publish_failed:${parsed.reason}`);
    }

    if (!state.publishedUrl) {
      state.publishedUrl = permalinkInfo.permalink || signals.currentUrl;
    }

    await this.snapshotAfter(ctx, page);

    return this.ok('publish', {
      clicked,
      publishedUrl: state.publishedUrl,
      postId: meta.postId ?? null,
      reason: parsed.reason,
      permalinkResolved: Boolean(permalinkInfo.permalink),
    });
  }

  async verifyStrategy(
    page: Page | null,
    ctx: BrowserDestinationContext,
    state: DestinationActionState,
  ): Promise<BrowserDestinationPhaseResult> {
    const meta = this.metaFor(ctx);

    if (ctx.dryRun || !page) {
      return this.ok('verify', {
        dryRun: true,
        publishedUrl: state.publishedUrl ?? null,
        postId: meta.postId ?? null,
      });
    }

    const signals = await collectPermalinkCandidates(page);
    const parsed = parsePublishSuccess({
      currentUrl: signals.currentUrl,
      bodyText: signals.bodyText,
    });
    const permalinkInfo = extractFacebookPermalink({
      ...signals,
      currentUrl: state.publishedUrl || signals.currentUrl,
    });

    if (permalinkInfo.permalink) {
      meta.permalink = permalinkInfo.permalink;
      state.publishedUrl = permalinkInfo.permalink;
    }
    if (permalinkInfo.postId) {
      meta.postId = permalinkInfo.postId;
    }

    const verified = parsed.success || Boolean(meta.permalink) || Boolean(state.publishedUrl);
    if (!verified) {
      throw new Error(`browser_verify_failed:${parsed.reason}`);
    }

    await this.snapshotAfter(ctx, page);

    return this.ok('verify', {
      publishedUrl: state.publishedUrl ?? meta.permalink ?? null,
      postId: meta.postId ?? null,
      reason: parsed.reason,
      verified: true,
    });
  }

  /** Host + adapter entry — used by PublishAction and workflow steps. */
  async captureBrowserEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    const page = await this.ensurePage(ctx);
    const state = this.stateFor(ctx);
    const meta = this.metaFor(ctx);

    if (!state.evidenceDir) {
      const attemptId = `wf_${ctx.missionRunId}_browser_capture_evidence`;
      const paths = buildEvidencePaths(ctx.publishJobId, attemptId);
      state.evidenceDir = paths.baseDir;
      state.screenshotBeforePath = paths.screenshotBeforePath;
      state.screenshotAfterPath = paths.screenshotAfterPath;
      state.htmlSnapshotPath = paths.htmlSnapshotPath;
    }

    if (page) {
      if (!meta.screenshotBeforeTaken) await this.snapshotBefore(ctx, page);
      if (!meta.screenshotAfterTaken) await this.snapshotAfter(ctx, page);

      if (state.htmlSnapshotPath) {
        await fs.mkdir(state.evidenceDir, { recursive: true }).catch(() => undefined);
        const html = await page.content().catch(() => '');
        if (html) {
          state.domHash = hashDomContent(html);
          await fs.writeFile(state.htmlSnapshotPath, html, 'utf8').catch(() => undefined);

          if (!meta.permalink) {
            const found = extractFacebookPermalink({
              currentUrl: page.url(),
              html,
            });
            if (found.permalink) {
              meta.permalink = found.permalink;
              state.publishedUrl = found.permalink;
            }
            if (found.postId) meta.postId = found.postId;
          }
        }
      }

      state.publishedUrl = meta.permalink || state.publishedUrl || page.url();
    }

    return {
      publishedUrl: state.publishedUrl,
      postId: meta.postId,
      domHash: state.domHash,
      screenshotBeforePath: state.screenshotBeforePath,
      screenshotAfterPath: state.screenshotAfterPath,
      htmlSnapshotPath: state.htmlSnapshotPath,
      durationMs: Math.max(0, Date.now() - state.startedAt),
    };
  }

  async captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    return this.captureBrowserEvidence(ctx);
  }

  async cleanup(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (page && !ctx.dryRun) {
      await dismissTimelineDialogs(page).catch(() => undefined);
    }
    this.timelineMeta.delete(ctx.publishJobId);
    return super.cleanup(ctx);
  }
}

export const facebookTimelineAdapter = new FacebookTimelineAdapter();

export function configureFacebookTimelineAdapterRuntime(deps: {
  pageFactory?: DestinationPageFactory;
}): void {
  facebookTimelineAdapter.configureRuntime(deps.pageFactory);
}

/** Test helpers */
export {
  extractFacebookPermalink,
  extractPostIdFromUrl,
  localMediaPaths,
} from './facebookTimelineDom';
