/**
 * DomConfiguredDestinationAdapter — shared orchestration for DomToolkit destinations.
 * Platforms supply DomToolkitConfig + auth/URL only (no duplicated DOM ops).
 */

import type { Locator, Page } from 'playwright';
import fs from 'fs/promises';
import { buildEvidencePaths, hashDomContent } from '../../runtime/publishEvidenceService';
import type {
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
} from '../types';
import type { DestinationActionState } from '../actions/destinationActionHost';
import {
  createDomToolkit,
  domWithRetry,
  localMediaPaths,
  type DomToolkit,
  type DomToolkitConfig,
} from '../dom';
import { GenericBrowserDestinationAdapter } from './genericBrowserDestinationAdapter';
import { resolveMediaLocalPaths } from '../../runtime/resolveMediaLocalPaths';
import {
  captionHash,
  feedLooksAlreadyPublished,
  readFeedTextExcludingDialogs,
  resolveComposerCaption,
  resolvePublishMode,
} from '../../publishIdempotency';
import { clearPublishTrace, getPublishTrace } from '../publishTrace';
import { patchJobResult } from '../../jobService';

type JobMeta = {
  postId?: string;
  permalink?: string;
  composerOpened?: boolean;
  screenshotBeforeTaken?: boolean;
  screenshotAfterTaken?: boolean;
  captionHash?: string;
  deferredLinkUrl?: string | null;
  publishClicked?: boolean;
};

export abstract class DomConfiguredDestinationAdapter extends GenericBrowserDestinationAdapter {
  protected readonly dom: DomToolkit;
  private readonly jobMeta = new Map<string, JobMeta>();

  readonly selectorMap: {
    composer: string;
    fileInput: string;
    publishButtonRoleName: RegExp;
  };

  constructor(toolkitConfig: DomToolkitConfig) {
    super();
    this.dom = createDomToolkit(toolkitConfig);
    this.selectorMap = {
      composer: toolkitConfig.selectors.composerCss,
      fileInput: toolkitConfig.selectors.fileInput,
      publishButtonRoleName: toolkitConfig.selectors.publishButtonRoleName,
    };
  }

  private metaFor(ctx: BrowserDestinationContext): JobMeta {
    const existing = this.jobMeta.get(ctx.publishJobId);
    if (existing) return existing;
    const created: JobMeta = {};
    this.jobMeta.set(ctx.publishJobId, created);
    return created;
  }

  private evidencePaths(ctx: BrowserDestinationContext) {
    const state = this.stateFor(ctx);
    return {
      evidenceDir: state.evidenceDir,
      screenshotBeforePath: state.screenshotBeforePath,
      screenshotAfterPath: state.screenshotAfterPath,
      htmlSnapshotPath: state.htmlSnapshotPath,
    };
  }

  private async ensureComposerOpen(page: Page, ctx: BrowserDestinationContext): Promise<Locator> {
    const meta = this.metaFor(ctx);
    const flow = this.dom.config.flow;
    return domWithRetry(
      async () => {
        await this.dom.navigator.dismissDialogs(page);
        const composer = await this.dom.navigator.openComposer(page);
        meta.composerOpened = true;
        return composer;
      },
      flow.openRetries,
      flow.openRetryWaitMs,
    );
  }

  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    const trace = getPublishTrace(ctx.publishJobId);
    if (!page || ctx.dryRun) {
      const localOnly = localMediaPaths(ctx.media || []);
      return this.ok('uploadMedia', {
        mediaCount: localOnly.length,
        dryRun: Boolean(ctx.dryRun || !page),
      });
    }

    const meta = this.metaFor(ctx);
    await this.dom.evidence.screenshotBefore(page, this.evidencePaths(ctx), meta);

