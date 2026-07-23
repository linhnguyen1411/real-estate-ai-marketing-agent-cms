import fs from 'fs';
import os from 'os';
import path from 'path';

export const AGENT_BROWSER_CHANNEL = 'chrome' as const;
export const AGENT_BROWSER_MODES = ['managed', 'cdp'] as const;
export type AgentBrowserMode = (typeof AGENT_BROWSER_MODES)[number];

export interface SanitizedCdpEndpoint {
  host: string;
  port: number;
  /** http://host:port — never log websocket debugger URLs */
  httpEndpoint: string;
}

export interface WorkerConfig {
  workerId: string;
  /** Default mode when source does not override (facebook still resolves via source type). */
  browserMode: AgentBrowserMode;
  /** Absolute managed profile path (Playwright launchPersistentContext). */
  profileDir: string;
  /**
   * Absolute CDP Chrome --user-data-dir (start-cdp-chrome.ps1).
   * Distinct from profileDir — never conflate the two.
   */
  cdpProfileDir: string;
  /**
   * Profile path that is actually in use for the default browser mode
   * (CDP → cdpProfileDir, managed → profileDir). Safe for heartbeats/ops UI.
   */
  activeProfileDir: string;
  browserChannel: typeof AGENT_BROWSER_CHANNEL;
  headless: boolean;
  cdpEndpoint: SanitizedCdpEndpoint | null;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  companyId: string | null;
  sessionName: string;
}

/**
 * Dedicated agent profile (absolute). Never the OS default Chrome User Data dir.
 */
export function resolveAgentBrowserProfileDir(): string {
  const raw =
    process.env.AGENT_BROWSER_PROFILE_DIR?.trim() ||
    path.join(process.cwd(), 'runtime', 'agent-browser-profile');
  return path.resolve(raw);
}

/** Dedicated CDP Chrome user-data-dir (absolute). */
export function resolveAgentCdpProfileDir(): string {
  const raw =
    process.env.AGENT_CDP_PROFILE_DIR?.trim() ||
    path.join(process.cwd(), 'runtime', 'agent-cdp-profile');
  return path.resolve(raw);
}

export function parseAgentBrowserMode(raw: unknown, fallback: AgentBrowserMode = 'managed'): AgentBrowserMode {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'managed' || value === 'cdp') return value;
  return fallback;
}

/**
 * Only loopback CDP endpoints are allowed in MVP.
 * Throws with code CDP_UNREACHABLE for invalid hosts.
 */
export function parseAndSanitizeCdpEndpoint(raw: string | undefined | null): SanitizedCdpEndpoint {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw new Error('CDP_UNREACHABLE: AGENT_CDP_ENDPOINT is required when browser mode is cdp.');
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
  } catch {
    throw new Error('CDP_UNREACHABLE: invalid AGENT_CDP_ENDPOINT.');
  }

  const host = url.hostname.toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('CDP_UNREACHABLE: CDP endpoint must be loopback (127.0.0.1 / localhost / ::1).');
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 9222;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('CDP_UNREACHABLE: invalid CDP port.');
  }

  const normalizedHost = host === '::1' ? '[::1]' : host === 'localhost' ? '127.0.0.1' : host;
  return {
    host: host === 'localhost' ? '127.0.0.1' : host,
    port,
    httpEndpoint: `http://${normalizedHost}:${port}`,
  };
}

export function loadWorkerConfig(): WorkerConfig {
  // Stable by default — PID in workerId created a new Fleet "machine" every restart.
  const workerId =
    process.env.AGENT_WORKER_ID?.trim() ||
    `worker-${os.hostname().replace(/[^a-zA-Z0-9-]/g, '-')}`;

  const browserMode = parseAgentBrowserMode(process.env.AGENT_BROWSER_MODE, 'managed');
  const profileDir = resolveAgentBrowserProfileDir();
  const cdpProfileDir = resolveAgentCdpProfileDir();
  const activeProfileDir = browserMode === 'cdp' ? cdpProfileDir : profileDir;
  const headless = process.env.AGENT_HEADLESS === 'true';
  const pollIntervalMs = Math.max(500, Number(process.env.AGENT_POLL_INTERVAL_MS || 3000));
  const heartbeatIntervalMs = Math.min(
    30_000,
    Math.max(15_000, Number(process.env.AGENT_HEARTBEAT_INTERVAL_MS || 20_000)),
  );

  const companyId = process.env.AGENT_COMPANY_ID?.trim() || null;
  const sessionName = process.env.AGENT_SESSION_NAME?.trim() || `Browser Worker (${workerId})`;

  let cdpEndpoint: SanitizedCdpEndpoint | null = null;
  if (browserMode === 'cdp' || process.env.AGENT_CDP_ENDPOINT?.trim()) {
    try {
      cdpEndpoint = parseAndSanitizeCdpEndpoint(process.env.AGENT_CDP_ENDPOINT);
    } catch (error) {
      if (browserMode === 'cdp') throw error;
      // Optional CDP endpoint when default mode is managed — parse lazily on use
      cdpEndpoint = null;
    }
  }

  if (browserMode === 'managed') {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  return {
    workerId,
    browserMode,
    profileDir,
    cdpProfileDir,
    activeProfileDir,
    browserChannel: AGENT_BROWSER_CHANNEL,
    headless,
    cdpEndpoint,
    pollIntervalMs,
    heartbeatIntervalMs,
    companyId,
    sessionName,
  };
}

/** Safe metadata for BrowserSession — no cookies, tokens, or full WS URLs. */
export function buildBrowserSessionMetadata(config: WorkerConfig): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    mode: config.browserMode,
    browserChannel: config.browserChannel,
  };
  if (config.cdpEndpoint) {
    meta.endpointHost = config.cdpEndpoint.host;
    meta.endpointPort = config.cdpEndpoint.port;
  }
  return meta;
}
