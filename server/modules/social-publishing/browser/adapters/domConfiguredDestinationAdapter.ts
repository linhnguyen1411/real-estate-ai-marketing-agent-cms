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

type JobMeta = {
  postId?: string;
  permalink?: string;
  composerOpened?: boolean;
  screenshotBeforeTaken?: boolean;
  screenshotAfterTaken?: boolean;
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
    const files = localMediaPaths(ctx.media);
    if (!page || ctx.dryRun) {
      return this.ok('uploadMedia', {
        mediaCount: files.length,
        dryRun: Boolean(ctx.dryRun || !page),
      });
    }

    const meta = this.metaFor(ctx);
    await this.dom.evidence.screenshotBefore(page, this.evidencePaths(ctx), meta);

    try {
      await this.ensureComposerOpen(page, ctx);
      if (files.length === 0) {
        return this.ok('uploadMedia', { mediaCount: 0 });
      }

      const flow = this.dom.config.flow;
      const result = await domWithRetry(
        () => this.dom.uploader.uploadFiles(page, files),
        flow.uploadRetries,
        flow.uploadRetryWaitMs,
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
    const meta = this.metaFor(ctx);
    await this.dom.evidence.screenshotBefore(page, this.evidencePaths(ctx), meta);

    const composer = await this.ensureComposerOpen(page, ctx);
    const flow = this.dom.config.flow;
    await domWithRetry(
      () => this.dom.editor.typeContent(page, composer, ctx.body, ctx.linkUrl),
      flow.composeRetries,
      flow.composeRetryWaitMs,
    );

    const active = (await this.dom.navigator.findComposer(page)) || composer;
    const text = await active.innerText().catch(() => '');
    if (ctx.body.trim() && text.trim().length === 0) {
      await this.dom.editor.typeContent(page, active, ctx.body, ctx.linkUrl);
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
    const flow = this.dom.config.flow;

    let timedOut = false;
    let clicked = false;
    try {
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

    await this.wait(flow.afterPublishWaitMs);

    const signals = await this.dom.verifier.collectSignals(page);
    let parsed = this.dom.verifier.parseSuccess({
      currentUrl: signals.currentUrl,
      bodyText: signals.bodyText,
    });

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

    await this.dom.evidence.screenshotAfter(page, this.evidencePaths(ctx), meta);

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
    }
    if (permalinkInfo.postId) {
      meta.postId = permalinkInfo.postId;
    }

    const verified = parsed.success || Boolean(meta.permalink) || Boolean(state.publishedUrl);
    if (!verified) {
      throw new Error(`browser_verify_failed:${parsed.reason}`);
    }

    await this.dom.evidence.screenshotAfter(page, this.evidencePaths(ctx), meta);

    return this.ok('verify', {
      publishedUrl: state.publishedUrl ?? meta.permalink ?? null,
      postId: meta.postId ?? null,
      reason: parsed.reason,
      verified: true,
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
    this.jobMeta.delete(ctx.publishJobId);
    return super.cleanup(ctx);
  }
}

export { localMediaPaths };
