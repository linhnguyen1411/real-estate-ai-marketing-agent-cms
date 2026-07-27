/**
 * Campaign Workspace — AI Sales operating center (Planning Layer).
 * Compose-only: no Runtime / Fleet / Queue / Browser / Scheduler edits.
 *
 * Campaign is the root object: Research → Mission → Buyer → Content → Publish → Sales → Trace.
 */

import { getLatestTraceForCampaign } from '../execution-trace';
import type { ExecutionTrace } from '../execution-trace/types';
import { listConcepts } from '../knowledge-base';
import { getSalesPipelineMetrics } from '../sales-layer';
import {
  getCampaign,
  listCampaigns,
  livingToBoard,
} from './campaignRuntime';
import { orchestratorProgress, listReadyTasks, taskDurationMs } from './taskOrchestrator';
import type {
  CampaignBoard,
  CampaignLifecycleStatus,
  LivingCampaign,
  RecommendationItem,
} from './types';

export type CampaignHealthLevel = 'healthy' | 'warning' | 'critical';

export type CampaignWorkspaceHealth = {
  level: CampaignHealthLevel;
  score: number;
  signals: string[];
};

export type CampaignWorkspace = {
  campaign: LivingCampaign;
  board: CampaignBoard;
  health: CampaignWorkspaceHealth;
  overview: {
    name: string;
    goal: string;
    priority: string;
    status: CampaignLifecycleStatus;
    progressPercent: number;
    owner: string | null;
    propertyHint: string;
    confidence: number;
    roiNote: string;
  };
  research: LivingCampaign['state']['research'];
  missions: LivingCampaign['state']['missions'];
  buyers: {
    candidates: number;
    vip: number;
    contacted: number;
    converted: number;
    leads: LivingCampaign['state']['leads'];
  };
  content: {
    plan: LivingCampaign['state']['content'];
    slots: number;
    approved: number;
    draft: number;
    scheduled: number;
    published: number;
  };
  publish: {
    proposal: LivingCampaign['state']['publishProposal'];
    suggestedChannel: string | null;
    approved: boolean;
    successNote: string;
  };
  knowledge: {
    mappedConcepts: Array<{ id: string; name: string; campaignMapping: string | null }>;
    keywordHints: string[];
  };
  sales: {
    pipelineValueTy: number;
    expectedRevenueTy: number;
    negotiating: number;
    won: number;
    lost: number;
    nextAction: string | null;
  };
  orchestrator: {
    tasks: Array<LivingCampaign['state']['orchestratorTasks'][number] & { durationMs: number | null }>;
    progress: ReturnType<typeof orchestratorProgress>;
    ready: string[];
  };
  acquisition: {
    status: string;
    sources: number;
    postsScanned: number;
    candidates: number;
    qualified: number;
    hot: number;
    lastRunAt: string | null;
    coverage: string | null;
    errors: string[];
    nextAction: string | null;
  };
  trace: ExecutionTrace | null;
  timeline: LivingCampaign['state']['operationalMemory'];
  recommendations: RecommendationItem[];
  aiThoughts: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hintMatch(haystack: string, needle: string): boolean {
  const a = haystack.trim().toLowerCase();
  const b = needle.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function deriveCampaignHealth(campaign: LivingCampaign): CampaignWorkspaceHealth {
  const signals: string[] = [];
  let score = 72;
  const state = campaign.state;
  const recs = state.recommendations || [];
  const critical = recs.filter(r => r.severity === 'critical').length;
  const warn = recs.filter(r => r.severity === 'warn').length;
  const progress = state.progress?.percent ?? 0;
  const stuck = (state.orchestratorTasks || []).filter(
    t => t.status === 'failed' || (t.status === 'running' && t.retryCount > 2),
  );
  const metrics = state.metrics;

  if (campaign.status === 'rejected') {
    signals.push('Campaign bị reject');
    score -= 40;
  }
  if (campaign.status === 'completed') {
    signals.push('Campaign đã hoàn thành');
    score = Math.max(score, 85);
  }
  if (critical > 0) {
    signals.push(`${critical} recommendation critical`);
    score -= 25 * critical;
  }
  if (warn > 0) {
    signals.push(`${warn} recommendation warning`);
    score -= 8 * warn;
  }
  if (stuck.length > 0) {
    signals.push(`${stuck.length} task stuck/failed`);
    score -= 18;
  }
  if (progress < 20 && !['planning', 'researching'].includes(campaign.status)) {
    signals.push('Tiến độ thấp so với phase');
    score -= 12;
  }
  if ((metrics?.leadTotal || 0) === 0 && ['finding_leads', 'content_drafting', 'waiting_approval', 'publishing', 'monitoring'].includes(campaign.status)) {
    signals.push('Chưa có lead — Campaign vẫn chạy research/mission (OK theo business rule)');
    score -= 4;
  }
  if ((metrics?.leadVip || 0) > 0) {
    signals.push(`${metrics.leadVip} VIP buyer`);
    score += 6;
  }
  if (state.research) {
    signals.push('Research sẵn sàng');
    score += 4;
  } else if (!['planning'].includes(campaign.status)) {
    signals.push('Chưa có research snapshot');
    score -= 6;
  }
  if (state.publishProposal && !state.publishProposal.approved && campaign.status === 'waiting_approval') {
    signals.push('Đang chờ duyệt publish');
  }

  score = clamp(Math.round(score), 0, 100);
  let level: CampaignHealthLevel = 'healthy';
  if (score < 45 || critical > 0 || campaign.status === 'rejected') level = 'critical';
  else if (score < 70 || warn > 1 || stuck.length > 0) level = 'warning';

  if (!signals.length) signals.push('Ổn định — không có tín hiệu bất thường');

  return { level, score, signals: signals.slice(0, 8) };
}

export function buildAiThoughts(workspace: Omit<CampaignWorkspace, 'aiThoughts'>): string {
  const { campaign, buyers, research, health, sales, content, missions, acquisition } = workspace;
  const parts: string[] = [];
  const hint = campaign.propertyHint || campaign.name;

  if (acquisition && acquisition.status !== 'NOT_STARTED') {
    parts.push(
      `acquisition ${acquisition.status} (cand ${acquisition.candidates}, Q ${acquisition.qualified}, HOT ${acquisition.hot})`,
    );
  }

  if (buyers.candidates > 0) {
    parts.push(
      `phát hiện ${buyers.candidates} buyer candidate` +
        (buyers.vip ? ` (VIP ${buyers.vip})` : ''),
    );
  } else {
    parts.push('chưa có buyer mới — đang giữ nhịp research/mission');
  }

  if (research?.priceTrend) {
    parts.push(`giá/xu hướng: ${research.priceTrend}`);
  } else if (research?.trends?.[0]) {
    parts.push(`thị trường: ${research.trends[0]}`);
  }

  if (missions.length) {
    parts.push(`${missions.length} mission đề xuất`);
  }

  if (content.slots) {
    parts.push(`content ${content.approved}/${content.slots} approved`);
  }

  if (sales.expectedRevenueTy > 0) {
    parts.push(`expected revenue ~${sales.expectedRevenueTy.toFixed(1)} tỷ`);
  }

  if (sales.negotiating > 0) {
    parts.push(`${sales.negotiating} đang negotiation`);
  }

  const criticalRec = (campaign.state.recommendations || []).find(r => r.severity === 'critical');
  const warnRec = (campaign.state.recommendations || []).find(r => r.severity === 'warn');
  if (criticalRec) parts.push(`đề xuất gấp: ${criticalRec.message}`);
  else if (warnRec) parts.push(`gợi ý: ${warnRec.message}`);
  else if (health.level === 'healthy') parts.push('nhịp ổn — giữ budget organic / theo dõi CTR');

  return `Campaign ${hint}: ${parts.join('; ')}. Health ${health.level} (${health.score}).`;
}

export async function getCampaignWorkspace(campaignId: string): Promise<CampaignWorkspace | null> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;

  const [trace, salesMetrics, concepts] = await Promise.all([
    getLatestTraceForCampaign(campaign.id).catch(() => null),
    getSalesPipelineMetrics({
      companyId: campaign.companyId,
      sinceHours: 24 * 90,
    }).catch(() => null),
    listConcepts().catch(() => []),
  ]);

  const campSales = (salesMetrics?.byCampaign || []).find(
    c => c.campaignId === campaign.id || hintMatch(c.name || '', campaign.name),
  );

  const mappedConcepts = (concepts || [])
    .filter(c => {
      const map = c.campaignMapping || '';
      return (
        hintMatch(map, campaign.name) ||
        hintMatch(map, campaign.propertyHint) ||
        hintMatch(c.name || '', campaign.propertyHint)
      );
    })
    .slice(0, 12)
    .map(c => ({
      id: c.id,
      name: c.name,
      campaignMapping: c.campaignMapping ?? null,
    }));

  const tasks = (campaign.state.orchestratorTasks || []).map(t => ({
    ...t,
    durationMs: taskDurationMs(t),
  }));
  const progress = orchestratorProgress(tasks);
  const contentPlan = campaign.state.content;
  const slots = contentPlan?.schedule?.length || campaign.state.metrics.contentSlots || 0;
  const approved = campaign.state.metrics.contentApproved || 0;

  const health = deriveCampaignHealth(campaign);
  const board = livingToBoard(campaign);

  const confidence = clamp(
    Math.round(
      (health.score * 0.5) +
        ((campaign.state.metrics.leadVip || 0) > 0 ? 15 : 0) +
        (campaign.state.research ? 10 : 0) +
        (approved > 0 ? 10 : 0) +
        ((campSales?.expectedRevenueTy || 0) > 0 ? 10 : 0),
    ),
    0,
    100,
  );

  const base: Omit<CampaignWorkspace, 'aiThoughts'> = {
    campaign,
    board,
    health,
    overview: {
      name: campaign.name,
      goal: campaign.goal,
      priority: campaign.priority,
      status: campaign.status,
      progressPercent: campaign.state.progress?.percent ?? progress.percent,
      owner: campaign.owner,
      propertyHint: campaign.propertyHint,
      confidence,
      roiNote:
        campSales && campSales.expectedRevenueTy > 0
          ? `Expected ${campSales.expectedRevenueTy.toFixed(1)} tỷ · pipeline ${campSales.pipelineValueTy.toFixed(1)} tỷ`
          : 'Chưa đủ dữ liệu revenue gắn campaign — Campaign vẫn là trung tâm điều phối',
    },
    research: campaign.state.research,
    missions: campaign.state.missions || [],
    buyers: {
      candidates: campaign.state.metrics.leadTotal || campaign.state.leads?.length || 0,
      vip: campaign.state.metrics.leadVip || 0,
      contacted: campaign.state.metrics.leadContacted || 0,
      converted: campaign.state.metrics.leadConverted || 0,
      leads: campaign.state.leads || [],
    },
    content: {
      plan: contentPlan,
      slots,
      approved,
      draft: Math.max(0, slots - approved),
      scheduled: contentPlan?.schedule?.filter(s => /schedule|lịch/i.test(s.time || '')).length || 0,
      published: campaign.status === 'publishing' || campaign.status === 'monitoring' || campaign.status === 'completed'
        ? approved
        : 0,
    },
    publish: {
      proposal: campaign.state.publishProposal,
      suggestedChannel: campaign.state.publishProposal?.channel || null,
      approved: Boolean(campaign.state.publishProposal?.approved),
      successNote: campaign.state.publishProposal?.note || 'Publish là capability — không chặn Campaign research',
    },
    knowledge: {
      mappedConcepts,
      keywordHints: campaign.state.research?.topKeywords?.slice(0, 8) || [],
    },
    sales: {
      pipelineValueTy: campSales?.pipelineValueTy || 0,
      expectedRevenueTy: campSales?.expectedRevenueTy || 0,
      negotiating: campSales?.negotiating || 0,
      won: campSales?.closed || 0,
      lost: 0,
      nextAction:
        (campaign.state.leads || []).find(l => l.leadStatus === 'follow_up' || l.leadStatus === 'assigned')
          ?.recommendation ||
        (campaign.state.recommendations || [])[0]?.actionLabel ||
        (campaign.state.recommendations || [])[0]?.message ||
        null,
    },
    orchestrator: {
      tasks,
      progress,
      ready: listReadyTasks(tasks).map(t => t.key),
    },
    acquisition: {
      status: 'NOT_STARTED',
      sources: 0,
      postsScanned: 0,
      candidates: 0,
      qualified: 0,
      hot: 0,
      lastRunAt: null,
      coverage: null,
      errors: [],
      nextAction: 'Approve campaign để mở Acquisition Request',
    },
    trace,
    timeline: campaign.state.operationalMemory || campaign.state.timeline || [],
    recommendations: campaign.state.recommendations || [],
  };

  try {
    const { getCampaignAcquisitionSnapshot } = await import('../campaign-acquisition');
    const snap = await getCampaignAcquisitionSnapshot(campaign.id);
    base.acquisition = {
      status: snap.status,
      sources: snap.sources,
      postsScanned: snap.postsScanned,
      candidates: snap.candidates,
      qualified: snap.qualified,
      hot: snap.hot,
      lastRunAt: snap.lastRunAt,
      coverage: snap.coverage,
      errors: snap.errors,
      nextAction: snap.nextAction,
    };
    if (snap.qualified > 0) {
      base.buyers.candidates = Math.max(base.buyers.candidates, snap.candidates);
      base.buyers.vip = Math.max(base.buyers.vip, snap.hot);
    }
  } catch {
    /* acquisition compose optional */
  }

  return {
    ...base,
    aiThoughts: buildAiThoughts(base),
  };
}

export function formatCampaignWorkspaceLines(ws: CampaignWorkspace): string[] {
  const h = ws.health.level.toUpperCase();
  return [
    `Campaign Workspace — ${ws.overview.name}`,
    '────────────────────────────────',
    `Status  ${ws.overview.status}`,
    `Health  ${h} (${ws.health.score})`,
    `Progress  ${ws.overview.progressPercent}%`,
    `Confidence  ${ws.overview.confidence}`,
    '',
    `Research  ${ws.research ? '✓' : '○'}`,
    `Mission  ${ws.missions.length}`,
    `Acquisition  ${ws.acquisition.status} · src ${ws.acquisition.sources} · cand ${ws.acquisition.candidates} · Q ${ws.acquisition.qualified} · HOT ${ws.acquisition.hot}`,
    `Lead  ${ws.buyers.candidates} · VIP ${ws.buyers.vip}`,
    `Buyer  ${ws.buyers.converted} converted · ${ws.sales.negotiating} negotiating`,
    `Draft  ${ws.content.draft} · Approved ${ws.content.approved}`,
    `Published  ${ws.content.published}`,
    `Sales  pipeline ${ws.sales.pipelineValueTy.toFixed(1)} tỷ · expected ${ws.sales.expectedRevenueTy.toFixed(1)} tỷ`,
    `Revenue  ${ws.overview.roiNote}`,
    '',
    'AI Thoughts',
    ws.aiThoughts,
    '',
    ...ws.health.signals.slice(0, 4).map(s => `• ${s}`),
  ];
}

export function workspaceTelegramMarkup(campaignId: string) {
  const cid = campaignId.slice(0, 28);
  return {
    inline_keyboard: [
      [
        { text: 'Research', callback_data: 'ai:research' },
        { text: 'Buyer', callback_data: 'ai:leads' },
        { text: 'Mission', callback_data: 'ai:mission' },
      ],
      [
        { text: 'Content', callback_data: 'ai:content' },
        { text: 'Publish', callback_data: 'ai:publish' },
        { text: 'Sales', callback_data: 'ai:recs' },
      ],
      [
        { text: 'Summary', callback_data: `ai:vw:${cid}` },
        { text: 'Approve', callback_data: `ai:ap:${cid}` },
        { text: 'Reject', callback_data: `ai:rj:${cid}` },
      ],
    ],
  };
}

export async function listCampaignWorkspaceHealth(input?: {
  companyId?: string | null;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    name: string;
    status: CampaignLifecycleStatus;
    health: CampaignWorkspaceHealth;
    progressPercent: number;
  }>
> {
  const rows = await listCampaigns({
    companyId: input?.companyId,
    limit: input?.limit ?? 40,
  });
  return rows.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    health: deriveCampaignHealth(c),
    progressPercent: c.state.progress?.percent ?? 0,
  }));
}

/** Resolve campaign by id or name/hint fuzzy match for Copilot Q&A */
export async function resolveCampaignWorkspace(
  query: string,
  companyId?: string | null,
): Promise<CampaignWorkspace | null> {
  const q = query.trim();
  if (!q) {
    const list = await listCampaigns({ companyId, limit: 20 });
    const active = list.find(c => !['completed', 'rejected'].includes(c.status)) || list[0];
    return active ? getCampaignWorkspace(active.id) : null;
  }
  if (/^c[a-z0-9]{20,}$/i.test(q) || q.length > 20) {
    const byId = await getCampaignWorkspace(q);
    if (byId) return byId;
  }
  const list = await listCampaigns({ companyId, limit: 50 });
  const hit =
    list.find(c => hintMatch(c.name, q) || hintMatch(c.propertyHint, q)) ||
    list.find(c => hintMatch(q, c.name) || hintMatch(q, c.propertyHint));
  return hit ? getCampaignWorkspace(hit.id) : null;
}
