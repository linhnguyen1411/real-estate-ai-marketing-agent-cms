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

export interface GetPageOptions extends GetOrCreatePageOptions {
  source?: Pick<AgentSource, 'type' | 'config'>;
  mode?: AgentBrowserMode;
}

/**
 * Facade: lazy managed + CDP connections.
 * CDP Facebook concurrency = 1 via beginCdpJob / releaseCdpLock.
 */
export class BrowserManager {
  private managed: AgentBrowserConnection | null = null;
  private cdp: AgentBrowserConnection | null = null;
  private cdpBusy = false;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
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

  isCdpBusy(): boolean {
    return this.cdpBusy;
  }

  sessionMetadata(activeMode?: AgentBrowserMode): Record<string, unknown> {
    const meta = buildBrowserSessionMetadata(this.config);
    if (activeMode) meta.mode = activeMode;
    if (this.config.cdpEndpoint) {
      meta.endpointHost = this.config.cdpEndpoint.host;
      meta.endpointPort = this.config.cdpEndpoint.port;
    }
    return meta;
  }

  async launch(): Promise<BrowserContext | null> {
    if (this.config.browserMode === 'managed') {
      const conn = await this.ensureConnection('managed');
      return conn.context;
    }
    console.log('[agent-worker] Default/env mode may use CDP — attach lazily per job.');
    return null;
  }

  async beginCdpJob(): Promise<void> {
    if (this.cdpBusy) {
      throw new Error('CDP_BUSY: another Facebook/CDP job is using the session.');
    }
    this.cdpBusy = true;
  }

  releaseCdpLock(): void {
    this.cdpBusy = false;
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

    if (mode === 'cdp') await this.beginCdpJob();
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
      if (mode === 'cdp') this.releaseCdpLock();
    }
  }

  async close(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    // CDP: disconnect refs only — never close external Chrome.
    if (this.cdp) {
      await this.cdp.shutdown();
      this.cdp = null;
    }
    if (this.managed) {
      await this.managed.shutdown();
      this.managed = null;
    }
    this.cdpBusy = false;
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
