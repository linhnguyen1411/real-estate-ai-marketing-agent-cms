/**
 * Build 8 real AI business KPI cards for the main CMS Dashboard.
 */

import { prisma } from '../../prisma';
import type { ExecutiveKpiCard, ExecutiveKpiDashboard } from './kpiTypes';

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 48) return `${hours}h ${rem}m`;
  return `${Math.floor(hours / 24)}d`;
}

function channelBucket(type: string): 'facebook' | 'threads' | 'instagram' | 'tiktok' | 'other' {
  const t = (type || '').toLowerCase();
  if (t.includes('thread')) return 'threads';
  if (t.includes('instagram') || t === 'ig') return 'instagram';
  if (t.includes('tiktok')) return 'tiktok';
  if (t.includes('facebook') || t === 'fb' || t.includes('meta')) return 'facebook';
  return 'other';
}

async function countQualifiedBuyers(from: Date, to?: Date): Promise<number> {
  const { readAcquisitionProfile } = await import('../lead-acquisition');
  const rows = await prisma.agentFinding.findMany({
    where: {
      status: { notIn: ['duplicate'] },
      updatedAt: to ? { gte: from, lt: to } : { gte: from },
    },
    select: { extractedData: true },
    take: 3000,
  });
  let n = 0;
  for (const row of rows) {
    const profile = readAcquisitionProfile(row.extractedData);
    if (!profile?.isBuyer) continue;
    if (
      profile.pipelineStage === 'qualified' ||
      profile.pipelineStage === 'assigned' ||
      profile.pipelineStage === 'contacted' ||
      profile.pipelineStage === 'interested' ||
      profile.pipelineStage === 'negotiating' ||
      profile.pipelineStage === 'won'
    ) {
      n += 1;
    }
  }
  return n;
}

