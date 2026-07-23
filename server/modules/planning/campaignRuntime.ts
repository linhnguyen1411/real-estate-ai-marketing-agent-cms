/**
 * Campaign Runtime — living campaign lifecycle engine (H2.1).
 * Persists state, auto-advances phases through Waiting Approval.
 * Does not touch Runtime / Queue / Fleet / Browser / Scheduler / Publisher cores.
 */

import { prisma } from '../../prisma';
import { planCampaignBoard } from './campaignPlanner';
import { planContentSchedule } from './contentPlanner';
import { rankLeadCards } from './leadIntelligenceV2';
import { proposeMissions } from './missionPlanner';
import { rememberPlanningEvent } from './operationalMemory';
import { buildCampaignRecommendations } from './recommendationEngine';
import { buildMarketIntelligenceReport } from './researchAgent';
import type {
  CampaignBoard,
  CampaignLifecycleStatus,
  CampaignLeadRecord,
  CampaignState,
  CampaignTask,
  CampaignTimelineEvent,
  LivingCampaign,
  CampaignPriority,
} from './types';
import { CAMPAIGN_KANBAN_COLUMNS } from './types';

const RESEARCH_TASK_LABELS = [
  'Research giá',
  'Đối thủ',
  'Nguồn đăng',
  'Xu hướng',
  'Buyer Signals',
  'Market Report',
];

function nowIso(): string {
  return new Date().toISOString();
}

function emptyMetrics(): CampaignState['metrics'] {
  return {
    leadTotal: 0,
    leadVip: 0,
    leadContacted: 0,
    leadConverted: 0,
    missionsProposed: 0,
    contentSlots: 0,
    contentApproved: 0,
    recommendationsOpen: 0,
  };
}

function buildInitialTasks(): CampaignTask[] {
  const research = RESEARCH_TASK_LABELS.map((label, i) => ({
    id: `t_res_${i + 1}`,
    phase: 'researching' as const,
    label,
    status: 'pending' as const,
  }));
  return [
    ...research,
    { id: 't_msn', phase: 'mission_planning', label: 'Sinh Mission gắn Campaign', status: 'pending' },
    { id: 't_lead', phase: 'finding_leads', label: 'Lead Intelligence theo Campaign', status: 'pending' },
    { id: 't_cnt', phase: 'content_drafting', label: 'Content Plan đa kênh', status: 'pending' },
    { id: 't_wait', phase: 'waiting_approval', label: 'Chờ Approve content / lịch đăng', status: 'pending' },
  ];
}

function pushMemory(
  state: CampaignState,
  phase: CampaignTimelineEvent['phase'],
  title: string,
  detail?: string,
): void {
  const ev: CampaignTimelineEvent = { at: nowIso(), phase, title, detail };
  state.timeline.push(ev);
  state.operationalMemory.push(ev);
}

function recomputeProgress(state: CampaignState, status: CampaignLifecycleStatus): void {
  const idx = CAMPAIGN_KANBAN_COLUMNS.indexOf(status === 'rejected' ? 'completed' : status);
  const safeIdx = Math.max(0, idx);
  const percent =
    status === 'completed'
      ? 100
      : status === 'rejected'
        ? 0
        : Math.round((safeIdx / Math.max(1, CAMPAIGN_KANBAN_COLUMNS.length - 1)) * 100);
  state.progress = {
    percent,
    currentPhase: status === 'rejected' ? 'rejected' : status,
    phasesDone: CAMPAIGN_KANBAN_COLUMNS.slice(0, Math.max(0, safeIdx)),
    blockedReason: status === 'waiting_approval' ? 'Chờ Approve / Reject' : null,
  };
}

function refreshMetrics(state: CampaignState): void {
  const leads = state.leads || [];
  state.metrics = {
    leadTotal: leads.length,
    leadVip: leads.filter(l => l.confidence >= 90).length,
    leadContacted: leads.filter(l =>
      ['contacted', 'assigned', 'follow_up', 'converted', 'closed'].includes(l.leadStatus),
    ).length,
    leadConverted: leads.filter(l => l.leadStatus === 'converted' || l.leadStatus === 'closed').length,
    missionsProposed: state.missions.length,
    contentSlots: state.content?.schedule.length ?? 0,
    contentApproved: state.publishProposal?.approved ? 1 : 0,
    recommendationsOpen: state.recommendations.length,
  };
}

