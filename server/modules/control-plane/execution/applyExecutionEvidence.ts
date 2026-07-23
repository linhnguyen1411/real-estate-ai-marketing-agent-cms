/**
 * G1 — Apply execution evidence returned by stateless agents (Control Plane / CMS only).
 * H0 fix: also finalize SocialPublishJob from publish evidence (was missing → job stuck queued).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma';
import type { ExecutionEvidence } from './jobPayloadContract';

export async function applyExecutionEvidence(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const evidence = result.evidence as ExecutionEvidence | undefined;
  if (!evidence && !result.publishJobId) return;

  if (Array.isArray(evidence?.sourcePatches)) {
    for (const patch of evidence!.sourcePatches) {
      if (!patch?.sourceId) continue;
      const data: Prisma.AgentSourceUpdateInput = {};
      if (patch.checkpoint !== undefined) data.checkpoint = patch.checkpoint as Prisma.InputJsonValue;
      if (patch.lastError !== undefined) data.lastError = patch.lastError;
      if (patch.nextScanAt) data.nextScanAt = new Date(patch.nextScanAt);
      if (patch.lastScannedAt) data.lastScannedAt = new Date(patch.lastScannedAt);
      if (Object.keys(data).length === 0) continue;
      await prisma.agentSource.update({ where: { id: patch.sourceId }, data }).catch(() => undefined);
    }
  }

  await applyPublishEvidence(jobId, result, evidence);
}

async function applyPublishEvidence(
  agentJobId: string,
  result: Record<string, unknown>,
  evidence: ExecutionEvidence | undefined,
): Promise<void> {
  const publishFromEvidence =
    evidence?.publishResult && typeof evidence.publishResult === 'object'
      ? (evidence.publishResult as Record<string, unknown>)
      : null;
  const merged = { ...result, ...(publishFromEvidence || {}) };

  const publishJobId = String(merged.publishJobId || '').trim();
  if (!publishJobId) return;

  const { completePublishJob, failPublishJob, getJobById, claimPublishJob } = await import(
    '../../social-publishing/jobService'
  );

  const social = await getJobById(publishJobId);
  if (!social) return;
  if (social.status === 'published') return;

  if (merged.dryRun === true || merged.skipped === true) {
    return;
  }

  const workerId =
    String(merged.workerId || social.claimedBy || 'stateless-agent').trim() || 'stateless-agent';

  // Ensure job leaves queued before complete (stateless path never called claimPublishJob).
  if (social.status === 'queued' || social.status === 'failed') {
    try {
      await claimPublishJob(publishJobId, workerId);
    } catch {
      /* channel lock — leave for next tick */
      return;
    }
  }

  if (merged.ok === false) {
    await failPublishJob(
      publishJobId,
      String(merged.errorCode || 'browser_publish_failed'),
      String(merged.errorMessage || merged.error || 'Stateless publish failed'),
    );
    return;
  }

  if (merged.ok === true || publishFromEvidence) {
    const { isSyntheticExternalPostId } = await import('../../social-publishing/publishIdempotency');
    const rawPostId =
      typeof merged.externalPostId === 'string'
        ? merged.externalPostId
        : typeof merged.postId === 'string'
          ? merged.postId
          : undefined;
    // Never invent agent:{jobId} — UI turns that into facebook.com/agent:… junk links.
    const externalPostId =
      rawPostId && !isSyntheticExternalPostId(rawPostId) ? rawPostId : undefined;
    const externalUrl =
      typeof merged.externalUrl === 'string'
        ? merged.externalUrl
        : typeof merged.publishedUrl === 'string'
          ? merged.publishedUrl
          : typeof merged.permalink === 'string'
            ? merged.permalink
            : undefined;

    await completePublishJob(publishJobId, {
      ok: true,
      externalPostId,
      externalUrl: externalUrl || undefined,
      raw: { ...merged, agentJobId },
    });
  }
}
