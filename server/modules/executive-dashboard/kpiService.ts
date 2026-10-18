/**
 * Build Executive Command Center payload (H0.5.2) from real business data.
 */

import { prisma } from '../../prisma';
import type {
  AttentionItem,
  ExecutiveKpiCard,
  ExecutiveKpiDashboard,
  ExecutiveKpiTrend,
  RecommendationAction,
  SnapshotMetric,
} from './kpiTypes';

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function trendFrom(current: number, previous: number): {
  label: string | null;
  direction: ExecutiveKpiTrend;
} {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { label: null, direction: null };
  }
  if (previous === 0 && current === 0) return { label: '→ 0%', direction: 'flat' };
  if (previous === 0) return { label: '▲ new', direction: 'up' };
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta > 0) return { label: `▲ +${delta}%`, direction: 'up' };
  if (delta < 0) return { label: `▼ ${delta}%`, direction: 'down' };
  return { label: '→ 0%', direction: 'flat' };
}

function channelBucket(type: string): 'facebook' | 'threads' | 'instagram' | 'tiktok' | 'other' {
  const t = (type || '').toLowerCase();
  if (t.includes('thread')) return 'threads';
  if (t.includes('instagram') || t === 'ig') return 'instagram';
  if (t.includes('tiktok')) return 'tiktok';
  if (t.includes('facebook') || t === 'fb' || t.includes('meta')) return 'facebook';
  return 'other';
}