function rowToLiving(row: {
  id: string;
  companyId: string | null;
  name: string;
  goal: string;
  priority: string;
  owner: string | null;
  status: string;
  propertyHint: string;
  utterance: string | null;
  state: unknown;
  createdAt: Date;
  updatedAt: Date;
}): LivingCampaign {
  const state =
    row.state && typeof row.state === 'object' && !Array.isArray(row.state)
      ? (row.state as CampaignState)
      : ({
          audience: [],
          budget: 'organic',
          health: 0,
          timeline: [],
          tasks: [],
          progress: { percent: 0, currentPhase: 'planning', phasesDone: [] },
          metrics: emptyMetrics(),
          research: null,
          missions: [],
          content: null,
          leads: [],
          recommendations: [],
          publishProposal: null,
          operationalMemory: [],
          planChecklist: [],
        } satisfies CampaignState);

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    goal: row.goal,
    priority: row.priority as CampaignPriority,
    owner: row.owner,
    status: row.status as CampaignLifecycleStatus,
    propertyHint: row.propertyHint,
    utterance: row.utterance,
    state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function persist(campaign: LivingCampaign): Promise<LivingCampaign> {
  const updated = await prisma.aiSalesCampaign.update({
    where: { id: campaign.id },
    data: {
      name: campaign.name,
      goal: campaign.goal,
      priority: campaign.priority,
      owner: campaign.owner,
      status: campaign.status,
      propertyHint: campaign.propertyHint,
      utterance: campaign.utterance,
      state: campaign.state as object,
    },
  });
  return rowToLiving(updated);
}

async function notifyProactive(input: {
  companyId?: string | null;
  campaignId: string;
  title: string;
  lines: string[];
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
}): Promise<void> {
  await rememberPlanningEvent({
    companyId: input.companyId,
    kind: 'campaign_proactive',
    title: input.title,
    detail: input.lines.slice(0, 3).join(' · '),
    entityType: 'ai_sales_campaign',
    entityId: input.campaignId,
    payload: { lines: input.lines },
  });

  try {
    const { sendNotification } = await import('../../notifications/notificationRouter');
    await sendNotification({
      type: 'planner',
      text: input.lines.join('\n'),
      replyMarkup: input.replyMarkup,
      skipDedup: true,
      immediate: true,
      payload: {
        entityId: input.campaignId,
        title: input.title,
        summary: input.lines[0],
      },
    });
  } catch {
    // OPS Telegram optional — lifecycle continues.
  }
}

export function livingToBoard(c: LivingCampaign): CampaignBoard {
  return {
    id: c.id,
    name: c.name,
    goal: c.goal,
    audience: c.state.audience,
    budget: c.state.budget,
    priority: c.priority,
    propertyHint: c.propertyHint,
    planChecklist: c.state.planChecklist,
    tasks: c.state.tasks.map(t => `${t.status === 'done' ? '✓' : '○'} ${t.label}`),
    health: c.state.health,
    createdAt: c.createdAt,
    lifecycleStatus: c.status,
    livingCampaignId: c.id,
    metadata: { runtime: 'campaign_runtime_v1' },
  };
}

function shortId(id: string): string {
  return id.slice(0, 28);
}

async function runResearchPhase(campaign: LivingCampaign): Promise<void> {
  campaign.status = 'researching';
  recomputeProgress(campaign.state, campaign.status);
  pushMemory(campaign.state, 'researching', 'Research started', campaign.propertyHint);

  for (const task of campaign.state.tasks.filter(t => t.phase === 'researching')) {
    task.status = 'done';
    task.result = 'ok';
    pushMemory(campaign.state, 'researching', `Task: ${task.label}`, 'done');
  }

  const research = await buildMarketIntelligenceReport({
    propertyHint: campaign.propertyHint,
    companyId: campaign.companyId,
  });
  campaign.state.research = research;
  campaign.state.planChecklist = campaign.state.planChecklist.map(c =>
    ['research', 'competitor', 'market_price'].includes(c.key) ? { ...c, done: true } : c,
  );
  pushMemory(campaign.state, 'researching', 'Research finished', research.title);
  refreshMetrics(campaign.state);
  await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Research completed',
    lines: [
      '🔎 Research completed',
      campaign.name,
      `Giá TB ~${research.avgPricePerSqm} ${research.priceUnit}`,
      `Band ${research.minPricePerSqm}–${research.maxPricePerSqm}`,
      research.suggestedPositioning,
    ],
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'View', callback_data: 'ai:research' },
          { text: 'Open', callback_data: `ai:vw:${shortId(campaign.id)}` },
        ],
      ],
    },
  });
}

