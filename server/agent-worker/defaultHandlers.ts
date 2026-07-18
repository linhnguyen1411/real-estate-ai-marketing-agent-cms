/**
 * Default job handler registry — adapters to existing handlers (unchanged business logic).
 */

import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from './browserManager';
import { JobHandlerRegistry } from './ports';
import { runScanSourceJob } from './scanSourceHandler';
import { runPublishSocialJob } from '../modules/social-publishing/worker/publishSocialHandler';

export function createDefaultJobHandlerRegistry(): JobHandlerRegistry {
  const registry = new JobHandlerRegistry();

  registry.register('health_check', async () => ({
    ok: true,
    checkedAt: new Date().toISOString(),
    message: 'Worker alive',
  }));

  registry.register('visit_url', async (job: AgentJob, browser: BrowserManager) => {
    const payload = (job.payload || {}) as Record<string, unknown>;
    const url = String(payload.url || '').trim();
    if (!url) throw new Error('visit_url thiếu payload.url');
    const visited = await browser.visitUrl(url);
    return { ...visited, visitedAt: new Date().toISOString() };
  });

  registry.register('scan_source', (job, browser) => runScanSourceJob(job, browser));
  registry.register('source_scan', (job, browser) => runScanSourceJob(job, browser));
  registry.register('publish_social', (job, browser) => runPublishSocialJob(job, browser));

  return registry;
}
