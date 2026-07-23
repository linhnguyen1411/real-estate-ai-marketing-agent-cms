import type { AgentJob } from '@prisma/client';
import { websiteAdapter } from './adapters/websiteAdapter';
import { facebookGroupAdapter } from './adapters/facebookGroupAdapter';
import { getAdapterForSource, registerSourceAdapter, type ScanMetrics } from './adapters/sourceAdapter';
import type { BrowserManager } from './browserManager';
import { resolveBrowserModeForSource } from './browserModeResolver';
import { loadWorkerConfig } from './config';
import { ExecutionEvidenceSink } from './execution/evidenceSink';
import { resolveScanExecutionContext } from './execution/resolveScanContext';
import { isStatelessExecutionAgent, requireHydratedExecution } from './execution/stateless';

registerSourceAdapter(websiteAdapter);
registerSourceAdapter(facebookGroupAdapter);

export async function runScanSourceJob(
  job: AgentJob,
  browser: BrowserManager,
): Promise<ScanMetrics & Record<string, unknown>> {
  requireHydratedExecution(job.payload, job.type);

  const { source, mission } = await resolveScanExecutionContext(job);
  const evidence = isStatelessExecutionAgent() ? new ExecutionEvidenceSink() : null;

  const adapter = getAdapterForSource(source);
  if (!adapter) {
    throw new Error(`Chưa có adapter cho nguồn type="${source.type}".`);
  }

  const workerConfig = loadWorkerConfig();
  const mode = resolveBrowserModeForSource(source, workerConfig);
  if (mode === 'cdp') {
    await browser.beginCdpJob('scan');
  }

  try {
    const metrics = await adapter.scan({
      job,
      source,
      mission,
      browser,
      stateless: isStatelessExecutionAgent(),
      evidence: evidence ?? undefined,
    });

    const result = {
      ...metrics,
      sourceId: source.id,
      sourceType: source.type,
      adapter: adapter.name,
      browserMode: mode,
      ...browser.scanPageInfo(),
      scanMetrics: { ...browser.scanMetrics },
      resourceDiagnostics: browser.getResourceDiagnostics(),
      completedAt: new Date().toISOString(),
      ...(evidence ? { evidence: evidence.toJSON() } : {}),
    };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan thất bại.';
    const backoffMs = Math.min(
      2 * 60_000,
      Math.max(60_000, Math.floor((source.scanIntervalMinutes || 10) * 60_000) / 5),
    );
    if (evidence) {
      evidence.patchSource({
        sourceId: source.id,
        lastError: message.slice(0, 500),
        nextScanAt: new Date(Date.now() + backoffMs),
      });
      const err = error instanceof Error ? error : new Error(message);
      (err as Error & { evidence?: unknown }).evidence = evidence.toJSON();
      throw err;
    }
    const { prisma } = await import('../prisma');
    await prisma.agentSource.update({
      where: { id: source.id },
      data: {
        lastError: message.slice(0, 500),
        nextScanAt: new Date(Date.now() + backoffMs),
      },
    });
    throw error;
  } finally {
    if (mode === 'cdp') browser.releaseCdpLock('scan');
  }
}