async function runMissionPhase(campaign: LivingCampaign): Promise<void> {
  campaign.status = 'mission_planning';
  recomputeProgress(campaign.state, campaign.status);
  const missions = proposeMissions({
    propertyHint: campaign.propertyHint,
    campaignName: campaign.name,
  });
  campaign.state.missions = missions.map(m => ({
    ...m,
    id: `${m.id}_${campaign.id.slice(0, 6)}`,
  }));
  const task = campaign.state.tasks.find(t => t.id === 't_msn');
  if (task) {
    task.status = 'done';
    task.result = `${missions.length} missions`;
  }
  campaign.state.planChecklist = campaign.state.planChecklist.map(c =>
    c.key === 'buyer_mission' ? { ...c, done: true } : c,
  );
  pushMemory(
    campaign.state,
    'mission_planning',
    'Mission generated',
    `${campaign.state.missions.length} missions`,
  );
  refreshMetrics(campaign.state);
  await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Missions ready',
    lines: [
      `🎯 ${campaign.state.missions.length} Mission mới đã sẵn sàng.`,
      campaign.name,
      ...campaign.state.missions.slice(0, 3).map(m => `• ${m.name}`),
    ],
    replyMarkup: {
      inline_keyboard: [[{ text: 'View', callback_data: 'ai:mission' }]],
    },
  });
}

async function runLeadPhase(campaign: LivingCampaign): Promise<void> {
  campaign.status = 'finding_leads';
  recomputeProgress(campaign.state, campaign.status);
  const cards = await rankLeadCards({
    companyId: campaign.companyId,
    limit: 12,
    areaHint: campaign.propertyHint,
  });
  const leads: CampaignLeadRecord[] = cards.map(c => ({
    ...c,
    campaignId: campaign.id,
    leadStatus: c.confidence >= 90 ? 'scored' : 'new',
    assignedTo: null,
    followUpAt: null,
  }));
  campaign.state.leads = leads;
  const task = campaign.state.tasks.find(t => t.id === 't_lead');
  if (task) {
    task.status = 'done';
    task.result = `${leads.length} leads`;
  }
  pushMemory(campaign.state, 'finding_leads', 'Lead found', `${leads.length} leads gắn campaign`);
  refreshMetrics(campaign.state);
  await persist(campaign);

  const vip = leads.find(l => l.confidence >= 90) || leads[0];
  if (vip) {
    await notifyProactive({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      title: 'VIP lead',
      lines: [
        `🔥 Buyer ${vip.confidence}%`,
        vip.name,
        `${vip.area} · ${vip.budget}`,
        vip.suggestedReply.slice(0, 160),
      ],
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'Open', callback_data: vip.findingId ? `l:o:${vip.findingId.slice(0, 28)}` : 'ai:leads' },
            { text: 'Assign', callback_data: 'ai:leads' },
          ],
        ],
      },
    });
  }
}

