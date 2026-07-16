import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from '../../../agent-worker/browserManager';
import {
  claimPublishJob,
  completePublishJob,
  failPublishJob,
  getJobById,
  runPrePublishSafetyChecks,
} from '../jobService';
import {
  createFacebookPageBrowserPublisher,
  createFacebookProfileBrowserPublisher,
  resolvePublisher,
  setPublisherRegistry,
} from '../publishers';
import { facebookPageGraphPublisher } from '../publishers/facebookPageGraphPublisher';
import type { PublishResult } from '../types';

function ensureWorkerPublishers(browser: BrowserManager): void {
  const pageFactory = {
    getPublishPage: (options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }) =>
      browser.getPublishPage(options),
    beginCdpJob: () => browser.beginCdpJob(),
    releaseCdpLock: () => browser.releaseCdpLock(),
  };
  setPublisherRegistry([
    facebookPageGraphPublisher,
    createFacebookProfileBrowserPublisher({ pageFactory }),
    createFacebookPageBrowserPublisher({ pageFactory }),
  ]);
}

function isAlreadyPublishedResult(result: unknown): result is { externalPostId: string } {
  return Boolean(
    result &&
      typeof result === 'object' &&
      typeof (result as { externalPostId?: unknown }).externalPostId === 'string' &&
      (result as { externalPostId: string }).externalPostId,
  );
}

/**
 * AgentJob type=publish_social handler.
 * Payload: { publishJobId: string }
 */
export async function runPublishSocialJob(
  agentJob: AgentJob,
  browser: BrowserManager,
): Promise<Record<string, unknown>> {
  const payload = (agentJob.payload || {}) as Record<string, unknown>;
  const publishJobId = String(payload.publishJobId || '').trim();
  if (!publishJobId) {
    throw new Error('publish_social missing payload.publishJobId');
  }

  ensureWorkerPublishers(browser);

  const existing = await getJobById(publishJobId);
  if (!existing) {
    throw new Error(`SocialPublishJob not found: ${publishJobId}`);
  }

  if (existing.status === 'published' || isAlreadyPublishedResult(existing.result)) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_published',
      publishJobId,
      result: existing.result,
    };
  }

  const safety = await runPrePublishSafetyChecks(publishJobId);
  if (!safety.ok) {
    if (safety.errorCode === 'already_published') {
      return { ok: true, skipped: true, reason: 'already_published', publishJobId };
    }
    await failPublishJob(
      publishJobId,
      safety.errorCode || 'unknown',
      safety.errorMessage || 'Pre-publish safety check failed',
    );
    return {
      ok: false,
      publishJobId,
      errorCode: safety.errorCode,
      errorMessage: safety.errorMessage,
    };
  }

  let claimed;
  try {
    claimed = await claimPublishJob(publishJobId, agentJob.claimedBy || 'worker');
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : 'channel_locked';
    const message = error instanceof Error ? error.message : 'Claim failed';
    await failPublishJob(publishJobId, code, message);
    return { ok: false, publishJobId, errorCode: code, errorMessage: message };
  }

  if (!claimed) {
    return { ok: false, publishJobId, errorCode: 'channel_locked', errorMessage: 'Could not claim job' };
  }

  if (claimed.status === 'published' || isAlreadyPublishedResult(claimed.result)) {
    return { ok: true, skipped: true, reason: 'already_published', publishJobId };
  }

  const full = await getJobById(publishJobId);
  if (!full?.draft || !full.channel) {
    await failPublishJob(publishJobId, 'unknown', 'Missing draft or channel');
    return { ok: false, publishJobId, errorCode: 'unknown' };
  }

  const publisher = resolvePublisher(full.channel);
  let result: PublishResult;
  try {
    result = await publisher.publish({
      job: full,
      draft: full.draft,
      channel: full.channel,
      workerId: agentJob.claimedBy || 'worker',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publisher threw';
    await failPublishJob(publishJobId, 'unknown', message);
    return { ok: false, publishJobId, errorCode: 'unknown', errorMessage: message };
  }

  if (result.ok) {
    await completePublishJob(publishJobId, result);
    return { ok: true, publishJobId, result };
  }

  await failPublishJob(
    publishJobId,
    result.errorCode || 'unknown',
    result.errorMessage || 'Publish failed',
  );
  return {
    ok: false,
    publishJobId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    result,
  };
}
