/**
 * Campaign Engine — multi-destination fan-out.
 * Creates one SocialPublishJob (+ MissionRun/AgentJob) per target.
 * Does not change Timeline/Group adapters or Browser Runtime.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { resolveDestinationKeyFromChannel } from './browser/destinationRegistry';
import { createPublishJob, enqueueAgentJobForPublishJob } from './jobService';
import { appendAuditLog } from './auditService';
import {
  buildCampaignExecutionPlan,
  buildCampaignProgress,
  classifyCampaignRunStatus,
  mapPublishJobToTargetStatus,
  parseDestinationChannelIds,
  type CampaignExecutionPlan,
  type CampaignProgress,
  type CampaignRunStatus,
} from './campaignTypes';

export * from './campaignTypes';

function extractPermalink(jobResult: unknown): string | null {
  if (!jobResult || typeof jobResult !== 'object') return null;
  const r = jobResult as Record<string, unknown>;
  for (const key of ['publishedUrl', 'permalink', 'facebookPostUrl', 'externalPostUrl']) {
    if (typeof r[key] === 'string' && r[key]) return r[key] as string;
  }
  const evidence = r.evidence;
  if (evidence && typeof evidence === 'object') {
    const e = evidence as Record<string, unknown>;
    if (typeof e.publishedUrl === 'string') return e.publishedUrl;
  }
  return null;
}

function extractMissionRunId(jobResult: unknown): string | null {
  if (!jobResult || typeof jobResult !== 'object') return null;
  const r = jobResult as Record<string, unknown>;
  return typeof r.missionRunId === 'string' ? r.missionRunId : null;
}

export async function createCampaign(input: {
  companyId?: string | null;
  name: string;
  draftId: string;
  channelIds: string[];
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const draft = await prisma.socialPostDraft.findUnique({ where: { id: input.draftId } });
  if (!draft) throw new Error('Draft not found');

  const channelIds = [...new Set(input.channelIds.map(id => String(id).trim()).filter(Boolean))];
  if (channelIds.length === 0) {
    throw new Error('Campaign requires at least one destination channel');
  }

  const channels = await prisma.socialChannel.findMany({
    where: { id: { in: channelIds } },
    select: { id: true },
  });
  if (channels.length !== channelIds.length) {
    throw new Error('One or more destination channels not found');
  }

  const campaign = await prisma.socialCampaign.create({
    data: {
      companyId: input.companyId ?? draft.companyId,
      name: input.name.trim() || 'Untitled campaign',
      draftId: input.draftId,
      status: 'active',
      destinationChannelIds: channelIds,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      createdBy: input.createdBy ?? null,
    },
  });

  await appendAuditLog({
    companyId: campaign.companyId,
    entityType: 'SocialCampaign',
    entityId: campaign.id,
    action: 'campaign_created',
    actor: input.createdBy ?? null,
    metadata: { channelIds, draftId: input.draftId },
  });

  return campaign;
}

export async function buildCampaignPlanForCampaign(
  campaignId: string,
  scheduledAt = new Date(),
): Promise<CampaignExecutionPlan> {
  const campaign = await prisma.socialCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  const channelIds = parseDestinationChannelIds(campaign.destinationChannelIds);
  const channels = await prisma.socialChannel.findMany({
    where: { id: { in: channelIds } },
  });
  const byId = new Map(channels.map(c => [c.id, c]));

  const destinationKeys = channelIds.map(id => {
    const ch = byId.get(id);
    if (!ch) return null;
    return resolveDestinationKeyFromChannel({
      type: ch.type,
      executionMode: ch.executionMode,
      config: ch.config,
    });
  });

  return buildCampaignExecutionPlan({
    campaignId: campaign.id,
    draftId: campaign.draftId,
    channelIds,
    destinationKeys,
    scheduledAt,
  });
}

/**
 * Start a campaign run: create targets + SocialPublishJobs, enqueue due jobs.
 * Each destination gets its own job / mission / evidence path.
 */