async function runContentPhase(campaign: LivingCampaign): Promise<void> {
  campaign.status = 'content_drafting';
  recomputeProgress(campaign.state, campaign.status);
  const content = planContentSchedule({
    campaignName: campaign.name,
    propertyHint: campaign.propertyHint,
  });
  campaign.state.content = content;
  const slot18 = content.schedule.find(s => s.time.startsWith('18')) || content.schedule[3];
  campaign.state.publishProposal = {
    suggestedAt: slot18?.time || '18:00',
    channel: slot18?.channel || 'Facebook Group',
    note: `Publisher rảnh — đề xuất đăng lúc ${slot18?.time || '18:00'}.`,
    approved: false,
  };
  const task = campaign.state.tasks.find(t => t.id === 't_cnt');
  if (task) {
    task.status = 'done';
    task.result = `${content.schedule.length} slots`;
  }
  campaign.state.planChecklist = campaign.state.planChecklist.map(c =>
    ['facebook', 'threads', 'seo'].includes(c.key) ? { ...c, done: true } : c,
  );
  pushMemory(campaign.state, 'content_drafting', 'Content drafted', `${content.schedule.length} slots`);
  refreshMetrics(campaign.state);
  await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Publish proposal',
    lines: [
      `📢 ${campaign.state.publishProposal.note}`,
      `Kênh: ${campaign.state.publishProposal.channel}`,
      'Content chưa publish — chờ Approve.',
    ],
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: `ai:ap:${shortId(campaign.id)}` },
          { text: 'Reject', callback_data: `ai:rj:${shortId(campaign.id)}` },
        ],
      ],
    },
  });
}

async function runWaitingApproval(campaign: LivingCampaign): Promise<void> {
  campaign.status = 'waiting_approval';
  recomputeProgress(campaign.state, campaign.status);
  const board = livingToBoard(campaign);
  campaign.state.recommendations = buildCampaignRecommendations({
    board,
    research: campaign.state.research,
    content: campaign.state.content,
  });
  const waitTask = campaign.state.tasks.find(t => t.id === 't_wait');
  if (waitTask) waitTask.status = 'running';
  pushMemory(campaign.state, 'waiting_approval', 'Waiting approval', 'User Approve / Reject');
  refreshMetrics(campaign.state);
  await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Campaign ready for approval',
    lines: [
      `📋 Campaign sẵn sàng: ${campaign.name}`,
      `Status: waiting_approval · ${campaign.state.progress.percent}%`,
      `Leads: ${campaign.state.metrics.leadTotal} (VIP ${campaign.state.metrics.leadVip})`,
      `Missions: ${campaign.state.metrics.missionsProposed}`,
      `Content slots: ${campaign.state.metrics.contentSlots}`,
      campaign.state.recommendations[0]?.message || 'Chờ Approve để tiếp tục.',
    ],
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: `ai:ap:${shortId(campaign.id)}` },
          { text: 'Reject', callback_data: `ai:rj:${shortId(campaign.id)}` },
          { text: 'View', callback_data: `ai:vw:${shortId(campaign.id)}` },
        ],
      ],
    },
  });
}

