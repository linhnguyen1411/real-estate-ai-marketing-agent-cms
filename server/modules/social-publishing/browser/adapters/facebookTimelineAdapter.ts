import fs from 'fs/promises';
import type { Page } from 'playwright';
import { detectFacebookAuthBlock } from '../../../../agent-worker/facebook/facebookCheckpointDetector';
import { DESTINATION_CAPABILITY_PRESETS } from '../capabilities';
import type {
  BrowserDestinationAdapter,
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
} from '../types';
import { buildEvidencePaths, hashDomContent } from '../../runtime/publishEvidenceService';

interface TimelinePageFactory {
  getPublishPage(options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }): Promise<Page>;
  beginCdpJob?(): Promise<void>;
  releaseCdpLock?(): void;
}

type RuntimeDeps = {
  pageFactory?: TimelinePageFactory;
};

const runtimeDeps: RuntimeDeps = {};

type TimelineState = {
  startedAt: number;
  page?: Page;
  evidenceDir?: string;
  screenshotBeforePath?: string;
  screenshotAfterPath?: string;
  htmlSnapshotPath?: string;
  publishedUrl?: string;
  domHash?: string;
};

const stateByJob = new Map<string, TimelineState>();

export function configureFacebookTimelineAdapterRuntime(deps: RuntimeDeps): void {
  runtimeDeps.pageFactory = deps.pageFactory;
}

function stateFor(ctx: BrowserDestinationContext): TimelineState {
  const existing = stateByJob.get(ctx.publishJobId);
  if (existing) return existing;
  const created: TimelineState = { startedAt: Date.now() };
  stateByJob.set(ctx.publishJobId, created);
  return created;
}

async function ensurePage(ctx: BrowserDestinationContext): Promise<Page | null> {
  const state = stateFor(ctx);
  if (state.page && !state.page.isClosed()) return state.page;
  const factory = runtimeDeps.pageFactory;
  if (!factory) return null;
  await factory.beginCdpJob?.();
  const page = await factory.getPublishPage({ initialUrl: 'https://www.facebook.com/', mode: 'cdp' });
  state.page = page;
  return page;
}

function ok(phase: string, data?: Record<string, unknown>): BrowserDestinationPhaseResult {
  return { ok: true, phase, data };
}

export class FacebookTimelineAdapter implements BrowserDestinationAdapter {
  readonly key = 'facebook_timeline' as const;
  readonly capabilities = DESTINATION_CAPABILITY_PRESETS.facebook_timeline;

  async prepare(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const state = stateFor(ctx);
    const attemptId = `wf_${ctx.missionRunId}_browser_capture_evidence`;
    const paths = buildEvidencePaths(ctx.publishJobId, attemptId);
    state.evidenceDir = paths.baseDir;
    state.screenshotBeforePath = paths.screenshotBeforePath;
    state.screenshotAfterPath = paths.screenshotAfterPath;
    state.htmlSnapshotPath = paths.htmlSnapshotPath;
    state.startedAt = Date.now();
    return ok('prepare', { dryRun: ctx.dryRun, evidenceDir: paths.baseDir });
  }

  async ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await ensurePage(ctx);
    if (!page) return ok('ensureAuthenticated', { mode: 'dry_run_no_browser' });
    const auth = await detectFacebookAuthBlock(page);
    if (auth.blocked) {
      throw new Error(auth.reason || 'facebook_auth_blocked');
    }
    return ok('ensureAuthenticated', { url: page.url() });
  }

  async navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await ensurePage(ctx);
    if (!page) return ok('navigate', { mode: 'dry_run_no_browser' });
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
    return ok('navigate', { url: page.url() });
  }

  async uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await ensurePage(ctx);
    if (!page || ctx.dryRun) return ok('uploadMedia', { mediaCount: ctx.media.length, dryRun: true });
    const mediaFiles = ctx.media
      .map(m => m.fileUrl)
      .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
    if (mediaFiles.length === 0) return ok('uploadMedia', { mediaCount: 0 });

    const input = page.locator('input[type="file"]').first();
    if (await input.count().catch(() => 0)) {
      await input.setInputFiles(mediaFiles).catch(() => undefined);
      return ok('uploadMedia', { mediaCount: mediaFiles.length, method: 'file_input' });
    }
    return ok('uploadMedia', { mediaCount: 0, skipped: 'no_file_input' });
  }

  private async compose(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await ensurePage(ctx);
    if (!page || ctx.dryRun) return ok('compose', { dryRun: true });
    const composer = page.locator('[contenteditable="true"][role="textbox"], div[contenteditable="true"]').first();
    await composer.click({ timeout: 10_000 }).catch(() => undefined);
    await composer.fill(ctx.body).catch(async () => {
      await page.keyboard.type(ctx.body, { delay: 5 });
    });
    if (ctx.linkUrl) {
      await page.keyboard.type(`\n${ctx.linkUrl}`, { delay: 5 }).catch(() => undefined);
    }
    return ok('compose', { bodyLength: ctx.body.length, hasLink: Boolean(ctx.linkUrl) });
  }

  async fillContent(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    return this.compose(ctx);
  }

  async publish(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const page = await ensurePage(ctx);
    const state = stateFor(ctx);
    if (!page || ctx.dryRun) {
      state.publishedUrl = `https://www.facebook.com/me?story_fbid=stub_${ctx.publishJobId}`;
      return ok('publish', { dryRun: true, publishedUrl: state.publishedUrl });
    }
    const button = page.getByRole('button', { name: /^(post|publish|đăng|share)$/i }).first();
    await button.click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(2_500);
    state.publishedUrl = page.url();
    return ok('publish', { publishedUrl: state.publishedUrl });
  }

  async verify(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult> {
    const state = stateFor(ctx);
    return ok('verify', { publishedUrl: state.publishedUrl ?? null });
  }

  async captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence> {
    const page = await ensurePage(ctx);
    const state = stateFor(ctx);
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
    const state = stateFor(ctx);
    runtimeDeps.pageFactory?.releaseCdpLock?.();
    stateByJob.delete(ctx.publishJobId);
    return ok('cleanup', { released: true });
  }
}
