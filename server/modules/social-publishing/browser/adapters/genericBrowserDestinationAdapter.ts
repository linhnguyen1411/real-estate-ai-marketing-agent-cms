/**
 * Generic destination runtime — selectors, navigation, browser utilities, evidence.
 * Publish-specific orchestration lives in PublishAction (Action Framework).
 */

import fs from 'fs/promises';
import type { Locator, Page } from 'playwright';
import type {
  BrowserDestinationAdapter,
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
  DestinationCapabilities,
  DestinationKey,
} from '../types';
import { buildEvidencePaths, hashDomContent } from '../../runtime/publishEvidenceService';
import {
  type DestinationActionHost,
  type DestinationActionState,
  type SelectorMap,
} from '../actions/destinationActionHost';
import { PublishAction } from '../actions/publishAction';
import { registerAutomationAction } from '../actions/actionRegistry';

export type { SelectorMap } from '../actions/destinationActionHost';

export interface DestinationPageFactory {
  getPublishPage(options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }): Promise<Page>;
  beginCdpJob?(): Promise<void>;
  releaseCdpLock?(): void;
}

export abstract class GenericBrowserDestinationAdapter
  implements BrowserDestinationAdapter, DestinationActionHost
{
  abstract readonly key: DestinationKey;
  abstract readonly capabilities: DestinationCapabilities;
  abstract readonly selectorMap: SelectorMap;

  abstract initialUrl(ctx: BrowserDestinationContext): string;
  protected abstract ensureAuthenticatedImpl(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  abstract composeStrategy(
    page: Page,
    composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  abstract publishStrategy(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  abstract verifyStrategy(
    page: Page | null,
    ctx: BrowserDestinationContext,
    state: DestinationActionState,
  ): Promise<BrowserDestinationPhaseResult>;

  private readonly stateByJob = new Map<string, DestinationActionState>();
  private runtimeFactory?: DestinationPageFactory;
  private readonly publishAction = new PublishAction(this);

  constructor() {
    registerAutomationAction(this.publishAction, true);
  }

  configureRuntime(factory?: DestinationPageFactory): void {
    this.runtimeFactory = factory;
  }

  /** Bound PublishAction for this destination (Action Framework entry). */
  getPublishAction(): PublishAction {
    return this.publishAction;
  }

  mapError(error: unknown, phase: string): Error {
    return this.mapAdapterError(error, phase);
  }

  protected mapAdapterError(error: unknown, phase: string): Error {
    const msg = error instanceof Error ? error.message : String(error);
    return new Error(`[${this.key}:${phase}] ${msg}`);
  }

  protected async withRetry<T>(fn: () => Promise<T>, retries = 1, waitMs = 300): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i < retries) await this.wait(waitMs);
      }
    }
    throw lastErr;
  }

  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  stateFor(ctx: BrowserDestinationContext): DestinationActionState {
    const existing = this.stateByJob.get(ctx.publishJobId);
    if (existing) return existing;
    const created: DestinationActionState = { startedAt: Date.now() };
    this.stateByJob.set(ctx.publishJobId, created);
    return created;
  }

  async ensurePage(ctx: BrowserDestinationContext): Promise<Page | null> {
    const state = this.stateFor(ctx);
    if (state.page && !state.page.isClosed()) return state.page;
    const factory = this.runtimeFactory;
    if (!factory) return null;
    await factory.beginCdpJob?.();
    const page = await factory.getPublishPage({ initialUrl: this.initialUrl(ctx), mode: 'cdp' });
    state.page = page;
    return page;
  }

  ok(phase: string, data?: Record<string, unknown>): BrowserDestinationPhaseResult {
    return { ok: true, phase, data };
  }

  async prepareHost(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const state = this.stateFor(ctx);
    const attemptId = `wf_${ctx.missionRunId}_browser_capture_evidence`;
    const paths = buildEvidencePaths(ctx.publishJobId, attemptId);
    state.evidenceDir = paths.baseDir;
    state.screenshotBeforePath = paths.screenshotBeforePath;
    state.screenshotAfterPath = paths.screenshotAfterPath;
    state.htmlSnapshotPath = paths.htmlSnapshotPath;
    state.startedAt = Date.now();
    return this.ok('prepare', { dryRun: ctx.dryRun, evidenceDir: paths.baseDir });
  }

  async cleanupHost(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    this.runtimeFactory?.releaseCdpLock?.();
    this.stateByJob.delete(ctx.publishJobId);
    return this.ok('cleanup', { released: true });
  }

  async navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page) return this.ok('navigate', { mode: 'dry_run_no_browser' });
    await this.withRetry(
      () =>
        page
          .goto(this.initialUrl(ctx), { waitUntil: 'domcontentloaded', timeout: 60_000 })
          .then(() => undefined),
      1,
      500,
    ).catch(() => undefined);
    return this.ok('navigate', { url: page.url() });
  }

  async ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page) return this.ok('ensureAuthenticated', { mode: 'dry_run_no_browser' });
    return this.ensureAuthenticatedImpl(page, ctx);
  }

  /** DestinationActionHost: browser evidence utility */
  async captureBrowserEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    const page = await this.ensurePage(ctx);
    const state = this.stateFor(ctx);
    if (!state.evidenceDir) {
      const attemptId = `wf_${ctx.missionRunId}_browser_capture_evidence`;
      const paths = buildEvidencePaths(ctx.publishJobId, attemptId);
      state.evidenceDir = paths.baseDir;
      state.screenshotBeforePath = paths.screenshotBeforePath;
      state.screenshotAfterPath = paths.screenshotAfterPath;
      state.htmlSnapshotPath = paths.htmlSnapshotPath;
    }
    await fs.mkdir(state.evidenceDir, { recursive: true });

    if (page) {
      if (state.screenshotBeforePath) {
        await page.screenshot({ path: state.screenshotBeforePath, fullPage: true }).catch(() => undefined);
      }
      if (state.screenshotAfterPath) {
        await page.screenshot({ path: state.screenshotAfterPath, fullPage: true }).catch(() => undefined);
      }
      if (state.htmlSnapshotPath) {
        const html = await page.content().catch(() => '');
        state.domHash = hashDomContent(html);
        if (html) await fs.writeFile(state.htmlSnapshotPath, html, 'utf8').catch(() => undefined);
      }
      state.publishedUrl = state.publishedUrl ?? page.url();
    }

    return {
      publishedUrl: state.publishedUrl,
      domHash: state.domHash,
      screenshotBeforePath: state.screenshotBeforePath,
      screenshotAfterPath: state.screenshotAfterPath,
      htmlSnapshotPath: state.htmlSnapshotPath,
      durationMs: Math.max(0, Date.now() - state.startedAt),
    };
  }

  // ── BrowserDestinationAdapter publish phases → PublishAction ─

  async prepare(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.prepare(ctx);
  }

  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.uploadMedia(ctx);
  }

  async fillContent(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.fillContent(ctx);
  }

  async publish(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.publish(ctx);
  }

  async verify(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.verify(ctx);
  }

  async captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    return this.publishAction.captureEvidence(ctx);
  }

  async cleanup(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.publishAction.cleanup(ctx);
  }
}
