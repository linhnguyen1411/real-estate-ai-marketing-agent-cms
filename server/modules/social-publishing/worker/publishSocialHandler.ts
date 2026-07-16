import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from '../../../agent-worker/browserManager';
import {
  createAttemptStart,
  finishAttemptFailure,
  finishAttemptSuccess,
} from '../attemptService';
import {
  claimPublishJob,
  completePublishJob,
  failPublishJob,
  getJobById,
  markPreparing,
  markPublishing,
  patchJobResult,
  runPrePublishSafetyChecks,
} from '../jobService';
import {
  createFacebookPageBrowserPublisher,
  createFacebookProfileBrowserPublisher,
  resolvePublisher,
  setPublisherRegistry,
} from '../publishers';
import { facebookPageGraphPublisher } from '../publishers/facebookPageGraphPublisher';
import { DEFAULT_PUBLISH_TIMEOUT_MS } from '../graph/facebookGraphClient';
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

  const timeoutMs = Number(process.env.SOCIAL_PUBLISH_TIMEOUT_MS) || DEFAULT_PUBLISH_TIMEOUT_MS;
  const workerId = agentJob.claimedBy || 'worker';
  const attempt = await createAttemptStart({
    companyId: full.companyId,
    jobId: publishJobId,
    draftId: full.draftId,
    channelId: full.channelId,
    workerId,
    attemptNumber: full.attempts,
  });

  const publisher = resolvePublisher(full.channel);
  let result: PublishResult;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await markPreparing(publishJobId);
    await markPublishing(publishJobId);

    result = await Promise.race([
      publisher.publish({
        job: full,
        draft: full.draft,
        channel: full.channel,
        workerId,
      }),
      new Promise<PublishResult>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            Object.assign(new Error(`Publish timed out after ${timeoutMs}ms`), {
              code: 'publish_timeout',
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : 'unknown';
    const message = error instanceof Error ? error.message : 'Publisher threw';
    await finishAttemptFailure(attempt.id, {
      status: code === 'publish_timeout' ? 'timeout' : 'failed',
      errorCode: code,
      errorMessage: message,
    });
    await failPublishJob(publishJobId, code, message);
    return { ok: false, publishJobId, errorCode: code, errorMessage: message };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (result.ok) {
    const facebookPostId = result.facebookPostId || result.externalPostId;
    const facebookPostUrl = result.facebookPostUrl || result.externalUrl;

    // Mid-flight: persist post id before complete to reduce double-post risk
    if (facebookPostId) {
      await patchJobResult(publishJobId, {
        externalPostId: facebookPostId,
        facebookPostId,
        facebookPostUrl,
        latencyMs: result.latencyMs,
      });
    }

    await finishAttemptSuccess(attempt.id, {
      facebookPostId,
      facebookPostUrl,
      requestJson: result.request,
      responseJson: result.response || result.raw,
      durationMs: result.latencyMs,
    });
    await completePublishJob(publishJobId, result);
    return { ok: true, publishJobId, result };
  }

  await finishAttemptFailure(attempt.id, {
    status: result.errorCode === 'publish_timeout' ? 'timeout' : 'failed',
    errorCode: result.errorCode || 'unknown',
    errorMessage: result.errorMessage || 'Publish failed',
    requestJson: result.request,
    responseJson: result.response || result.raw,
    durationMs: result.latencyMs,
  });
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
