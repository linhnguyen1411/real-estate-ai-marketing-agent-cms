import type { AgentSource } from '@prisma/client';
import {
  parseAgentBrowserMode,
  type AgentBrowserMode,
  type WorkerConfig,
} from './config';

const DEFAULT_BY_SOURCE_TYPE: Record<string, AgentBrowserMode> = {
  facebook_group: 'cdp',
  website: 'managed',
  forum: 'managed',
  search: 'managed',
};

/**
 * Single place to choose browser mode for a source.
 * Source config.browserMode may override; only "managed" | "cdp" accepted.
 */
export function resolveBrowserModeForSource(
  source: Pick<AgentSource, 'type' | 'config'>,
  workerConfig?: Pick<WorkerConfig, 'browserMode'>,
): AgentBrowserMode {
  const config = (source.config && typeof source.config === 'object'
    ? source.config
    : {}) as Record<string, unknown>;

  if (config.browserMode !== undefined && config.browserMode !== null && String(config.browserMode).trim()) {
    const override = String(config.browserMode).trim().toLowerCase();
    if (override === 'managed' || override === 'cdp') return override;
    throw new Error(`Invalid source.config.browserMode "${override}" — only managed|cdp.`);
  }

  const byType = DEFAULT_BY_SOURCE_TYPE[source.type];
  if (byType) return byType;

  return workerConfig?.browserMode ?? 'managed';
}

export function resolveBrowserModeForUrl(
  url: string,
  workerConfig: Pick<WorkerConfig, 'browserMode'>,
): AgentBrowserMode {
  if (/facebook\.com/i.test(url)) return 'cdp';
  return workerConfig.browserMode;
}

export function isValidBrowserModeOverride(value: unknown): value is AgentBrowserMode {
  return parseAgentBrowserMode(value, 'managed') === value || value === 'managed' || value === 'cdp';
}