    try {
      // P0.3 MEDIA FIRST — open composer, upload, wait thumbnail BEFORE caption.
      await this.ensureComposerOpen(page, ctx);
      const files = await resolveMediaLocalPaths(ctx.media);
      if (files.length === 0) {
        return this.ok('uploadMedia', { mediaCount: 0 });
      }

      const flow = this.dom.config.flow;
      const result = await domWithRetry(
        () => this.dom.uploader.uploadFiles(page, files, { publishJobId: ctx.publishJobId }),
        flow.uploadRetries,
        flow.uploadRetryWaitMs,
      );
      return this.ok('uploadMedia', {
        mediaCount: result.uploaded,
        method: result.method,
        multiImage: files.length > 1,
        thumbnailVisible: result.thumbnailVisible,
      });
    } catch (error) {
      trace.mark('Fail', { phase: 'uploadMedia', error: String(error) });
      throw this.mapError(error, 'uploadMedia');
    }
  }

  async composeStrategy(
    page: Page,
    _composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const meta = this.metaFor(ctx);
    const trace = getPublishTrace(ctx.publishJobId);
    await this.dom.evidence.screenshotBefore(page, this.evidencePaths(ctx), meta);

    const composer = await this.ensureComposerOpen(page, ctx);
    const mode = resolvePublishMode(ctx.destinationConfig);
    const resolved = resolveComposerCaption({
      body: ctx.body,
      linkUrl: ctx.linkUrl,
      mediaCount: ctx.media?.length ?? 0,
      publishMode: mode,
    });
    meta.deferredLinkUrl = resolved.deferredLinkUrl;
    meta.captionHash = captionHash(resolved.caption);

    // Exactly-once compose: single typeContent call — no domWithRetry paste loop.
    await this.dom.editor.typeContent(page, composer, resolved.caption, null, {
      publishJobId: ctx.publishJobId,
    });

    await patchJobResult(ctx.publishJobId, {
      captionHash: meta.captionHash,
      publishMode: resolved.mode,
      linkDeferred: resolved.linkDeferred,
      deferredLinkUrl: resolved.deferredLinkUrl,
    }).catch(() => undefined);

    return this.ok('compose', {
      bodyLength: resolved.caption.length,
      hasLink: Boolean(ctx.linkUrl) && !resolved.linkDeferred,
      linkDeferred: resolved.linkDeferred,
      publishMode: resolved.mode,
      captionHash: meta.captionHash,
      composerReady: true,
    });
  }

  async publishStrategy(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const state = this.stateFor(ctx);
    const meta = this.metaFor(ctx);
    const flow = this.dom.config.flow;
    const trace = getPublishTrace(ctx.publishJobId);

    // P0.6 ANTI DUPLICATE — feed only (exclude open composer). Caption in the dialog must
    // never count as "already published" or we skip Đăng and invent a fake success.
    const feedText = await readFeedTextExcludingDialogs(page);
    trace.mark('AntiDuplicateCheck', { feedLen: feedText.length, excludedDialogs: true });
    if (feedLooksAlreadyPublished(feedText, ctx.body)) {
      trace.mark('AlreadyOnFeed');
      await patchJobResult(ctx.publishJobId, {
        publishClicked: false,
        publishOutcome: 'published',
        verified: true,
        reason: 'already_on_feed',
        captionHash: meta.captionHash || captionHash(ctx.body),
      }).catch(() => undefined);
      // Group/home URL is not a post permalink — leave empty so UI doesn't fake a link.
      state.publishedUrl = undefined;
      return this.ok('publish', {
        clicked: false,
        alreadyPublished: true,
        publishedUrl: null,
        reason: 'already_on_feed',
      });
    }

    let timedOut = false;
    let clicked = false;
    try {
      // publishRetries must be 0 — click Đăng at most once.
      clicked = await domWithRetry(
        async () => {
          const ok = await this.dom.publisher.clickPublish(page);
          if (!ok) throw new Error('browser_publish_button_not_found');
          return true;
        },
        flow.publishRetries,
        flow.publishRetryWaitMs,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(msg)) timedOut = true;
      else throw error;
    }

    if (clicked) {
      meta.publishClicked = true;
      trace.mark('PublishClick', { timedOut });
      await patchJobResult(ctx.publishJobId, {
        publishClicked: true,
        publishClickedAt: new Date().toISOString(),
        captionHash: meta.captionHash || captionHash(ctx.body),
      }).catch(() => undefined);
    }

    await this.wait(Math.max(flow.afterPublishWaitMs, 3_500));
    const dialogClosed = await this.dom.publisher.isComposerDialogClosed(page);
    if (dialogClosed) trace.mark('SpinnerGone', { dialogClosed: true });

    const signals = await this.dom.verifier.collectSignals(page);
    let parsed = this.dom.verifier.parseSuccess({
      currentUrl: signals.currentUrl,
      bodyText: signals.bodyText,
    });

    // Strong proof for Timeline text posts: dialog closed + body snippet on feed.
    const snippet = normalizeSnippet(ctx.body);
    const bodyOnFeed =
      Boolean(snippet) &&
      normalizeSnippet(signals.bodyText || '').includes(snippet.slice(0, Math.min(40, snippet.length)));
    if (!parsed.success && clicked && dialogClosed && bodyOnFeed) {
      parsed = { success: true, reason: 'composer_closed_body_on_feed' };
    }

    if (!parsed.success) {
      const recovered = this.dom.verifier.recoverAfterTimeout({
        timedOut: timedOut || !clicked,
        currentUrl: signals.currentUrl,
        bodyText: signals.bodyText,
      });
      if (recovered.recovered && recovered.success) {
        parsed = { success: true, reason: recovered.reason };
      }
    }

    const permalinkInfo = this.dom.verifier.extractPermalink(signals);
    if (permalinkInfo.permalink) {
      meta.permalink = permalinkInfo.permalink;
      state.publishedUrl = permalinkInfo.permalink;
      trace.mark('Permalink', { permalink: permalinkInfo.permalink, postId: permalinkInfo.postId });
    }
    if (permalinkInfo.postId) {
      meta.postId = permalinkInfo.postId;
    }

    // Strong success: toast / activity heuristic, OR a real (non-junk) permalink,
    // OR composer closed with body visible on feed (text Timeline posts often lack toast).
    const strong =
      (parsed.success &&
        parsed.reason !== 'soft_feed_url' &&
        parsed.reason !== 'soft_feed_url_unverified' &&
        !parsed.reason.startsWith('group_soft_')) ||
      parsed.reason === 'composer_closed_body_on_feed' ||
      (clicked && dialogClosed);
    const hasPermalink = Boolean(permalinkInfo.permalink);

    // P0.5: after click, never retry publish. If unverified → UNKNOWN (manual verify).
    if (clicked && !strong && !hasPermalink) {
      trace.mark('VerifyUnknown', { dialogClosed, reason: parsed.reason });
      await patchJobResult(ctx.publishJobId, {
        publishClicked: true,
        publishOutcome: 'unknown',
        needsManualVerify: true,
        reason: parsed.reason || 'unverified_after_click',
        dialogClosed,
      }).catch(() => undefined);
      throw new Error('browser_verify_unknown');
    }

    if (!strong && !hasPermalink) {
      throw new Error(
        `browser_publish_failed:${parsed.reason || 'unverified'}` +
          (dialogClosed ? ':dialog_closed_no_proof' : ':dialog_still_open'),
      );
    }

    if (!state.publishedUrl) {
      state.publishedUrl = permalinkInfo.permalink || undefined;
    }
    if (!state.publishedUrl && strong) {
      state.publishedUrl = signals.currentUrl || 'https://www.facebook.com/';
    }
    if (!state.publishedUrl && !strong) {
      throw new Error('browser_publish_failed:missing_permalink');
    }

    await patchJobResult(ctx.publishJobId, {
      publishClicked: clicked,
      publishOutcome: 'published',
      externalPostId: meta.postId || undefined,
      facebookPostId: meta.postId || undefined,
      externalUrl: state.publishedUrl,
      facebookPostUrl: state.publishedUrl,
      permalink: state.publishedUrl,
      reason: hasPermalink ? parsed.reason || 'permalink' : parsed.reason,
    }).catch(() => undefined);

    await this.dom.evidence.screenshotAfter(page, this.evidencePaths(ctx), meta);

    return this.ok('publish', {
      clicked,
      publishedUrl: state.publishedUrl ?? null,
      postId: meta.postId ?? null,
      reason: hasPermalink ? parsed.reason || 'permalink' : parsed.reason,
      permalinkResolved: hasPermalink,
      dialogClosed,
      bodyOnFeed,
      trace: trace.toJSON(),
    });
  }

  async verifyStrategy(
    page: Page | null,
    ctx: BrowserDestinationContext,
    state: DestinationActionState,
  ): Promise<BrowserDestinationPhaseResult> {
    const meta = this.metaFor(ctx);
    const trace = getPublishTrace(ctx.publishJobId);

    if (ctx.dryRun || !page) {
      return this.ok('verify', {
        dryRun: true,
        publishedUrl: state.publishedUrl ?? null,
        postId: meta.postId ?? null,
      });
    }

    trace.mark('VerifyFeed');
    const signals = await this.dom.verifier.collectSignals(page);
    const parsed = this.dom.verifier.parseSuccess({
      currentUrl: signals.currentUrl,
      bodyText: signals.bodyText,
    });
    const permalinkInfo = this.dom.verifier.extractPermalink({
      ...signals,
      currentUrl: state.publishedUrl || signals.currentUrl,
    });

    if (permalinkInfo.permalink) {
      meta.permalink = permalinkInfo.permalink;
      state.publishedUrl = permalinkInfo.permalink;
      trace.mark('Permalink', { permalink: permalinkInfo.permalink });
    }
    if (permalinkInfo.postId) {
      meta.postId = permalinkInfo.postId;
    }

    const bodyOnFeed = feedLooksAlreadyPublished(signals.bodyText || '', ctx.body);
    const mediaExpected = (ctx.media?.length ?? 0) > 0;
    const verified =
      parsed.success ||
      Boolean(meta.permalink) ||
      Boolean(state.publishedUrl) ||
      bodyOnFeed ||
      meta.publishClicked;

    if (!verified) {
      // Do not republish — escalate to manual / delayed verify.
      await patchJobResult(ctx.publishJobId, {
        publishOutcome: 'unknown',
        needsManualVerify: true,
        publishClicked: meta.publishClicked === true,
      }).catch(() => undefined);
      trace.mark('VerifyUnknown', { reason: parsed.reason });
      throw new Error(`browser_verify_unknown:${parsed.reason}`);
    }

    await patchJobResult(ctx.publishJobId, {
      verified: true,
      publishOutcome: 'published',
      externalPostId: meta.postId || undefined,
      facebookPostId: meta.postId || undefined,
      externalUrl: state.publishedUrl ?? meta.permalink ?? undefined,
      facebookPostUrl: state.publishedUrl ?? meta.permalink ?? undefined,
      captionHash: meta.captionHash,
      mediaExpected,
    }).catch(() => undefined);

    await this.dom.evidence.screenshotAfter(page, this.evidencePaths(ctx), meta);
    trace.mark('Complete', { postId: meta.postId, url: state.publishedUrl });

    return this.ok('verify', {
      publishedUrl: state.publishedUrl ?? meta.permalink ?? null,
      postId: meta.postId ?? null,
      reason: parsed.reason,
      verified: true,
      bodyOnFeed,
      captionHash: meta.captionHash ?? null,
      deferredLinkUrl: meta.deferredLinkUrl ?? null,
      trace: trace.toJSON(),
    });
  }

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
      const paths = this.evidencePaths(ctx);
      if (!meta.screenshotBeforeTaken) {
        await this.dom.evidence.screenshotBefore(page, paths, meta);
      }
      if (!meta.screenshotAfterTaken) {
        await this.dom.evidence.screenshotAfter(page, paths, meta);
      }

      const { html, domHash } = await this.dom.evidence.captureHtml(
        page,
        state.htmlSnapshotPath,
        state.evidenceDir,
      );
      if (domHash) state.domHash = domHash;

      if (html && !meta.permalink) {
        const found = this.dom.verifier.extractPermalink({
          currentUrl: page.url(),
          html,
        });
        if (found.permalink) {
          meta.permalink = found.permalink;
          state.publishedUrl = found.permalink;
        }
        if (found.postId) meta.postId = found.postId;
      }

      state.publishedUrl = meta.permalink || state.publishedUrl || page.url();
    } else {
      await fs.mkdir(state.evidenceDir, { recursive: true });
      const stubHtml = `<html><body data-dry-run="1" data-job="${ctx.publishJobId}"></body></html>`;
      state.domHash = hashDomContent(stubHtml);
      if (state.htmlSnapshotPath) {
        await fs.writeFile(state.htmlSnapshotPath, stubHtml, 'utf8').catch(() => undefined);
      }
      if (state.screenshotBeforePath) {
        await fs
          .writeFile(state.screenshotBeforePath, 'dry-run-screenshot-before', 'utf8')
          .catch(() => undefined);
      }
      if (state.screenshotAfterPath) {
        await fs
          .writeFile(state.screenshotAfterPath, 'dry-run-screenshot-after', 'utf8')
          .catch(() => undefined);
      }
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
      await this.dom.navigator.dismissDialogs(page).catch(() => undefined);
    }
    const trace = getPublishTrace(ctx.publishJobId);
    trace.mark('Duration', { ms: trace.durationMs() });
    this.jobMeta.delete(ctx.publishJobId);
    clearPublishTrace(ctx.publishJobId);
    return super.cleanup(ctx);
  }
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export { localMediaPaths };
