import fs from 'fs';
import path from 'path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import {
  AGENT_BROWSER_CHANNEL,
  parseAndSanitizeCdpEndpoint,
  type AgentBrowserMode,
  type SanitizedCdpEndpoint,
  type WorkerConfig,
} from './config';
import { formatProfileLockDiagnostic } from './runtime/profileLeaseSidecar';

export interface GetOrCreatePageOptions {
  preferredDomain?: string;
  initialUrl?: string;
  /**
   * Force a fresh, worker-owned tab instead of reusing an existing (user) tab.
   * Used by the Facebook scan so it never drives the user's own Facebook tab.
   */
  forceNewPage?: boolean;
}

export interface AgentBrowserConnection {
  mode: AgentBrowserMode;
  context: BrowserContext;
  ownedByWorker: boolean;
  getOrCreatePage(options?: GetOrCreatePageOptions): Promise<Page>;
  shutdown(): Promise<void>;
}

type PersistentContextOptions = Parameters<typeof chromium.launchPersistentContext>[1];

function managedLaunchOptions(headless: boolean): PersistentContextOptions {
  if (headless) {
    return {
      channel: AGENT_BROWSER_CHANNEL,
      headless: true,
      viewport: { width: 1280, height: 800 },
      locale: 'vi-VN',
    };
  }
  return {
    channel: AGENT_BROWSER_CHANNEL,
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
    locale: 'vi-VN',
  };
}

export class ManagedBrowserConnection implements AgentBrowserConnection {
  readonly mode = 'managed' as const;
  readonly ownedByWorker = true;
  readonly context: BrowserContext;

  private constructor(context: BrowserContext) {
    this.context = context;
  }

  static async connect(config: WorkerConfig): Promise<ManagedBrowserConnection> {
    const profileDir = path.resolve(config.profileDir);
    fs.mkdirSync(profileDir, { recursive: true });
    // CDP workstation mode keeps the visible Facebook Chrome (agent-cdp-profile).
    // Website/forum scans still use managed Playwright — force headless so we do
    // not pop a second empty "new profile" window over the operator's CDP Chrome.
    const headless = config.headless || config.browserMode === 'cdp';

    console.log('[browser:managed] launchPersistentContext');
    console.log(`  profilePath: ${profileDir}`);
    console.log(`  channel:     ${AGENT_BROWSER_CHANNEL}`);
    console.log(`  headless:    ${headless}${!config.headless && headless ? ' (forced: AGENT_BROWSER_MODE=cdp)' : ''}`);

    try {
      const context = await chromium.launchPersistentContext(
        profileDir,
        managedLaunchOptions(headless),
      );
      return new ManagedBrowserConnection(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/lock|Singleton|profile.*in use|already in use/i.test(message)) {
        const ownership = ` | ${formatProfileLockDiagnostic(profileDir)}`;
        throw new Error(`BROWSER_PROFILE_LOCKED: ${message}${ownership}`);
      }
      throw error;
    }
  }

  async getOrCreatePage(options?: GetOrCreatePageOptions): Promise<Page> {
    const page = await pickOrCreatePage(this.context, options, { trackOwned: false });
    return page;
  }

  async shutdown(): Promise<void> {
    await this.context.close();
  }
}

export class CdpBrowserConnection implements AgentBrowserConnection {
  readonly mode = 'cdp' as const;
  readonly ownedByWorker = false;
  readonly context: BrowserContext;
  readonly endpoint: SanitizedCdpEndpoint;

  /** Kept alive so the CDP socket stays open; never closed (external Chrome). */
  private readonly cdpBrowser: Browser;
  private readonly workerOwnedPages = new WeakSet<Page>();

  private constructor(browser: Browser, context: BrowserContext, endpoint: SanitizedCdpEndpoint) {
    this.cdpBrowser = browser;
    this.context = context;
    this.endpoint = endpoint;
  }

  static async connect(config: WorkerConfig): Promise<CdpBrowserConnection> {
    const endpoint =
      config.cdpEndpoint ??
      parseAndSanitizeCdpEndpoint(process.env.AGENT_CDP_ENDPOINT);

    console.log('[browser:cdp] connectOverCDP');
    console.log(`  endpointHost: ${endpoint.host}`);
    console.log(`  endpointPort: ${endpoint.port}`);

    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(endpoint.httpEndpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`CDP_UNREACHABLE: cannot connect to ${endpoint.host}:${endpoint.port} (${message})`);
    }

    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('CDP_NO_CONTEXT: Chrome CDP has no browser context. Start Chrome with --remote-debugging-port.');
    }

    return new CdpBrowserConnection(browser, context, endpoint);
  }

  async getOrCreatePage(options?: GetOrCreatePageOptions): Promise<Page> {
    return pickOrCreatePage(this.context, options, {
      trackOwned: true,
      ownedPages: this.workerOwnedPages,
    });
  }

  /**
   * Do not call browser.close() — external Chrome must stay open.
   * Reference kept until process exit drops the CDP socket.
   */
  async shutdown(): Promise<void> {
    void this.cdpBrowser;
  }
}

async function pickOrCreatePage(
  context: BrowserContext,
  options: GetOrCreatePageOptions | undefined,
  tracking: { trackOwned: boolean; ownedPages?: WeakSet<Page> },
): Promise<Page> {
  const pages = context.pages();
  const preferred = options?.preferredDomain?.toLowerCase();

  if (options?.forceNewPage) {
    const page = await context.newPage();
    if (tracking.trackOwned && tracking.ownedPages) {
      tracking.ownedPages.add(page);
    }
    if (options?.initialUrl) {
      await page.goto(options.initialUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    }
    return page;
  }

  if (preferred) {
    for (const page of pages) {
      const url = page.url();
      if (urlHostnameIncludes(url, preferred)) {
        if (options?.initialUrl && shouldNavigate(url, options.initialUrl)) {
          await page.goto(options.initialUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          });
        }
        return page;
      }
    }
  }

  const page = pages[0] && !preferred ? pages[0] : await context.newPage();
  if (tracking.trackOwned && tracking.ownedPages) {
    tracking.ownedPages.add(page);
  }

  if (options?.initialUrl) {
    await page.goto(options.initialUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
  }

  return page;
}

function urlHostnameIncludes(url: string, domain: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes(domain.toLowerCase());
  } catch {
    return url.toLowerCase().includes(domain.toLowerCase());
  }
}

function shouldNavigate(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return current.pathname !== target.pathname || current.search !== target.search;
  } catch {
    return currentUrl !== targetUrl;
  }
}

export async function openBrowserConnection(
  mode: AgentBrowserMode,
  config: WorkerConfig,
): Promise<AgentBrowserConnection> {
  if (mode === 'cdp') return CdpBrowserConnection.connect(config);
  return ManagedBrowserConnection.connect(config);
}