/** Create + auto-run lifecycle through Waiting Approval. */
export async function createAndRunCampaign(input: {
  utterance: string;
  companyId?: string | null;
  owner?: string | null;
}): Promise<LivingCampaign> {
  const board = planCampaignBoard({ utterance: input.utterance, companyId: input.companyId });
  const initialState: CampaignState = {
    audience: board.audience,
    budget: board.budget,
    health: board.health,
    timeline: [],
    tasks: buildInitialTasks(),
    progress: {
      percent: 0,
      currentPhase: 'planning',
      phasesDone: [],
      blockedReason: null,
    },
    metrics: emptyMetrics(),
    research: null,
    missions: [],
    content: null,
    leads: [],
    recommendations: [],
    publishProposal: null,
    operationalMemory: [],
    planChecklist: board.planChecklist.map(c => ({ ...c, done: false })),
  };

  pushMemory(initialState, 'planning', 'Campaign created', board.name);
  recomputeProgress(initialState, 'planning');

  const row = await prisma.aiSalesCampaign.create({
    data: {
      companyId: input.companyId ?? null,
      name: board.name,
      goal: board.goal,
      priority: board.priority,
      owner: input.owner ?? 'ai-sales-employee',
      status: 'planning',
      propertyHint: board.propertyHint,
      utterance: input.utterance.slice(0, 2000),
      state: initialState as object,
    },
  });

  let campaign = rowToLiving(row);
  await rememberPlanningEvent({
    companyId: input.companyId,
    kind: 'campaign',
    title: 'Campaign created',
    detail: campaign.name,
    entityType: 'ai_sales_campaign',
    entityId: campaign.id,
  });

  await notifyProactive({
    companyId: input.companyId,
    campaignId: campaign.id,
    title: 'Campaign created',
    lines: [
      '🚀 Campaign Runtime started',
      campaign.name,
      `Goal: ${campaign.goal}`,
      `Priority: ${campaign.priority}`,
    ],
  });

  await runResearchPhase(campaign);
  campaign = (await getCampaign(campaign.id))!;
  await runMissionPhase(campaign);
  campaign = (await getCampaign(campaign.id))!;
  await runLeadPhase(campaign);
  campaign = (await getCampaign(campaign.id))!;
  await runContentPhase(campaign);
  campaign = (await getCampaign(campaign.id))!;
  await runWaitingApproval(campaign);
  campaign = (await getCampaign(campaign.id))!;

  return campaign!;
}

export async function getCampaign(id: string): Promise<LivingCampaign | null> {
  const row = await prisma.aiSalesCampaign.findUnique({ where: { id } });
  return row ? rowToLiving(row) : null;
}

export async function findCampaignByPrefix(prefix: string): Promise<LivingCampaign | null> {
  const p = String(prefix || '').trim();
  if (!p) return null;
  if (p.length >= 20) {
    const exact = await getCampaign(p);
    if (exact) return exact;
  }
  const rows = await prisma.aiSalesCampaign.findMany({
    where: { id: { startsWith: p } },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return rows[0] ? rowToLiving(rows[0]) : null;
}

export async function listCampaigns(input?: {
  companyId?: string | null;
  limit?: number;
}): Promise<LivingCampaign[]> {
  const rows = await prisma.aiSalesCampaign.findMany({
    where: input?.companyId ? { companyId: input.companyId } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(100, input?.limit ?? 50),
  });
  return rows.map(rowToLiving);
}

export async function listCampaignsKanban(input?: {
  companyId?: string | null;
}): Promise<Record<string, LivingCampaign[]>> {
  const all = await listCampaigns({ companyId: input?.companyId, limit: 100 });
  const board: Record<string, LivingCampaign[]> = {};
  for (const col of [...CAMPAIGN_KANBAN_COLUMNS, 'rejected' as const]) {
    board[col] = [];
  }
  for (const c of all) {
    const key = c.status in board ? c.status : 'planning';
    board[key].push(c);
  }
  return board;
}

/** Approve → Publishing → Monitoring → Optimizing (no Publisher Core calls). */
export async function approveCampaign(input: {
  campaignId: string;
  actor?: string | null;
}): Promise<LivingCampaign> {
  const found = await findCampaignByPrefix(input.campaignId);
  if (!found) throw new Error(`Campaign not found: ${input.campaignId}`);
  let campaign = found;

  if (campaign.status === 'rejected' || campaign.status === 'completed') {
    return campaign;
  }

  if (campaign.state.publishProposal) {
    campaign.state.publishProposal.approved = true;
  }
  const waitTask = campaign.state.tasks.find(t => t.id === 't_wait');
  if (waitTask) waitTask.status = 'done';

  campaign.status = 'publishing';
  recomputeProgress(campaign.state, campaign.status);
  pushMemory(
    campaign.state,
    'publishing',
    'Approved',
    `by ${input.actor || 'user'} — lịch ${campaign.state.publishProposal?.suggestedAt || '18:00'}`,
  );
  refreshMetrics(campaign.state);
  campaign = await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Approved',
    lines: [
      `✅ Approved — ${campaign.name}`,
      `Đề xuất đăng ${campaign.state.publishProposal?.suggestedAt} · ${campaign.state.publishProposal?.channel}`,
      '(Planning layer — chưa gọi Publisher Core)',
    ],
  });

  campaign.status = 'monitoring';
  recomputeProgress(campaign.state, campaign.status);
  pushMemory(campaign.state, 'monitoring', 'Monitoring', 'Theo dõi lead + engagement (advisory)');
  campaign = await persist(campaign);

  campaign.status = 'optimizing';
  recomputeProgress(campaign.state, campaign.status);
  const board = livingToBoard(campaign);
  campaign.state.recommendations = buildCampaignRecommendations({
    board,
    research: campaign.state.research,
    content: campaign.state.content,
  });
  pushMemory(
    campaign.state,
    'optimizing',
    'Optimizing',
    campaign.state.recommendations[0]?.message || 'Đề xuất tối ưu',
  );
  refreshMetrics(campaign.state);
  campaign = await persist(campaign);

  await notifyProactive({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    title: 'Recommendations',
    lines: [
      '💡 Recommendation Engine V2',
      ...campaign.state.recommendations.slice(0, 4).map(r => `• [${r.severity}] ${r.message}`),
    ],
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Complete', callback_data: `ai:done:${shortId(campaign.id)}` },
          { text: 'View', callback_data: `ai:vw:${shortId(campaign.id)}` },
        ],
      ],
    },
  });

  return campaign;
}

