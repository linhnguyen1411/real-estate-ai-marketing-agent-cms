import type { AgentSource } from '@prisma/client';
import type { BrowserContext, Page } from 'playwright';
import {
  openBrowserConnection,
  type AgentBrowserConnection,
  type GetOrCreatePageOptions,
} from './agentBrowserConnection';
import {
  buildBrowserSessionMetadata,
  type AgentBrowserMode,
  type WorkerConfig,
} from './config';
import {
  resolveBrowserModeForSource,
  resolveBrowserModeForUrl,
} from './browserModeResolver';
import { detectFacebookAuthBlock } from './facebook/facebookCheckpointDetector';
import { getRuntimeJobContext } from './runtime/als';
import type { BrowserPurpose } from './runtime/types';

export interface GetPageOptions extends GetOrCreatePageOptions {
  source?: Pick<AgentSource, 'type' | 'config'>;
  mode?: AgentBrowserMode;
}

/**
 * Facade: lazy managed + CDP connections.
 * CDP: publish is exclusive over the shared Chrome profile (scan defers while publish holds lock).
 * Same-purpose overlap still blocked; scan ∥ publish no longer allowed on one profile.
 */

export type CdpLockPurpose = BrowserPurpose | 'shared';

type CdpLockEntry = { owner: string; refs: number };

export class BrowserManager {
  private managed: AgentBrowserConnection | null = null;
  private cdp: AgentBrowserConnection | null = null;
  /** Purpose → owner + refcount (reentrant for same job via ALS / explicit owner). */
  private readonly cdpLocks = new Map<CdpLockPurpose, CdpLockEntry>();
  private readonly config: WorkerConfig;
  /** Single worker-owned scan tab, reused across jobs (never the user's tab). */
  private scanPage: Page | null = null;
  /** Separate worker-owned publish tab — never reuse scan tab for posting. */
  private publishPage: Page | null = null;
  /** Safety guard: warn if the context accumulates more tabs than this. */
  private readonly maxContextPages = 10;
  readonly scanMetrics = {
    scanPageCreated: 0,
    scanPageReused: 0,
    scanPageRecreatedAfterCrash: 0,
    facebookConcurrentJobRejected: 0,
  };
  /** Mode used for the most recent getScanPage call. */
  private lastScanPageMode: 'created' | 'reused' | 'recreated' = 'created';
  private lastPublishPageMode: 'created' | 'reused' | 'recreated' = 'created';

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  /** Number of pages currently open on the active (cdp preferred) context. */
  currentContextPageCount(): number {
    const conn = this.cdp ?? this.managed;
    return conn ? conn.context.pages().length : 0;
  }

  /** Snapshot for job result (Part 2 / Part 14). */
  scanPageInfo(): { browserPageMode: 'created' | 'reused' | 'recreated'; contextPageCount: number } {
    return {
      browserPageMode: this.lastScanPageMode,
      contextPageCount: this.currentContextPageCount(),
    };
  }

