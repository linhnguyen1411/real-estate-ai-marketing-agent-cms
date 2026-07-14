import type { AgentJob } from '@prisma/client';
import { assertAgentSourceActiveForScan } from '../agent/agentDb';
import { prisma } from '../prisma';
import { websiteAdapter } from './adapters/websiteAdapter';
import { facebookGroupAdapter } from './adapters/facebookGroupAdapter';
import { getAdapterForSource, registerSourceAdapter, type ScanMetrics } from './adapters/sourceAdapter';
import type { BrowserManager } from './browserManager';
import { resolveBrowserModeForSource } from './browserModeResolver';
import { loadWorkerConfig } from './config';

registerSourceAdapter(websiteAdapter);
registerSourceAdapter(facebookGroupAdapter);

export async function runScanSourceJob(
  job: AgentJob,
  browser: BrowserManager,
): Promise<ScanMetrics & Record<string, unknown>> {
  const payload = (job.payload || {}) as Record<string, unknown>;
  const sourceId = String(job.sourceId || payload.sourceId || '').trim();
  if (!sourceId) {
    throw new Error('scan_source thiếu sourceId.');
  }

  const source = await assertAgentSourceActiveForScan(sourceId);

  const missionId = job.missionId || (payload.missionId ? String(payload.missionId) : null);
  const mission = missionId
    ? await prisma.agentMission.findUnique({ where: { id: missionId } })
    : null;

  const adapter = getAdapterForSource(source);
  if (!adapter) {
    throw new Error(`Chưa có adapter cho nguồn type="${source.type}".`);
  }

  const workerConfig = loadWorkerConfig();
  const mode = resolveBrowserModeForSource(source, workerConfig);
  if (mode === 'cdp') {
    await browser.beginCdpJob();
  }

  try {
    const metrics = await adapter.scan({
      job,
      source,
      mission,
      browser,
    });

    return {
      ...metrics,
      sourceId: source.id,
      sourceType: source.type,
      adapter: adapter.name,
      browserMode: mode,
      ...browser.scanPageInfo(),
      scanMetrics: { ...browser.scanMetrics },
      resourceDiagnostics: browser.getResourceDiagnostics(),
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan thất bại.';
    await prisma.agentSource.update({
      where: { id: source.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw error;
  } finally {
    if (mode === 'cdp') browser.releaseCdpLock();
  }
}