export async function rejectCampaign(input: {
  campaignId: string;
  actor?: string | null;
  reason?: string;
}): Promise<LivingCampaign> {
  const found = await findCampaignByPrefix(input.campaignId);
  if (!found) throw new Error(`Campaign not found: ${input.campaignId}`);
  found.status = 'rejected';
  recomputeProgress(found.state, 'rejected');
  pushMemory(found.state, 'system', 'Rejected', input.reason || `by ${input.actor || 'user'}`);
  found.state.progress.blockedReason = 'Rejected by user';
  const saved = await persist(found);
  await notifyProactive({
    companyId: saved.companyId,
    campaignId: saved.id,
    title: 'Rejected',
    lines: [`⛔ Campaign rejected — ${saved.name}`, input.reason || 'User reject'],
  });
  return saved;
}

export async function completeCampaign(campaignId: string): Promise<LivingCampaign> {
  const found = await findCampaignByPrefix(campaignId);
  if (!found) throw new Error(`Campaign not found: ${campaignId}`);
  found.status = 'completed';
  recomputeProgress(found.state, 'completed');
  pushMemory(found.state, 'completed', 'Completed', 'Campaign lifecycle closed');
  return persist(found);
}

export function campaignRuntimeSummaryLines(c: LivingCampaign): string[] {
  const m = c.state.metrics;
  const prop = c.state.publishProposal;
  return [
    'Campaign Runtime',
    '────────────────────────────────',
    c.name,
    `Status: ${c.status} · ${c.state.progress.percent}%`,
    `Goal: ${c.goal}`,
    `Priority: ${c.priority} · Owner: ${c.owner || '—'}`,
    `Property: ${c.propertyHint}`,
    '',
    `Leads ${m.leadTotal} · VIP ${m.leadVip} · Contacted ${m.leadContacted} · Converted ${m.leadConverted}`,
    `Missions ${m.missionsProposed} · Content ${m.contentSlots} · Recs ${m.recommendationsOpen}`,
    prop
      ? `Publish proposal: ${prop.suggestedAt} · ${prop.channel}${prop.approved ? ' · APPROVED' : ' · chờ Approve'}`
      : 'Publish proposal: —',
    '',
    'Timeline',
    ...c.state.operationalMemory.slice(-8).map(e => {
      const hhmm = new Date(e.at).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Ho_Chi_Minh',
      });
      return `${hhmm}  ${e.title}${e.detail ? ` — ${e.detail}` : ''}`;
    }),
    '────────────────────────────────',
  ];
}