export async function buildExecutiveKpiDashboard(): Promise<ExecutiveKpiDashboard> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600_000);
  const twoDaysAgo = new Date(now - 48 * 3600_000);

  const [
    sales,
    decision,
    knowledgePending,
    campaigns,
    draftGroups,
    publishJobs,
    publishFailed,
    runningJobs,
    agentCounts,
    opsSnap,
    buyersToday,
    buyersYesterday,
  ] = await Promise.all([
    import('../sales-layer')
      .then(m => m.getSalesPipelineMetrics({ sinceHours: 24 * 30 }))
      .catch(() => null),
    import('../decision-center')
      .then(m => m.getDecisionMetrics())
      .catch(() => null),
    import('../knowledge-base')
      .then(async m => {
        const [suggestions, unknown] = await Promise.all([
          m.listSuggestions('pending'),
          m.listUnknownTerms(),
        ]);
        return (suggestions?.length || 0) + (unknown?.length || 0);
      })
      .catch(() => 0),
    import('../planning')
      .then(m => m.listCampaigns({ limit: 100 }))
      .catch(() => [] as Awaited<ReturnType<typeof import('../planning').listCampaigns>>),
    prisma.socialPostDraft
      .groupBy({ by: ['status'], _count: { _all: true } })
      .catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    prisma.socialPublishJob
      .findMany({
        where: {
          OR: [{ completedAt: { gte: dayAgo } }, { status: { in: ['queued', 'claimed', 'running', 'failed'] } }],
        },
        select: {
          status: true,
          completedAt: true,
          channel: { select: { type: true } },
        },
        take: 2000,
      })
      .catch(() => [] as Array<{ status: string; completedAt: Date | null; channel: { type: string } | null }>),
    prisma.socialPublishJob
      .count({ where: { status: 'failed' } })
      .catch(() => 0),
    prisma.agentJob
      .findMany({
        where: { status: { in: ['claimed', 'running'] } },
        select: { type: true, startedAt: true, createdAt: true },
        orderBy: { startedAt: 'asc' },
        take: 20,
      })
      .catch(() => [] as Array<{ type: string; startedAt: Date | null; createdAt: Date }>),
    import('../../agent/agentDb')
      .then(m =>
        m.getAgentDashboardCounts({
          id: 'system',
          name: 'System',
          email: 'system@local',
          role: 'owner',
        }),
      )
      .catch(() => null),
    import('../control-plane/operationsService')
      .then(m => m.opsGetOperationsMetrics({ refresh: false, reason: 'dashboard' }))
      .catch(() => null),
    countQualifiedBuyers(dayAgo).catch(() => 0),
    countQualifiedBuyers(twoDaysAgo, dayAgo).catch(() => 0),
  ]);

  const machinesOnline = opsSnap?.fleet?.machinesOnline ?? null;
  const healthScore = opsSnap?.fleet?.healthScore ?? null;
  const runningCount = runningJobs.length || agentCounts?.runningJobs || 0;
  const failed24h = agentCounts?.jobsFailed24h ?? 0;
  const publishRetry = opsSnap?.publisher?.retry ?? publishFailed;

  let aiStatus: 'Working' | 'Attention' | 'Degraded' | 'Offline' = 'Working';
  const machinesOffline = opsSnap?.fleet?.machinesOffline ?? 0;
  if (machinesOnline === 0) aiStatus = 'Offline';
  else if ((healthScore != null && healthScore < 60) || (machinesOnline != null && machinesOffline > machinesOnline)) {
    aiStatus = 'Degraded';
  } else if (failed24h > 0 || publishRetry > 0) aiStatus = 'Attention';
  else aiStatus = 'Working';

  const currentCampaign =
    campaigns.find(c => !['completed', 'rejected'].includes(c.status))?.name ||
    sales?.byCampaign?.[0]?.name ||
    '—';
  const currentTask =
    runningJobs[0]?.type ||
    (opsSnap?.scanner?.running ? 'scan_sources' : null) ||
    (aiStatus === 'Working' && runningCount === 0 ? 'idle' : '—');
  const oldestStart = runningJobs[0]?.startedAt || runningJobs[0]?.createdAt;
  const runningTime = oldestStart ? formatDuration(now - new Date(oldestStart).getTime()) : '—';

  const buyerDelta = buyersToday - buyersYesterday;
  const buyerTrend =
    buyerDelta > 0
      ? `▲ +${buyerDelta} vs yesterday`
      : buyerDelta < 0
        ? `▼ ${buyerDelta} vs yesterday`
        : '→ 0 vs yesterday';

  const runningStatuses = new Set([
    'researching',
    'mission_planning',
    'finding_leads',
    'content_drafting',
    'publishing',
    'monitoring',
    'optimizing',
  ]);
  let campRunning = 0;
  let campWaiting = 0;
  let campCompleted = 0;
  let campPaused = 0;
  for (const c of campaigns) {
    if (c.status === 'waiting_approval') campWaiting += 1;
    else if (c.status === 'completed') campCompleted += 1;
    else if (c.status === 'planning' || c.status === 'rejected') campPaused += 1;
    else if (runningStatuses.has(c.status)) campRunning += 1;
    else campPaused += 1;
  }

  const draftCount = (status: string) =>
    draftGroups.find(g => g.status === status)?._count._all ?? 0;
  const contentDraft = draftCount('draft');
  const contentApproved = draftCount('approved');
  const contentScheduled = draftCount('scheduled');
  const contentPublishedToday = publishJobs.filter(
    j => j.status === 'published' && j.completedAt && j.completedAt >= dayAgo,
  ).length;

  const byChannel = { facebook: 0, threads: 0, instagram: 0, tiktok: 0 };
  let publishedToday = 0;
  let failedToday = 0;
  for (const job of publishJobs) {
    const bucket = channelBucket(job.channel?.type || '');
    const isToday =
      job.status === 'published' && job.completedAt && job.completedAt >= dayAgo;
    if (isToday && bucket !== 'other') {
      byChannel[bucket] += 1;
      publishedToday += 1;
    }
    if (job.status === 'failed') failedToday += 1;
  }
  // Prefer ops publishedToday when DB channel split is empty but ops has total
  if (!publishedToday && (opsSnap?.publisher?.publishedToday ?? 0) > 0) {
    publishedToday = opsSnap!.publisher.publishedToday;
  }

  const scanned = decision?.scanned ?? 0;
  const candidates = decision?.rulePassed ?? 0;
  const aiReviewed = decision?.aiReviewed ?? 0;
  const qualified = decision?.qualified ?? buyersToday;
  const conversion = pct(qualified, Math.max(scanned, 1));

  const needApproval =
    campWaiting + contentDraft + (opsSnap?.publisher?.queue ?? 0);
  const followUp = sales?.needFollowUp ?? 0;
  const attentionTotal = needApproval + followUp + publishFailed + knowledgePending;

  const kpis: ExecutiveKpiCard[] = [
    {
      id: 'ai_status',
      title: 'AI Status',
      bigNumber: aiStatus,
      trend: healthScore != null ? `Health ${healthScore}/100` : null,
      trendDirection: aiStatus === 'Working' ? 'up' : aiStatus === 'Offline' ? 'down' : 'flat',
      miniStatus: [
        `Campaign ${currentCampaign}`,
        `Task ${currentTask}`,
        `Running ${runningTime}`,
      ],
      href: '/admin/agents',
    },
    {
      id: 'todays_buyers',
      title: "Today's Buyers",
      bigNumber: String(buyersToday),
      trend: buyerTrend,
      trendDirection: buyerDelta > 0 ? 'up' : buyerDelta < 0 ? 'down' : 'flat',
      miniStatus: [`Qualified today ${buyersToday}`, `Yesterday ${buyersYesterday}`],
      href: '/admin/agents/lead-center',
    },
    {
      id: 'sales_pipeline',
      title: 'Sales Pipeline',
      bigNumber: `${sales?.pipelineValueTy ?? 0} tỷ`,
      trend: `Expected ${sales?.expectedRevenueTy ?? 0} tỷ`,
      trendDirection: (sales?.won ?? 0) > (sales?.lost ?? 0) ? 'up' : 'flat',
      miniStatus: [`Won ${sales?.won ?? 0}`, `Lost ${sales?.lost ?? 0}`],
      href: '/admin/agents/lead-center',
    },
    {
      id: 'active_campaigns',
      title: 'Active Campaigns',
      bigNumber: String(campRunning),
      trend: campWaiting ? `${campWaiting} waiting approval` : `${campCompleted} completed`,
      trendDirection: campRunning > 0 ? 'up' : 'flat',
      miniStatus: [
        `Running ${campRunning}`,
        `Waiting ${campWaiting}`,
        `Completed ${campCompleted}`,
        `Paused ${campPaused}`,
      ],
      href: '/admin/agents/campaign-center',
    },
    {
      id: 'content_engine',
      title: 'Content Engine',
      bigNumber: String(contentDraft + contentApproved + contentScheduled),
      trend: `Published today ${contentPublishedToday}`,
      trendDirection: contentPublishedToday > 0 ? 'up' : 'flat',
      miniStatus: [
        `Draft ${contentDraft}`,
        `Approved ${contentApproved}`,
        `Scheduled ${contentScheduled}`,
        `Published today ${contentPublishedToday}`,
      ],
      href: '/admin/agents/publishing/drafts',
    },
    {
      id: 'publishing',
      title: 'Publishing',
      bigNumber: String(publishedToday),
      trend:
        failedToday || publishFailed
          ? `${Math.max(publishedToday - failedToday, 0)} success · ${failedToday || publishFailed} failed`
          : `${publishedToday} success`,
      trendDirection: (failedToday || publishFailed) > 0 ? 'down' : publishedToday > 0 ? 'up' : 'flat',
      miniStatus: [
        `FB ${byChannel.facebook}`,
        `Threads ${byChannel.threads}`,
        `IG ${byChannel.instagram}`,
        `TikTok ${byChannel.tiktok}`,
        `Failed ${failedToday || publishFailed}`,
      ],
      href: '/admin/agents/publishing',
    },
    {
      id: 'lead_acquisition',
      title: 'Lead Acquisition',
      bigNumber: String(qualified),
      trend: `Conversion ${conversion}%`,
      trendDirection: conversion >= 10 ? 'up' : 'flat',
      miniStatus: [
        `Scanned ${scanned}`,
        `Candidates ${candidates}`,
        `AI Reviewed ${aiReviewed}`,
        `Qualified ${qualified}`,
      ],
      href: '/admin/agents/decision-center',
    },
    {
      id: 'attention',
      title: 'Attention',
      bigNumber: String(attentionTotal),
      trend: attentionTotal > 0 ? 'Needs action' : 'Clear',
      trendDirection: attentionTotal > 0 ? 'down' : 'up',
      miniStatus: [
        `Need approval ${needApproval}`,
        `Follow-up overdue ${followUp}`,
        `Publish failed ${publishFailed}`,
        `Knowledge review ${knowledgePending}`,
      ],
      href: '/admin/agents',
    },
  ];

  return {
    version: 'h051_executive_kpis',
    generatedAt: new Date().toISOString(),
    kpis,
  };
}
