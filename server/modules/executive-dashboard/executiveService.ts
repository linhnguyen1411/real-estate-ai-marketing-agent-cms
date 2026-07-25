/**
 * Compose executive snapshot from existing metrics (read-only).
 */

import type { ExecutiveSnapshot, ExecutiveTask } from './types';

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export async function buildExecutiveSnapshot(): Promise<ExecutiveSnapshot> {
  const [lead, sales, decision, knowledge, marketing, feedback, agentDash, opsSnap] =
    await Promise.all([
      import('../lead-acquisition')
        .then(m => m.getLeadAcquisitionMetrics({ sinceHours: 24 }))
        .catch(() => null),
      import('../sales-layer')
        .then(m => m.getSalesPipelineMetrics({ sinceHours: 24 * 30 }))
        .catch(() => null),
      import('../decision-center')
        .then(m => m.getDecisionMetrics())
        .catch(() => null),
      import('../knowledge-base')
        .then(m => m.getKnowledgeHealth())
        .catch(() => null),
      import('../marketing-org')
        .then(m => m.buildMarketingSnapshot({}))
        .catch(() => null),
      import('../knowledge-base')
        .then(m => m.buildFeedbackCenterSnapshot())
        .catch(() => null),
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
    ]);

  const health =
    Math.round(
      ((opsSnap?.fleet?.healthScore ?? 90) * 0.4 +
        (knowledge?.coveragePercent ?? 90) * 0.3 +
        (marketing?.health?.healthScore ?? 90) * 0.3) *
        10,
    ) / 10;

  const runningJobs = agentDash?.runningJobs ?? opsSnap?.scanner?.running ?? 0;
  const queued = agentDash?.queuedJobs ?? opsSnap?.publisher?.queue ?? 0;
  const aiStatus =
    runningJobs > 0
      ? 'Working'
      : queued > 0
        ? 'Queued'
        : agentDash?.jobsFailed24h
          ? 'Attention'
          : 'Idle';

  const campaignName =
    sales?.byCampaign?.[0]?.name || marketing?.packs?.[0]?.seedTopic || 'Mai Đăng Chơn';

  const buyer = lead?.buyerCandidates ?? sales?.urgentBuyers ?? 0;
  const qualified = lead?.qualifiedBuyers ?? sales?.qualified ?? 0;
  const appointments = (sales?.appointment ?? 0) + (sales?.negotiating ?? 0);
  const pipelineTy = sales?.pipelineValueTy ?? 0;
  const expectedRevenueTy = sales?.expectedRevenueTy ?? 0;

  const active: ExecutiveTask[] = [];
  const waitingApproval: ExecutiveTask[] = [];

  if ((opsSnap?.scanner?.running ?? 0) > 0 || runningJobs > 0) {
    active.push({
      id: 'scan',
      title: 'Scan Facebook / Sources',
      status: 'running',
      progress: 55,
      durationLabel: 'live',
      machine: 'local-worker',
    });
  } else {
    active.push({
      id: 'scan',
      title: 'Scan Facebook / Sources',
      status: 'done',
      progress: 100,
      durationLabel: 'today',
      machine: '—',
    });
  }

  active.push({
    id: 'research',
    title: 'Research Market',
    status: (decision?.scanned ?? 0) > 0 ? 'done' : 'idle',
    progress: (decision?.scanned ?? 0) > 0 ? 100 : 0,
    durationLabel: 'rules',
    machine: 'decision-engine',
  });
  active.push({
    id: 'analyze',
    title: 'Analyze Competitors / Leads',
    status: (decision?.aiReviewed ?? 0) > 0 ? 'done' : runningJobs ? 'running' : 'idle',
    progress: pct(decision?.aiReviewed ?? 0, Math.max(decision?.scanned ?? 1, 1)),
    durationLabel: 'gated AI',
    machine: 'ai-gateway',
  });
  active.push({
    id: 'content',
    title: 'Generate Content',
    status: (marketing?.packs?.length ?? 0) > 0 ? 'done' : 'idle',
    progress: (marketing?.packs?.length ?? 0) > 0 ? 100 : 10,
    durationLabel: 'marketing',
    machine: 'marketing-org',
  });

  if ((opsSnap?.publisher?.queue ?? 0) > 0) {
    waitingApproval.push({
      id: 'pub_fb',
      title: 'Publish Facebook',
      status: 'waiting',
      progress: 0,
      durationLabel: `queue ${opsSnap!.publisher.queue}`,
      machine: 'publisher',
    });
  }
  if ((marketing?.health?.needReply ?? 0) > 0) {
    waitingApproval.push({
      id: 'care',
      title: 'Social Care Replies',
      status: 'waiting',
      progress: 0,
      durationLabel: `${marketing!.health.needReply} waiting`,
      machine: 'marketing',
    });
  }
  waitingApproval.push({
    id: 'threads',
    title: 'Publish Threads',
    status: 'waiting',
    progress: 0,
    durationLabel: 'approval',
    machine: 'publisher',
  });
  waitingApproval.push({
    id: 'video',
    title: 'Video Script',
    status: 'waiting',
    progress: 0,
    durationLabel: 'draft',
    machine: 'content-factory',
  });

  const scanned = decision?.scanned ?? agentDash?.postsNewLastScans ?? 0;
  const candidates = decision?.rulePassed ?? lead?.buyerCandidates ?? 0;
  const aiReviewed = decision?.aiReviewed ?? 0;
  const funnelQualified = decision?.qualified ?? qualified;
  const salesCount = sales?.detected ?? lead?.assigned ?? 0;
  const won = sales?.won ?? lead?.converted ?? 0;

  const campaigns = (sales?.byCampaign || []).slice(0, 6).map(c => ({
    name: c.name || 'Campaign',
    status: c.leads > 0 ? 'Running' : 'Paused',
    buyers: c.qualified || c.leads || 0,
    roi: c.closed >= 3 ? 'A' : c.leads >= 5 ? 'B' : 'C',
    pipelineTy: c.pipelineValueTy ?? 0,
    content: marketing?.packs?.length ?? 0,
    publishing: (opsSnap?.publisher?.publishedToday ?? 0) > 0 ? 'Active' : 'Idle',
  }));

  if (!campaigns.length) {
    campaigns.push({
      name: campaignName,
      status: 'Running',
      buyers: buyer,
      roi: 'B',
      pipelineTy,
      content: marketing?.packs?.length ?? 0,
      publishing: 'Idle',
    });
  }

  const attention: ExecutiveSnapshot['attention'] = [];
  if ((opsSnap?.publisher?.retry ?? 0) > 0) {
    attention.push({ severity: 'red', text: 'Publish Failure — có bài cần retry' });
  }
  if ((opsSnap?.scanner?.running ?? 0) === 0 && (agentDash?.activeSources ?? 0) > 0) {
    attention.push({ severity: 'yellow', text: 'Scanner Idle — nguồn đang chờ cycle tiếp' });
  }
  if ((sales?.needFollowUp ?? 0) > 0) {
    attention.push({
      severity: 'red',
      text: `${sales!.needFollowUp} khách chưa follow-up (cần chăm)`,
    });
  }
  if (buyer > 0) {
    attention.push({ severity: 'green', text: `Buyer Waiting — ${buyer} ứng viên hôm nay` });
  }
  if ((knowledge?.coveragePercent ?? 100) < 80) {
    attention.push({ severity: 'yellow', text: 'Rule Accuracy / Coverage giảm — kiểm Knowledge' });
  }
  if ((feedback?.autoTune?.length ?? 0) > 0) {
    attention.push({
      severity: 'yellow',
      text: `${feedback!.autoTune.length} knowledge auto-tune gợi ý`,
    });
  }
  if (!attention.length) {
    attention.push({ severity: 'green', text: 'Hệ thống ổn — không có điểm kẹt lớn' });
  }

  const recommendations: string[] = [];
  if ((sales?.needFollowUp ?? 0) > 0) {
    recommendations.push(`Follow-up ${sales!.needFollowUp} khách đang chờ.`);
  }
  recommendations.push(`Đăng thêm video / content cho ${campaignName}.`);
  const worstSource = feedback?.weekly?.worstSource;
  if (worstSource) recommendations.push(`Giảm scan nguồn kém: ${worstSource}.`);
  const topSource = feedback?.weekly?.topSource;
  if (topSource) recommendations.push(`Tăng Mission / tần suất nguồn tốt: ${topSource}.`);
  if ((marketing?.health?.needReply ?? 0) > 0) {
    recommendations.push(`Trả lời ${marketing!.health.needReply} conversation đang chờ.`);
  }
  if (recommendations.length < 2) {
    recommendations.push('Giữ nhịp hiện tại — ưu tiên chăm buyer đã qualified.');
  }

  return {
    version: 'h05_executive_v1',
    today: {
      health,
      aiStatus,
      campaign: campaignName,
      buyer,
      qualified,
      appointments,
      pipelineTy,
      expectedRevenueTy,
    },
    aiDoing: { active, waitingApproval },
    funnel: {
      scanned,
      candidates,
      aiReviewed,
      qualified: funnelQualified,
      sales: salesCount,
      appointments,
      won,
    },
    campaigns,
    attention,
    recommendations: recommendations.slice(0, 6),
    opsMini: [
      {
        label: 'Fleet',
        value: `${opsSnap?.fleet?.machinesOnline ?? '—'} online`,
        href: '/admin/agents/runtime',
      },
      {
        label: 'Scanner',
        value: `${opsSnap?.scanner?.running ?? 0} run`,
        href: '/admin/agents/jobs',
      },
      {
        label: 'Publisher',
        value: `q${opsSnap?.publisher?.queue ?? 0}`,
        href: '/admin/agents/publishing',
      },
      {
        label: 'Browser',
        value: 'Runtime',
        href: '/admin/agents/runtime',
      },
      {
        label: 'Knowledge',
        value: `${knowledge?.coveragePercent ?? '—'}%`,
        href: '/admin/agents/knowledge-center',
      },
      {
        label: 'Sales',
        value: `${pipelineTy} tỷ`,
        href: '/admin/agents/lead-center',
      },
    ],
  };
}