export async function startCampaignRun(input: {
  campaignId: string;
  triggeredBy?: string | null;
  triggerType?: string;
  scheduledAt?: Date;
  /** When true (default), enqueue AgentJobs for due publish jobs immediately */
  enqueueNow?: boolean;
}) {
  const campaign = await prisma.socialCampaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'archived') {
    throw new Error('Cannot start archived campaign');
  }

  const scheduledAt = input.scheduledAt ?? new Date();
  const plan = await buildCampaignPlanForCampaign(campaign.id, scheduledAt);
  if (plan.targets.length === 0) {
    throw new Error('Campaign has no destinations');
  }

  const run = await prisma.socialCampaignRun.create({
    data: {
      companyId: campaign.companyId,
      campaignId: campaign.id,
      status: 'queued',
      triggerType: input.triggerType ?? 'manual',
      triggeredBy: input.triggeredBy ?? null,
      scheduledAt,
      startedAt: new Date(),
      progress: {
        total: plan.targets.length,
        completed: 0,
        failed: 0,
        pending: plan.targets.length,
        publishing: 0,
        skipped: 0,
      },
    },
  });

  const enqueueNow = input.enqueueNow !== false;
  const targetResults: Array<{
    targetId: string;
    channelId: string;
    destinationKey: string | null;
    publishJobId: string | null;
    status: string;
    error?: string;
  }> = [];

  for (const item of plan.targets) {
    try {
      const job = await createPublishJob({
        companyId: campaign.companyId,
        draftId: campaign.draftId,
        channelId: item.channelId,
        scheduledAt,
        actor: input.triggeredBy ?? null,
      });

      let missionRunId: string | null = extractMissionRunId(job.result);
      let targetStatus = mapPublishJobToTargetStatus(job.status);

      if (enqueueNow && job.status === 'queued' && scheduledAt.getTime() <= Date.now() + 1000) {
        const created = await enqueueAgentJobForPublishJob(job);
        if (created) {
          const refreshed = await prisma.socialPublishJob.findUnique({ where: { id: job.id } });
          missionRunId = extractMissionRunId(refreshed?.result) ?? missionRunId;
          targetStatus = mapPublishJobToTargetStatus(refreshed?.status || job.status);
        }
      }

      const target = await prisma.socialCampaignTarget.create({
        data: {
          companyId: campaign.companyId,
          campaignRunId: run.id,
          channelId: item.channelId,
          destinationKey: item.destinationKey,
          sortOrder: item.sortOrder,
          status: targetStatus === 'pending' ? 'queued' : targetStatus,
          publishJobId: job.id,
          missionRunId,
          attempts: job.attempts,
        },
      });

      targetResults.push({
        targetId: target.id,
        channelId: item.channelId,
        destinationKey: item.destinationKey,
        publishJobId: job.id,
        status: target.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const target = await prisma.socialCampaignTarget.create({
        data: {
          companyId: campaign.companyId,
          campaignRunId: run.id,
          channelId: item.channelId,
          destinationKey: item.destinationKey,
          sortOrder: item.sortOrder,
          status: 'failed',
          errorCode: 'campaign_target_enqueue_failed',
          errorMessage: message,
        },
      });
      targetResults.push({
        targetId: target.id,
        channelId: item.channelId,
        destinationKey: item.destinationKey,
        publishJobId: null,
        status: 'failed',
        error: message,
      });
    }
  }

  const refreshed = await refreshCampaignRunProgress(run.id);

  await appendAuditLog({
    companyId: campaign.companyId,
    entityType: 'SocialCampaignRun',
    entityId: run.id,
    action: 'campaign_run_started',
    actor: input.triggeredBy ?? null,
    metadata: {
      campaignId: campaign.id,
      planTargetCount: plan.targets.length,
      results: targetResults,
    },
  });

  return {
    campaign,
    run: refreshed.run,
    plan,
    progress: refreshed.progress,
    targets: refreshed.targets,
    targetResults,
  };
}

/** Sync target rows from linked SocialPublishJobs and recompute run status. */
export async function refreshCampaignRunProgress(campaignRunId: string): Promise<{
  run: {
    id: string;
    status: CampaignRunStatus;
    progress: CampaignProgress;
    completedAt: Date | null;
  };
  progress: CampaignProgress;
  targets: Array<{
    id: string;
    channelId: string;
    destinationKey: string | null;
    status: string;
    publishJobId: string | null;
    missionRunId: string | null;
    permalink: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}> {
  const run = await prisma.socialCampaignRun.findUnique({
    where: { id: campaignRunId },
    include: { targets: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!run) throw new Error('Campaign run not found');

  const jobIds = run.targets.map(t => t.publishJobId).filter((id): id is string => Boolean(id));
  const jobs = jobIds.length
    ? await prisma.socialPublishJob.findMany({ where: { id: { in: jobIds } } })
    : [];
  const jobById = new Map(jobs.map(j => [j.id, j]));

  for (const target of run.targets) {
    if (!target.publishJobId) continue;
    const job = jobById.get(target.publishJobId);
    if (!job) continue;

    const nextStatus = mapPublishJobToTargetStatus(job.status);
    const permalink = extractPermalink(job.result);
    const missionRunId = extractMissionRunId(job.result);

    await prisma.socialCampaignTarget.update({
      where: { id: target.id },
      data: {
        status: nextStatus,
        attempts: job.attempts,
        missionRunId: missionRunId ?? target.missionRunId,
        permalink: permalink ?? target.permalink,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        result: job.result === null ? undefined : (job.result as Prisma.InputJsonValue),
      },
    });
  }

  const targets = await prisma.socialCampaignTarget.findMany({
    where: { campaignRunId },
    orderBy: { sortOrder: 'asc' },
  });

  const progress = buildCampaignProgress(targets);
  const status = classifyCampaignRunStatus(progress, { started: Boolean(run.startedAt) });
  const terminal = ['completed', 'failed', 'partial_success', 'cancelled'].includes(status);

  const updated = await prisma.socialCampaignRun.update({
    where: { id: campaignRunId },
    data: {
      status,
      progress: progress as unknown as Prisma.InputJsonValue,
      completedAt: terminal ? run.completedAt ?? new Date() : null,
    },
  });

  return {
    run: {
      id: updated.id,
      status: updated.status as CampaignRunStatus,
      progress,
      completedAt: updated.completedAt,
    },
    progress,
    targets: targets.map(t => ({
      id: t.id,
      channelId: t.channelId,
      destinationKey: t.destinationKey,
      status: t.status,
      publishJobId: t.publishJobId,
      missionRunId: t.missionRunId,
      permalink: t.permalink,
      errorCode: t.errorCode,
      errorMessage: t.errorMessage,
    })),
  };
}

export async function getCampaignRun(campaignRunId: string) {
  return refreshCampaignRunProgress(campaignRunId);
}

/** List campaigns for UI (latest run snapshot only). */
export async function listCampaigns(input: {
  companyId?: string | null;
  status?: string;
  limit?: number;
}) {
  return prisma.socialCampaign.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: {
      draft: { select: { id: true, title: true, status: true } },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          progress: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
}

/** Full campaign detail for Open Campaign UI. */
export async function getCampaign(campaignId: string) {
  const campaign = await prisma.socialCampaign.findUnique({
    where: { id: campaignId },
    include: {
      draft: { select: { id: true, title: true, status: true, body: true } },
      runs: {
        orderBy: { createdAt: 'desc' },
        include: {
          targets: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });
  if (!campaign) return null;

  // Refresh progress for non-terminal latest run so UI sees live stats
  const latest = campaign.runs[0];
  if (latest && !['completed', 'failed', 'partial_success', 'cancelled'].includes(latest.status)) {
    await refreshCampaignRunProgress(latest.id);
    return prisma.socialCampaign.findUnique({
      where: { id: campaignId },
      include: {
        draft: { select: { id: true, title: true, status: true, body: true } },
        runs: {
          orderBy: { createdAt: 'desc' },
          include: {
            targets: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }

  return campaign;
}