async function countBuyers(
  from: Date,
  to?: Date,
  mode: 'any' | 'qualified' = 'qualified',
): Promise<number> {
  const { readAcquisitionProfile } = await import('../lead-acquisition');
  const rows = await prisma.agentFinding.findMany({
    where: {
      status: { notIn: ['duplicate', 'dismissed'] },
      createdAt: to ? { gte: from, lt: to } : { gte: from },
    },
    select: { extractedData: true, source: { select: { name: true } } },
    take: 4000,
  });
  let n = 0;
  for (const row of rows) {
    const profile = readAcquisitionProfile(row.extractedData);
    if (!profile?.isBuyer) continue;
    if (mode === 'any') {
      n += 1;
      continue;
    }
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

async function buyerCampaignShare(from: Date): Promise<{
  topName: string | null;
  sharePct: number;
  total: number;
}> {
  const { readAcquisitionProfile } = await import('../lead-acquisition');
  const rows = await prisma.agentFinding.findMany({
    where: { status: { notIn: ['duplicate', 'dismissed'] }, createdAt: { gte: from } },
    select: { extractedData: true },
    take: 4000,
  });
  const byName = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const profile = readAcquisitionProfile(row.extractedData);
    if (!profile?.isBuyer) continue;
    total += 1;
    const name = profile.campaignMatch?.campaignName || 'Unmatched';
    byName.set(name, (byName.get(name) || 0) + 1);
  }
  let topName: string | null = null;
  let top = 0;
  for (const [name, count] of byName) {
    if (count > top) {
      top = count;
      topName = name;
    }
  }
  return { topName, sharePct: pct(top, Math.max(total, 1)), total };
}

async function countPublished(from: Date, to?: Date): Promise<number> {
  return prisma.socialPublishJob
    .count({
      where: {
        status: 'published',
        completedAt: to ? { gte: from, lt: to } : { gte: from },
      },
    })
    .catch(() => 0);
}

function statusLabel(status: 'Working' | 'Attention' | 'Degraded' | 'Offline'): string {
  if (status === 'Working') return 'Working Normally';
  if (status === 'Attention') return 'Needs Attention';
  if (status === 'Degraded') return 'Degraded';
  return 'Offline';
}

function buildSummary(input: {
  campaign: string | null;
  buyers: number;
  followUp: number;
  drafts: number;
  expectedTy: number | null;
  aiStatus: string;
}): string {
  const campPart = input.campaign
    ? `Chiến dịch: ${input.campaign}.`
    : 'Hệ thống chưa có chiến dịch tiếp thị nào đang chạy.';
  const rev =
    input.expectedTy != null && input.expectedTy > 0
      ? `${input.expectedTy} tỷ VND`
      : '0 tỷ VND';
  const buyerPart = input.buyers > 0
    ? `Đã phát hiện ${input.buyers} buyer tiềm năng hôm nay`
    : 'Hôm nay chưa có buyer mới';
  return `Executive Summary: ${campPart} ${buyerPart}, ${input.followUp} khách hàng cần follow-up, ${input.drafts} nội dung chờ duyệt. Doanh thu dự kiến: ${rev}. Trạng thái AI: ${input.aiStatus}.`;
}

export async function buildExecutiveKpiDashboard(): Promise<ExecutiveKpiDashboard> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600_000);
  const twoDaysAgo = new Date(now - 48 * 3600_000);
  const sevenAgo = new Date(now - 7 * 24 * 3600_000);
  const fourteenAgo = new Date(now - 14 * 24 * 3600_000);

  const [
    sales,
    decision,
    knowledge,
    knowledgePendingCount,
    feedback,
    marketing,
    campaigns,
    draftGroups,
    publishJobs,
    publishFailed,
    runningJobs,
    agentCounts,
    opsSnap,
    buyersTodayAny,
    buyersYesterdayAny,
    buyers7d,
    buyersPrev7d,
    qualifiedToday,
    qualifiedYesterday,
    qualified7d,
    qualifiedPrev7d,
    publishedToday,
    publishedYesterday,
    published7d,
    publishedPrev7d,
    campaignShare,
  ] = await Promise.all([
    import('../sales-layer')
      .then(m => m.getSalesPipelineMetrics({ sinceHours: 24 * 30 }))
      .catch(() => null),
    import('../decision-center')
      .then(m => m.getDecisionMetrics())
      .catch(() => null),
    import('../knowledge-base')
      .then(m => m.getKnowledgeHealth())
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
    import('../knowledge-base')
      .then(m => m.buildFeedbackCenterSnapshot())
      .catch(() => null),
    import('../marketing-org')
      .then(m => m.buildMarketingSnapshot({}))
      .catch(() => null),
    import('../planning')
      .then(m => m.listCampaigns({ limit: 100 }))
      .catch(() => [] as Awaited<ReturnType<typeof import('../planning').listCampaigns>>),
    prisma.socialPostDraft
      .groupBy({ by: ['status'], _count: { _all: true } })
      .catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    prisma.socialPublishJob
      .findMany({
        where: {
          OR: [
            { completedAt: { gte: dayAgo } },
            { status: { in: ['queued', 'claimed', 'running', 'failed', 'scheduled'] } },
          ],
        },
        select: {
          status: true,
          completedAt: true,
          scheduledAt: true,
          channel: { select: { type: true } },
        },
        take: 2000,
      })
      .catch(
        () =>
          [] as Array<{
            status: string;
            completedAt: Date | null;
            scheduledAt: Date | null;
            channel: { type: string } | null;
          }>,
      ),
    prisma.socialPublishJob.count({ where: { status: 'failed' } }).catch(() => 0),
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
    countBuyers(dayAgo, undefined, 'any').catch(() => 0),
    countBuyers(twoDaysAgo, dayAgo, 'any').catch(() => 0),
    countBuyers(sevenAgo, undefined, 'any').catch(() => 0),
    countBuyers(fourteenAgo, sevenAgo, 'any').catch(() => 0),
    countBuyers(dayAgo, undefined, 'qualified').catch(() => 0),
    countBuyers(twoDaysAgo, dayAgo, 'qualified').catch(() => 0),
    countBuyers(sevenAgo, undefined, 'qualified').catch(() => 0),
    countBuyers(fourteenAgo, sevenAgo, 'qualified').catch(() => 0),
    countPublished(dayAgo).catch(() => 0),
    countPublished(twoDaysAgo, dayAgo).catch(() => 0),
    countPublished(sevenAgo).catch(() => 0),
    countPublished(fourteenAgo, sevenAgo).catch(() => 0),
    buyerCampaignShare(dayAgo).catch(() => ({ topName: null, sharePct: 0, total: 0 })),
  ]);

  const machinesOnline = opsSnap?.fleet?.machinesOnline ?? null;
  const machinesOffline = opsSnap?.fleet?.machinesOffline ?? 0;
  const fleetHealth = opsSnap?.fleet?.healthScore ?? null;
  const runningCount = runningJobs.length || agentCounts?.runningJobs || 0;
  const failed24h = agentCounts?.jobsFailed24h ?? 0;
  const publishRetry = opsSnap?.publisher?.retry ?? publishFailed;

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
  for (const c of campaigns) {
    if (c.status === 'waiting_approval') campWaiting += 1;
    else if (runningStatuses.has(c.status)) campRunning += 1;
  }

  let aiStatus: 'Working' | 'Attention' | 'Degraded' | 'Offline' = 'Working';
  if (machinesOnline === 0 && (opsSnap?.fleet?.machinesTotal ?? 0) > 0) {
    aiStatus = 'Offline';
  } else if (
    (fleetHealth != null && fleetHealth < 60) ||
    (machinesOnline != null && machinesOffline > machinesOnline)
  ) {
    aiStatus = 'Degraded';
  } else if (failed24h > 0 || publishRetry > 0) {
    aiStatus = 'Attention';
  } else {
    aiStatus = 'Working';
  }

  const activeCampaigns = campaigns.filter(c => !['completed', 'rejected'].includes(c.status));
  const { deriveCampaignHealth } = await import('../planning');
  const campHealth = activeCampaigns.map(c => ({
    name: c.name,
    health: deriveCampaignHealth(c),
  }));
  const criticalCamps = campHealth.filter(c => c.health.level === 'critical');
  const warningCamps = campHealth.filter(c => c.health.level === 'warning');

  // Real Business Health strictly calculated from DB operational pillars:
  const pubSuccessRate = published7d + failed24h > 0
    ? pct(published7d, published7d + failed24h)
    : 100;
  const realKnowledgeCov = knowledge?.coveragePercent ?? (knowledgePendingCount === 0 ? 100 : Math.max(0, 100 - knowledgePendingCount * 10));
  const knowledgeCoverage = realKnowledgeCov;
  const activeCampCount = activeCampaigns.length;
  const healthyCamps = campHealth.filter(c => c.health.level === 'healthy').length;
  const campHealthRate = activeCampCount > 0 ? pct(healthyCamps, activeCampCount) : 100;
  const leadHealthRate = sales?.detected ? Math.min(100, Math.round((sales.qualified / Math.max(sales.detected, 1)) * 100)) : 80;

  const businessHealth = Math.round(
    (pubSuccessRate * 0.25 + realKnowledgeCov * 0.25 + campHealthRate * 0.25 + leadHealthRate * 0.25) * 10
  ) / 10;

  const confidence = Math.round(
    (realKnowledgeCov * 0.4 +
      Math.min(100, pct(decision?.qualified ?? 0, Math.max(decision?.scanned ?? 1, 1)) * 2) * 0.3 +
      businessHealth * 0.3) * 10
  ) / 10;

  const runningCamp = campaigns.find(c => runningStatuses.has(c.status));
  const currentCampaign = runningCamp ? runningCamp.name : null;

  const avg7dBuyers = buyers7d / 7;
  const avgPrev7dBuyers = buyersPrev7d / 7;
  const goalTarget = avgPrev7dBuyers > 0 || avg7dBuyers > 0
    ? Math.max(5, Math.ceil((avgPrev7dBuyers > 0 ? avgPrev7dBuyers : avg7dBuyers) * 1.5))
    : 10;
  const todayGoal = {
    label: 'Buyer',
    current: buyersTodayAny,
    target: goalTarget,
  };

  const { readDatabase } = await import('../../dbHelper');
  const db = readDatabase();
  const crmCustomers = db.customers || [];

  let pipelineTy = 0;
  let expectedRevenueTy = 0;
  let followUp = 0;

  for (const c of crmCustomers) {
    const rawBudget = Number(c.budget) || 0;
    const budgetTy = rawBudget > 1000 ? rawBudget / 1e9 : rawBudget;
    const stage = String(c.pipelineStage || c.status || 'new').toLowerCase();

    if (stage === 'lost' || stage === 'archived' || stage === 'inactive') continue;

    if (stage === 'contract' || stage === 'negotiating' || stage === 'interested') {
      pipelineTy += budgetTy;
      const prob = stage === 'contract' ? 0.8 : stage === 'negotiating' ? 0.5 : 0.2;
      expectedRevenueTy += budgetTy * prob;
    }

    if (c.needsFollowUp || c.status === 'urgent' || c.status === 'hot') {
      followUp += 1;
    }
  }

  pipelineTy = Math.round(pipelineTy * 10) / 10;
  expectedRevenueTy = Math.round(expectedRevenueTy * 10) / 10;

  const draftCount = (status: string) =>
    draftGroups.find(g => g.status === status)?._count._all ?? 0;
  const contentDraft = draftCount('draft');
  const contentApproved = draftCount('approved');
  const contentScheduled = draftCount('scheduled');
  const draftsWaiting = contentDraft + campWaiting;

  const byChannel = { facebook: 0, threads: 0, instagram: 0, tiktok: 0 };
  let failedToday = 0;
  let nextSchedule: Date | null = null;
  for (const job of publishJobs) {
    const bucket = channelBucket(job.channel?.type || '');
    if (
      job.status === 'published' &&
      job.completedAt &&
      job.completedAt >= dayAgo &&
      bucket !== 'other'
    ) {
      byChannel[bucket] += 1;
    }
    if (job.status === 'failed') failedToday += 1;
    if (
      (job.status === 'queued' || job.status === 'scheduled') &&
      job.scheduledAt &&
      job.scheduledAt.getTime() >= now
    ) {
      if (!nextSchedule || job.scheduledAt < nextSchedule) nextSchedule = job.scheduledAt;
    }
  }

  const pubToday =
    publishedToday ||
    (opsSnap?.publisher?.publishedToday ?? 0);

  const knowledgePending = knowledgePendingCount || 0;

  const buyerY = trendFrom(buyersTodayAny, buyersYesterdayAny);
  const buyer7 = trendFrom(buyers7d, buyersPrev7d);
  const qualY = trendFrom(qualifiedToday, qualifiedYesterday);
  const qual7 = trendFrom(qualified7d, qualifiedPrev7d);
  const pubY = trendFrom(pubToday, publishedYesterday);
  const pub7 = trendFrom(published7d, publishedPrev7d);

  const snapshot: SnapshotMetric[] = [
    {
      id: 'buyer_today',
      title: 'Buyer Today',
      value: String(buyersTodayAny),
      valueNumeric: buyersTodayAny,
      trendVsYesterday: buyerY.label,
      trendVs7d: buyer7.label,
      trendDirection: buyerY.direction,
      href: '/admin/agents/lead-center',
      hasData: true,
    },
    {
      id: 'qualified',
      title: 'Qualified',
      value: String(qualifiedToday),
      valueNumeric: qualifiedToday,
      trendVsYesterday: qualY.label,
      trendVs7d: qual7.label,
      trendDirection: qualY.direction,
      href: '/admin/agents/lead-center',
      hasData: true,
    },
    {
      id: 'pipeline',
      title: 'Pipeline',
      value: pipelineTy != null ? `${pipelineTy} tỷ` : 'No data',
      valueNumeric: pipelineTy,
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: null,
      href: '/admin/agents/lead-center',
      hasData: pipelineTy != null && pipelineTy > 0,
    },
    {
      id: 'expected_revenue',
      title: 'Expected Revenue',
      value: expectedRevenueTy != null ? `${expectedRevenueTy} tỷ` : 'No data',
      valueNumeric: expectedRevenueTy,
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: null,
      href: '/admin/agents/lead-center',
      hasData: expectedRevenueTy != null && expectedRevenueTy > 0,
    },
    {
      id: 'publishing_today',
      title: 'Publishing Today',
      value: String(pubToday),
      valueNumeric: pubToday,
      trendVsYesterday: pubY.label,
      trendVs7d: pub7.label,
      trendDirection: pubY.direction,
      href: '/admin/agents/publishing',
      hasData: true,
    },
    {
      id: 'running_campaigns',
      title: 'Running Campaigns',
      value: String(campRunning),
      valueNumeric: campRunning,
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: campRunning > 0 ? 'up' : 'flat',
      href: '/admin/agents/campaign-center',
      hasData: campaigns.length > 0,
    },
    {
      id: 'draft_waiting',
      title: 'Draft Waiting',
      value: String(draftsWaiting),
      valueNumeric: draftsWaiting,
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: draftsWaiting > 0 ? 'down' : 'up',
      href: '/admin/agents/publishing/drafts',
      hasData: true,
    },
    {
      id: 'attention',
      title: 'Attention',
      value: String(followUp + draftsWaiting + publishFailed + (knowledgePending || 0)),
      valueNumeric: followUp + draftsWaiting + publishFailed + (knowledgePending || 0),
      trendVsYesterday: null,
      trendVs7d: null,
      trendDirection: followUp + publishFailed > 0 ? 'down' : 'up',
      href: '/admin/agents',
      hasData: true,
    },
  ];

  const insights: string[] = [];
  if (criticalCamps.length || warningCamps.length) {
    insights.push(
      `Campaign Workspace: ${campHealth.filter(c => c.health.level === 'healthy').length} Healthy · ${warningCamps.length} Warning · ${criticalCamps.length} Critical.`,
    );
  } else if (activeCampaigns.length) {
    insights.push(`Campaign Workspace: ${activeCampaigns.length} campaign đang Healthy.`);
  }
  if (campaignShare.topName && campaignShare.topName !== 'Unmatched' && campaignShare.total > 0) {
    insights.push(
      `Chiến dịch "${campaignShare.topName}" mang lại ${campaignShare.sharePct}% buyer tiềm năng hôm nay.`,
    );
  } else if (currentCampaign && campaignShare.total > 0) {
    insights.push(
      `Đang thu thập ${campaignShare.total} buyer hôm nay — chiến dịch trọng tâm: ${currentCampaign}.`,
    );
  }
  if (feedback?.weekly?.topSource) {
    insights.push(`Nguồn "${feedback.weekly.topSource}" mang lại hiệu suất tốt nhất tuần này.`);
  }
  if (feedback?.weekly?.worstSource) {
    insights.push(`Nguồn "${feedback.weekly.worstSource}" hiệu suất thấp — nên tối ưu hóa hoặc giảm tần suất quét.`);
  }
  if (marketing?.trends?.[0]?.topic && marketing.trends[0].topic.length >= 3) {
    insights.push(`Xu hướng thị trường: Khu vực/Dự án "${marketing.trends[0].topic}" nhận được nhiều quan tâm.`);
  }
  if (knowledgeCoverage != null) {
    insights.push(`Độ phủ Knowledge Base đạt ${knowledgeCoverage}%.`);
  }
  if (byChannel.facebook + byChannel.threads + byChannel.instagram + byChannel.tiktok > 0) {
    const topCh = Object.entries(byChannel).sort((a, b) => b[1] - a[1])[0];
    if (topCh && topCh[1] > 0) {
      insights.push(`Kênh ${topCh[0]} dẫn đầu nội dung publish hôm nay (${topCh[1]} bài).`);
    }
  }
  if (pipelineTy != null && pipelineTy > 0) {
    insights.push(`Tổng giá trị pipeline tiềm năng từ cơ sở dữ liệu: ${pipelineTy} tỷ VND.`);
  }
  if (!insights.length) {
    insights.push('Hệ thống đang đồng bộ dữ liệu thị trường và khách hàng từ database.');
  }

  const recommendations: RecommendationAction[] = [];
  if (contentDraft > 0 || campWaiting > 0) {
    recommendations.push({
      id: 'approve_drafts',
      action: 'Approve',
      detail: `${contentDraft + campWaiting} Draft`,
      href: '/admin/agents/publishing/drafts',
    });
  }
  if (followUp > 0) {
    recommendations.push({
      id: 'follow_up',
      action: 'Follow-up',
      detail: `${followUp} Buyer`,
      href: '/admin/agents/lead-center',
    });
  }
  if (nextSchedule) {
    const hh = nextSchedule.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    recommendations.push({
      id: 'publish_slot',
      action: 'Publish',
      detail: hh,
      href: '/admin/agents/publishing',
    });
  } else if (contentApproved + contentScheduled > 0) {
    recommendations.push({
      id: 'schedule_publish',
      action: 'Publish',
      detail: `${contentApproved + contentScheduled} ready`,
      href: '/admin/agents/publishing',
    });
  }
  if ((knowledgePending || 0) > 0 || (knowledgeCoverage != null && knowledgeCoverage < 85)) {
    recommendations.push({
      id: 'review_knowledge',
      action: 'Review',
      detail: 'Knowledge',
      href: '/admin/agents/knowledge-center',
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      id: 'new_campaign',
      action: 'Start',
      detail: 'New Campaign',
      href: '/admin/agents/campaign-center',
    });
  }

  const attention: AttentionItem[] = [];
  if (criticalCamps.length) {
    attention.push({
      severity: 'critical',
      text: `Campaign Critical: ${criticalCamps.map(c => c.name).slice(0, 2).join(', ')}`,
      href: '/admin/agents/campaign-center',
    });
  } else if (warningCamps.length) {
    attention.push({
      severity: 'warning',
      text: `Campaign Warning: ${warningCamps.map(c => c.name).slice(0, 2).join(', ')}`,
      href: '/admin/agents/campaign-center',
    });
  }

  if (followUp > 0) {
    attention.push({
      severity: 'critical',
      text: `${followUp} buyer overdue follow-up`,
      href: '/admin/agents/lead-center',
    });
  }
  if (publishFailed > 0 || failedToday > 0) {
    attention.push({
      severity: 'critical',
      text: `${publishFailed || failedToday} publish failed`,
      href: '/admin/agents/publishing',
    });
  }
  if (draftsWaiting > 0) {
    attention.push({
      severity: 'warning',
      text: `${draftsWaiting} draft waiting approval`,
      href: '/admin/agents/publishing/drafts',
    });
  }
  if (aiStatus === 'Degraded' || aiStatus === 'Offline') {
    attention.push({
      severity: 'warning',
      text: `AI status ${statusLabel(aiStatus)}`,
      href: '/admin/agents',
    });
  }
  if (knowledgeCoverage != null && knowledgeCoverage >= 80) {
    attention.push({
      severity: 'info',
      text: `Knowledge coverage ${knowledgeCoverage}%`,
      href: '/admin/agents/knowledge-center',
    });
  } else if ((knowledgePending || 0) === 0 && followUp === 0 && draftsWaiting === 0) {
    attention.push({
      severity: 'info',
      text: 'Hệ thống ổn — không có điểm kẹt lớn',
      href: '/admin/agents',
    });
  }

  const quickActions = [
    { label: 'New Campaign', href: '/admin/agents/campaign-center' },
    { label: 'Generate Content', href: '/admin/agents/marketing-center' },
    { label: 'Review Buyers', href: '/admin/agents/lead-center' },
    { label: 'Schedule Publish', href: '/admin/agents/publishing' },
    { label: 'Research Market', href: '/admin/agents/decision-center' },
  ];

  const kpis: ExecutiveKpiCard[] = snapshot.map(s => ({
    id: s.id,
    title: s.title,
    bigNumber: s.value,
    trend: s.trendVsYesterday,
    trendDirection: s.trendDirection,
    miniStatus: [
      s.trendVsYesterday ? `Yesterday ${s.trendVsYesterday}` : 'Yesterday No data',
      s.trendVs7d ? `7d ${s.trendVs7d}` : '7d No data',
    ],
    href: s.href,
  }));

  return {
    version: 'h052_executive_command',
    generatedAt: new Date().toISOString(),
    summary: buildSummary({
      campaign: currentCampaign,
      buyers: buyersTodayAny,
      followUp,
      drafts: draftsWaiting,
      expectedTy: expectedRevenueTy,
      aiStatus: statusLabel(aiStatus),
    }),
    hero: {
      aiStatus,
      aiStatusLabel: statusLabel(aiStatus),
      businessHealth,
      todayGoal,
      expectedRevenueTy,
      currentCampaign,
      confidence,
    },
    snapshot,
    insights: insights.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
    attention,
    quickActions,
    kpis,
  };
}