  /**
   * Get the worker-owned Facebook scan tab, creating it once and reusing it.
   * In CDP mode this is a fresh tab opened by the worker — never the user's tab,
   * and it is closed on worker shutdown without touching external Chrome.
   */
  async getScanPage(options: GetPageOptions): Promise<Page> {
    const mode = this.resolveMode(options);
    const conn = await this.ensureConnection(mode);

    // Reuse the existing worker-owned tab whenever it is still open.
    if (this.scanPage && !this.scanPage.isClosed()) {
      this.lastScanPageMode = 'reused';
      this.scanMetrics.scanPageReused += 1;
      if (options.initialUrl) {
        const current = this.scanPage.url();
        if (shouldReloadScanPage(current, options.initialUrl)) {
          await this.scanPage
            .goto(options.initialUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            .catch(() => undefined);
        }
      }
      return this.scanPage;
    }

    // Recreate only when the previous tab crashed/was closed.
    if (this.scanPage && this.scanPage.isClosed()) {
      this.lastScanPageMode = 'recreated';
      this.scanMetrics.scanPageRecreatedAfterCrash += 1;
    } else {
      this.lastScanPageMode = 'created';
      this.scanMetrics.scanPageCreated += 1;
    }
    this.scanPage = null;

    const pageCount = conn.context.pages().length;
    if (pageCount >= this.maxContextPages) {
      console.warn(
        `[browser-manager] context has ${pageCount} tabs (>= ${this.maxContextPages}); ` +
          'not closing user tabs — only worker-owned scan tab is managed.',
      );
    }

    const page = await conn.context.newPage();
    this.scanPage = page;
    if (options.initialUrl) {
      await page
        .goto(options.initialUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        .catch(() => undefined);
    }
    return page;
  }

  /**
   * Get a fresh worker-owned Facebook publish tab (never scan/findings tabs).
   * Always recreate so composer is clean even when Chrome has many scan tabs.
   */
  async getPublishPage(options: GetPageOptions = {}): Promise<Page> {
    const mode = this.resolveMode(options);
    const conn = await this.ensureConnection(mode);
    const home =
      (options.initialUrl && options.initialUrl.trim()) || 'https://www.facebook.com/';

    // Always start clean — do not reuse a tab that may have drifted into posts/findings UI.
    await this.closePublishPage();
    this.lastPublishPageMode = 'created';

    const pageCount = conn.context.pages().length;
    if (pageCount >= this.maxContextPages) {
      console.warn(
        `[browser-manager] context has ${pageCount} tabs (>= ${this.maxContextPages}); ` +
          'opening dedicated publish tab (scan/findings tabs left untouched).',
      );
    }

    const page = await conn.context.newPage();
    this.publishPage = page;
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => undefined);
    await page
      .goto(home, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      .catch(() => undefined);
    await page.bringToFront().catch(() => undefined);
    return page;
  }

  publishPageInfo(): { browserPageMode: 'created' | 'reused' | 'recreated'; contextPageCount: number } {
    return {
      browserPageMode: this.lastPublishPageMode,
      contextPageCount: this.currentContextPageCount(),
    };
  }

  async closePublishPage(): Promise<void> {
    if (this.publishPage && !this.publishPage.isClosed()) {
      await this.publishPage.close().catch(() => undefined);
    }
    this.publishPage = null;
  }

  get profilePath(): string {
    return this.config.profileDir;
  }

  get browserChannel(): string {
    return this.config.browserChannel;
  }

  get defaultMode(): AgentBrowserMode {
    return this.config.browserMode;
  }

  isCdpBusy(purpose?: CdpLockPurpose): boolean {
    if (purpose) return (this.cdpLocks.get(purpose)?.refs || 0) > 0;
    for (const e of this.cdpLocks.values()) {
      if (e.refs > 0) return true;
    }
    return false;
  }

  sessionMetadata(activeMode?: AgentBrowserMode): Record<string, unknown> {
    const meta = buildBrowserSessionMetadata(this.config);
    if (activeMode) meta.mode = activeMode;
    if (this.config.cdpEndpoint) {
      meta.endpointHost = this.config.cdpEndpoint.host;
      meta.endpointPort = this.config.cdpEndpoint.port;
    }
    Object.assign(meta, this.getResourceDiagnostics());
    return meta;
  }

  /**
   * Lightweight resource snapshot for heartbeat / job results / ops diagnose.
   * Does not touch user tabs; counts only.
   */
  getResourceDiagnostics(): Record<string, unknown> {
    const contexts =
      (this.cdp ? 1 : 0) + (this.managed ? 1 : 0);
    const pageCount = this.currentContextPageCount();
    const workerOwnedScan =
      this.scanPage && !this.scanPage.isClosed() ? 1 : 0;
    const workerOwnedPublish =
      this.publishPage && !this.publishPage.isClosed() ? 1 : 0;
    const workerOwned = workerOwnedScan + workerOwnedPublish;
    const locks: Record<string, { owner: string; refs: number }> = {};
    for (const [k, v] of this.cdpLocks) locks[k] = { owner: v.owner, refs: v.refs };
    return {
      browserContexts: contexts,
      contextPageCount: pageCount,
      workerOwnedScanPages: workerOwnedScan,
      workerOwnedPublishPages: workerOwnedPublish,
      userOwnedPagesEstimate: Math.max(0, pageCount - workerOwned),
      scanPageCreated: this.scanMetrics.scanPageCreated,
      scanPageReused: this.scanMetrics.scanPageReused,
      scanPageRecreatedAfterCrash: this.scanMetrics.scanPageRecreatedAfterCrash,
      facebookConcurrentJobRejected: this.scanMetrics.facebookConcurrentJobRejected,
      cdpBusy: this.isCdpBusy(),
      cdpLocks: locks,
      lastBrowserHeartbeatAt: new Date().toISOString(),
    };
  }

  async launch(): Promise<BrowserContext | null> {
    if (this.config.browserMode === 'managed') {
      const conn = await this.ensureConnection('managed');
      return conn.context;
    }
    console.log('[agent-worker] Default/env mode may use CDP — attach lazily per job.');
    return null;
  }

  /**
   * CDP lock — publish owns the shared Chrome profile exclusively.
   * Scan/shared cannot start while publish is held; publish waits if scan is mid-lock.
   */
  async beginCdpJob(purpose?: CdpLockPurpose): Promise<void> {
    const ctx = getRuntimeJobContext();
    const p: CdpLockPurpose = purpose ?? ctx?.purpose ?? 'shared';
    const owner = ctx?.jobId ?? 'anonymous';

    if (p === 'publish') {
      for (const [key, entry] of this.cdpLocks) {
        if (key === 'publish') continue;
        if (entry.refs > 0 && entry.owner !== owner) {
          this.scanMetrics.facebookConcurrentJobRejected += 1;
          throw new Error(
            `CDP_BUSY: chrome exclusive for publish — purpose=${key} held by job=${entry.owner} (requested by ${owner}).`,
          );
        }
      }
    } else {
      const pub = this.cdpLocks.get('publish');
      if (pub && pub.refs > 0 && pub.owner !== owner) {
        this.scanMetrics.facebookConcurrentJobRejected += 1;
        throw new Error(
          `CDP_BUSY: publish owns chrome — held by job=${pub.owner} (requested by ${owner} for ${p}).`,
        );
      }
    }

    const cur = this.cdpLocks.get(p);
    if (!cur) {
      this.cdpLocks.set(p, { owner, refs: 1 });
      return;
    }
    if (cur.owner === owner) {
      cur.refs += 1;
      return;
    }
    this.scanMetrics.facebookConcurrentJobRejected += 1;
    throw new Error(
      `CDP_BUSY: purpose=${p} held by job=${cur.owner} (requested by ${owner}).`,
    );
  }

  releaseCdpLock(purpose?: CdpLockPurpose): void {
    const ctx = getRuntimeJobContext();
    const p: CdpLockPurpose = purpose ?? ctx?.purpose ?? 'shared';
    const cur = this.cdpLocks.get(p);
    if (!cur) return;
    if (cur.refs <= 1) this.cdpLocks.delete(p);
    else cur.refs -= 1;
  }

  async getPage(options?: GetPageOptions): Promise<Page> {
    const mode = this.resolveMode(options);
    const conn = await this.ensureConnection(mode);
    return conn.getOrCreatePage(options);
  }

  async currentUrl(): Promise<string | null> {
    const conn = this.cdp ?? this.managed;
    if (!conn) return null;
    const page = conn.context.pages()[0];
    return page?.url() ?? null;
  }

  async visitUrl(url: string): Promise<{ title: string; currentUrl: string }> {
    const mode = resolveBrowserModeForUrl(url, this.config);
    const preferredDomain = /facebook\.com/i.test(url) ? 'facebook.com' : undefined;

    if (mode === 'cdp') await this.beginCdpJob('scan');
    try {
      const page = await this.getPage({
        mode,
        preferredDomain,
        initialUrl: url,
      });
      const title = await page.title();
      const currentUrl = page.url();

      if (/facebook\.com/i.test(currentUrl) || /facebook\.com/i.test(url)) {
        const auth = await detectFacebookAuthBlock(page);
        if (auth.blocked) {
          const { handleFacebookAuthBlocked, getWorkerId } = await import(
            './facebook/facebookSessionGuard'
          );
          await handleFacebookAuthBlocked({
            workerId: getWorkerId(),
            companyId: this.config.companyId,
            sourceId: 'visit_url',
            sourceName: 'visit_url',
            kind: auth.kind,
            reason: auth.reason,
            errorCode: auth.errorCode,
          });
        }
      }

      return { title, currentUrl };
    } finally {
      if (mode === 'cdp') this.releaseCdpLock('scan');
    }
  }

  async close(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    // Close the worker-owned scan tab (never the user's tab / external Chrome).
    if (this.scanPage && !this.scanPage.isClosed()) {
      await this.scanPage.close().catch(() => undefined);
    }
    this.scanPage = null;

    await this.closePublishPage();

    // CDP: disconnect refs only — never close external Chrome.
    if (this.cdp) {
      await this.cdp.shutdown();
      this.cdp = null;
    }
    if (this.managed) {
      await this.managed.shutdown();
      this.managed = null;
    }
    this.cdpLocks.clear();
  }

  private resolveMode(options?: GetPageOptions): AgentBrowserMode {
    if (options?.mode) return options.mode;
    if (options?.source) return resolveBrowserModeForSource(options.source, this.config);
    if (options?.initialUrl) return resolveBrowserModeForUrl(options.initialUrl, this.config);
    if (options?.preferredDomain?.includes('facebook')) return 'cdp';
    return this.config.browserMode;
  }

  private async ensureConnection(mode: AgentBrowserMode): Promise<AgentBrowserConnection> {
    if (mode === 'cdp') {
      if (!this.cdp) this.cdp = await openBrowserConnection('cdp', this.config);
      return this.cdp;
    }
    if (!this.managed) this.managed = await openBrowserConnection('managed', this.config);
    return this.managed;
  }
}

function shouldReloadScanPage(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return current.pathname !== target.pathname || current.search !== target.search;
  } catch {
    return currentUrl !== targetUrl;
  }
}
