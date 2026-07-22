import type { AgentJob } from '@prisma/client';
import type { BrowserManager } from '../../../agent-worker/browserManager';
import { prisma } from '../../../prisma';
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
  runPrePublishSafetyChecks,
} from '../jobService';
import { startPublishMissionRun } from '../publishMissionBridge';
import type { PublishResult } from '../types';
import { executePublishWorkflow } from '../../mission-engine/application/publishWorkflowExecutionService';
import { configureFacebookGroupAdapterRuntime } from '../browser/adapters/facebookGroupAdapter';
import { configureFacebookTimelineAdapterRuntime } from '../browser/adapters/facebookTimelineAdapter';
import {
  runStatelessPublishSocialJob,
  shouldUseStatelessPublish,
} from './publishStatelessHandler';

function digPublishUrls(value: unknown): { url?: string; postId?: string } {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const urlKeys = ['publishedUrl', 'facebookPostUrl', 'externalUrl', 'permalink'];
  const idKeys = ['postId', 'externalPostId', 'facebookPostId'];
  let url: string | undefined;
  let postId: string | undefined;
  for (const k of urlKeys) {
    if (typeof obj[k] === 'string' && (obj[k] as string).trim()) {
      url = obj[k] as string;
      break;
    }
  }
  for (const k of idKeys) {
    if (typeof obj[k] === 'string' && (obj[k] as string).trim()) {
      postId = obj[k] as string;
      break;
    }
  }
  if (url || postId) return { url, postId };
  for (const v of Object.values(obj)) {
    const nested = digPublishUrls(v);
    if (nested.url || nested.postId) return nested;
  }
  return {};
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
  if (shouldUseStatelessPublish(agentJob)) {
    return runStatelessPublishSocialJob(agentJob, browser);
  }

  const pageFactory = {
    getPublishPage: (options?: { initialUrl?: string; mode?: 'cdp' | 'managed' }) =>
      browser.getPublishPage(options),
    beginCdpJob: () => browser.beginCdpJob('publish'),
    releaseCdpLock: () => browser.releaseCdpLock('publish'),
  };
  configureFacebookTimelineAdapterRuntime({ pageFactory });
  configureFacebookGroupAdapterRuntime({ pageFactory });

  const payload = (agentJob.payload || {}) as Record<string, unknown>;
  const publishJobId = String(payload.publishJobId || '').trim();
  if (!publishJobId) {
    throw new Error('publish_social missing payload.publishJobId');
  }

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

  const workerId = agentJob.claimedBy || 'worker';
  const attempt = await createAttemptStart({
    companyId: full.companyId,
    jobId: publishJobId,
    draftId: full.draftId,
    channelId: full.channelId,
    workerId,
    attemptNumber: full.attempts,
  });

  const startedAt = Date.now();

  try {
    const missionRunId =
      (typeof agentJob.missionRunId === 'string' && agentJob.missionRunId.trim())
      || (typeof payload.missionRunId === 'string' && payload.missionRunId.trim())
      || (typeof (full.result as Record<string, unknown> | null)?.missionRunId === 'string'
        ? String((full.result as Record<string, unknown>).missionRunId).trim()
        : '');

    const ensuredMissionRunId = missionRunId
      || (await startPublishMissionRun({
        publishJobId,
        companyId: full.companyId,
        triggerType: 'worker',
        triggeredBy: workerId,
      })).missionRunId;

    await markPreparing(publishJobId);
    await markPublishing(publishJobId);

    const workflowResult = await executePublishWorkflow({
      missionRunId: ensuredMissionRunId,
      publishJobId,
      jobId: agentJob.id,
      workerId,
      runtimeTarget: 'local_worker',
    });

    const jobAfterWorkflow = await getJobById(publishJobId);
    const jobResult = (jobAfterWorkflow?.result || {}) as Record<string, unknown>;
    const externalPostId = typeof jobResult.externalPostId === 'string' ? jobResult.externalPostId : undefined;
    const externalUrl = typeof jobResult.externalUrl === 'string' ? jobResult.externalUrl : undefined;

    if (workflowResult.stopped || workflowResult.stepsFailed > 0) {
      const jobAfterFail = await getJobById(publishJobId);
      const failResult = (jobAfterFail?.result || {}) as Record<string, unknown>;
      const verifyUnknown =
        failResult.publishOutcome === 'unknown' ||
        failResult.needsManualVerify === true ||
        failResult.publishClicked === true;
      const errorCode = verifyUnknown ? 'publish_verify_unknown' : 'browser_publish_failed';
      const message = verifyUnknown
        ? 'Publish click may have succeeded — verify unknown (will not republish)'
        : `Publish workflow failed (stepsFailed=${workflowResult.stepsFailed}, stopped=${workflowResult.stopped})`;
      await finishAttemptFailure(attempt.id, {
        status: 'failed',
        errorCode,
        errorMessage: message,
        responseJson: { workflow: workflowResult, result: failResult },
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      await failPublishJob(publishJobId, errorCode, message);
      return {
        ok: false,
        publishJobId,
        missionRunId: ensuredMissionRunId,
        errorCode,
        errorMessage: message,
        workflow: workflowResult,
        needsManualVerify: verifyUnknown,
      };
    }

    // Permalink lives in workflow step outputs (verify/capture), not SocialPublishJob.result yet.
    const stepRuns = await prisma.agentWorkflowStepRun.findMany({
      where: { missionRunId: ensuredMissionRunId, status: 'completed' },
      select: { output: true, stepType: true },
    });
    let fromStepsPostId = externalPostId;
    let fromStepsUrl = externalUrl;
    for (const sr of stepRuns) {
      const dug = digPublishUrls(sr.output);
      if (!fromStepsUrl && dug.url) fromStepsUrl = dug.url;
      if (!fromStepsPostId && dug.postId) fromStepsPostId = dug.postId;
    }

    const live = process.env.BROWSER_PUBLISH_LIVE === '1';
    const result: PublishResult = {
      ok: true,
      externalPostId: fromStepsPostId,
      externalUrl: fromStepsUrl,
      facebookPostId: fromStepsPostId,
      facebookPostUrl: fromStepsUrl,
      latencyMs: Math.max(0, Date.now() - startedAt),
      dryRun: !live,
      response: {
        workflow: workflowResult,
      },
    };

    await finishAttemptSuccess(attempt.id, {
      facebookPostId: result.facebookPostId,
      facebookPostUrl: result.facebookPostUrl,
      responseJson: result.response || result.raw,
      durationMs: result.latencyMs,
    });
    await completePublishJob(publishJobId, result);
    return { ok: true, publishJobId, missionRunId: ensuredMissionRunId, result };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Publisher threw';
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : /browser_verify_unknown|publish_verify_unknown/i.test(rawMessage)
          ? 'publish_verify_unknown'
          : /browser_composer_mismatch/i.test(rawMessage)
            ? 'browser_composer_mismatch'
            : /browser_already_on_feed/i.test(rawMessage)
              ? 'already_published'
              : 'unknown';
    const message = rawMessage;
    await finishAttemptFailure(attempt.id, {
      status: code === 'publish_timeout' ? 'timeout' : 'failed',
      errorCode: code,
      errorMessage: message,
    });
    await failPublishJob(publishJobId, code, message);
    return { ok: false, publishJobId, errorCode: code, errorMessage: message };
  } finally {
    // Belt-and-suspenders: cleanup step may be skipped on hard errors.
    pageFactory.releaseCdpLock();
  }
}