export function formatExecutiveDashboardLines(snap: ExecutiveSnapshot): string[] {
  const t = snap.today;
  const lines = [
    'Executive Dashboard',
    '',
    'Today',
    `Health ${t.health}%`,
    `AI Status ${t.aiStatus}`,
    `Campaign ${t.campaign}`,
    `Buyer ${t.buyer}`,
    `Qualified ${t.qualified}`,
    `Appointments ${t.appointments}`,
    `Pipeline ${t.pipelineTy} tỷ`,
    `Expected Revenue ${t.expectedRevenueTy} tỷ`,
    '',
    'AI Is Doing',
  ];
  for (const task of snap.aiDoing.active.slice(0, 4)) {
    const mark = task.status === 'done' ? '✓' : task.status === 'running' ? '…' : '·';
    lines.push(`${mark} ${task.title}`);
  }
  if (snap.aiDoing.waitingApproval.length) {
    lines.push('');
    lines.push('Waiting Approval');
    for (const task of snap.aiDoing.waitingApproval.slice(0, 3)) {
      lines.push(`• ${task.title}`);
    }
  }
  lines.push('');
  lines.push('Funnel');
  lines.push(
    `${snap.funnel.scanned} → ${snap.funnel.candidates} → ${snap.funnel.qualified} → ${snap.funnel.won}`,
  );
  lines.push('');
  lines.push('Attention');
  for (const a of snap.attention.slice(0, 4)) {
    const icon = a.severity === 'red' ? '🔴' : a.severity === 'yellow' ? '🟡' : '🟢';
    lines.push(`${icon} ${a.text}`);
  }
  lines.push('');
  lines.push('Hôm nay nên:');
  for (const r of snap.recommendations.slice(0, 4)) lines.push(`• ${r}`);
  return lines;
}
