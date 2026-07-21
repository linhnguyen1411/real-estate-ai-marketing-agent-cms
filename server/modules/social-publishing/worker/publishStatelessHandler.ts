/**
 * G1 — Stateless publish execution from hydrated payload (no DB on worker).
 */

import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from '../../../agent-worker/browserManager';
import { ExecutionEvidenceSink } from '../../../agent-worker/execution/evidenceSink';
import { isStatelessExecutionAgent, requireHydratedExecution } from '../../../agent-worker/execution/stateless';
import { readHydratedExecution } from '../../control-plane/execution/jobPayloadContract';
import { configureFacebookGroupAdapterRuntime } from '../browser/adapters/facebookGroupAdapter';
import { configureFacebookTimelineAdapterRuntime } from '../browser/adapters/facebookTimelineAdapter';
import {
  resolveAdapterForPayload,
  toBrowserDestinationContext,
  type PublishWorkflowPayload,
} from '../publishWorkflowContext';

export async function runStatelessPublishSocialJob(
  agentJob: AgentJob,
  browser: BrowserManager,
): Promise<Record<string, unknown>> {
  requireHydratedExecution(agentJob.payload, 'publish_social');
  const hydrated = readHydratedExecution(agentJob.payload);
  const bundle = hydrated?.publish;
  if (!bundle?.publish) {
    throw new Error('Stateless publish_social missing payload.execution.publish');
  }

  const pageFactory = {
    getPublishPage: (options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }) =>
      browser.getPublishPage(options),
    beginCdpJob: () => browser.beginCdpJob('publish'),
    releaseCdpLock: () => browser.releaseCdpLock('publish'),
  };
  configureFacebookTimelineAdapterRuntime({ pageFactory });
  configureFacebookGroupAdapterRuntime({ pageFactory });

  const payload = bundle.publish as PublishWorkflowPayload;
  const adapter = resolveAdapterForPayload(payload);
  if (!adapter) {
    throw new Error(`No browser adapter for destination ${payload.destinationKey}`);
  }

  const evidence = new ExecutionEvidenceSink();
  const ctx = toBrowserDestinationContext(payload, {
    missionRunId: bundle.missionRunId || agentJob.missionRunId || '',
    workerId: agentJob.claimedBy,
  });

  if (payload.dryRun) {
    const result = { ok: true, dryRun: true, publishJobId: payload.publishJobId };
    evidence.setPublishResult(result);
    return { ...result, evidence: evidence.toJSON() };
  }

  await browser.beginCdpJob('publish');
  try {
    const publishResult = await adapter.publish(ctx);
    const result = {
      ok: true,
      publishJobId: payload.publishJobId,
      ...publishResult,
    };
    evidence.setPublishResult(result);
    return { ...result, evidence: evidence.toJSON() };
  } finally {
    browser.releaseCdpLock('publish');
    await browser.closePublishPage().catch(() => undefined);
  }
}

export function shouldUseStatelessPublish(agentJob: AgentJob): boolean {
  return isStatelessExecutionAgent() && Boolean(readHydratedExecution(agentJob.payload)?.publish);
}
