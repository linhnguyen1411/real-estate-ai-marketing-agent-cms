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

export interface DestinationPageFactory {
  getPublishPage(options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }): Promise<Page>;
  beginCdpJob?(): Promise<void>;
  releaseCdpLock?(): void;
}

export interface SelectorMap {
  composer: string;
  fileInput: string;
  publishButtonRoleName: RegExp;
}

type DestinationState = {
  startedAt: number;
  page?: Page;
  evidenceDir?: string;
  screenshotBeforePath?: string;
  screenshotAfterPath?: string;
  htmlSnapshotPath?: string;
  publishedUrl?: string;
  domHash?: string;
};

export abstract class GenericBrowserDestinationAdapter implements BrowserDestinationAdapter {
  abstract readonly key: DestinationKey;
  abstract readonly capabilities: DestinationCapabilities;
  protected abstract readonly selectorMap: SelectorMap;
  protected abstract initialUrl(ctx: BrowserDestinationContext): string;
  protected abstract ensureAuthenticatedImpl(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  protected abstract composeStrategy(
    page: Page,
    composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  protected abstract publishStrategy(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;
  protected abstract verifyStrategy(
    page: Page | null,
    ctx: BrowserDestinationContext,
    state: DestinationState,
  ): Promise<BrowserDestinationPhaseResult>;

  private readonly stateByJob = new Map<string, DestinationState>();
  private runtimeFactory?: DestinationPageFactory;

  configureRuntime(factory?: DestinationPageFactory): void {
    this.runtimeFactory = factory;
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

  protected async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  protected stateFor(ctx: BrowserDestinationContext): DestinationState {
    const existing = this.stateByJob.get(ctx.publishJobId);
    if (existing) return existing;
    const created: DestinationState = { startedAt: Date.now() };
    this.stateByJob.set(ctx.publishJobId, created);
    return created;
  }

  protected async ensurePage(ctx: BrowserDestinationContext): Promise<Page | null> {
    const state = this.stateFor(ctx);
    if (state.page && !state.page.isClosed()) return state.page;
    const factory = this.runtimeFactory;
    if (!factory) return null;
    await factory.beginCdpJob?.();
    const page = await factory.getPublishPage({ initialUrl: this.initialUrl(ctx), mode: 'cdp' });
    state.page = page;
    return page;
  }

  protected ok(phase: string, data?: Record<string, unknown>): BrowserDestinationPhaseResult {
    return { ok: true, phase, data };
  }

  async prepare(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
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

  async navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page) return this.ok('navigate', { mode: 'dry_run_no_browser' });
    await this.withRetry(
      () => page.goto(this.initialUrl(ctx), { waitUntil: 'domcontentloaded', timeout: 60_000 }).then(() => undefined),
      1,
      500,
    ).catch(() => undefined);
    return this.ok('navigate', { url: page.url() });
  }

  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page || ctx.dryRun) return this.ok('uploadMedia', { mediaCount: ctx.media.length, dryRun: true });
    const mediaFiles = ctx.media
      .map(m => m.fileUrl)
      .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
    if (mediaFiles.length === 0) return this.ok('uploadMedia', { mediaCount: 0 });

    const input = page.locator(this.selectorMap.fileInput).first();
    if (await input.count().catch(() => 0)) {
      await input.setInputFiles(mediaFiles).catch(() => undefined);
      return this.ok('uploadMedia', { mediaCount: mediaFiles.length, method: 'file_input' });
    }
    return this.ok('uploadMedia', { mediaCount: 0, skipped: 'no_file_input' });
  }

  async fillContent(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page || ctx.dryRun) return this.ok('compose', { dryRun: true });
    const composer = page.locator(this.selectorMap.composer).first();
    try {
      return await this.composeStrategy(page, composer, ctx);
    } catch (error) {
      throw this.mapAdapterError(error, 'compose');
    }
  }

  async publish(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    const state = this.stateFor(ctx);
    if (!page || ctx.dryRun) {
      state.publishedUrl = `${this.initialUrl(ctx)}?story_fbid=stub_${ctx.publishJobId}`;
      return this.ok('publish', { dryRun: true, publishedUrl: state.publishedUrl });
    }
    try {
      const result = await this.publishStrategy(page, ctx);
      if (result.data?.publishedUrl && typeof result.data.publishedUrl === 'string') {
        state.publishedUrl = result.data.publishedUrl;
      } else {
        state.publishedUrl = page.url();
      }
      return result;
    } catch (error) {
      throw this.mapAdapterError(error, 'publish');
    }
  }

  async captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
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

  async cleanup(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    this.runtimeFactory?.releaseCdpLock?.();
    this.stateByJob.delete(ctx.publishJobId);
    return this.ok('cleanup', { released: true });
  }

  async ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    if (!page) return this.ok('ensureAuthenticated', { mode: 'dry_run_no_browser' });
    return this.ensureAuthenticatedImpl(page, ctx);
  }

  async verify(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await this.ensurePage(ctx);
    const state = this.stateFor(ctx);
    return this.verifyStrategy(page, ctx, state);
  }
}
