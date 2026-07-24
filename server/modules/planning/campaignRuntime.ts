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
import {
  assertCanStart,
  completeTask,
  createCampaignTaskGraph,
  findTaskByKey,
  formatOrchestratorWorkLines,
  patchTask,
  startTask,
  toLegacyCampaignTasks,
  waitApprovalTask,
  cancelTask,
} from './taskOrchestrator';
import type {
  CampaignBoard,
  CampaignLifecycleStatus,
  CampaignLeadRecord,
  CampaignState,
  CampaignTimelineEvent,
  LivingCampaign,
  CampaignPriority,
  OrchestratorTask,
} from './types';
import { CAMPAIGN_KANBAN_COLUMNS } from './types';
import {
  attachCampaignToTrace,
  finishTraceStep,
  getActiveTraceId,
  startTraceStep,
  tracedStep,
} from '../execution-trace';

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

function ensureOrchestrator(state: CampaignState, campaignId: string, priority: CampaignPriority, owner?: string | null): void {
  if (!state.orchestratorTasks?.length) {
    state.orchestratorTasks = createCampaignTaskGraph({
      campaignId,
      priority,
      owner,
    });
  }
  state.tasks = toLegacyCampaignTasks(state.orchestratorTasks);
}

function syncLegacyTasks(state: CampaignState): void {
  state.tasks = toLegacyCampaignTasks(state.orchestratorTasks || []);
}

function beginOrchestratorTask(
  state: CampaignState,
  key: string,
  phase: CampaignTimelineEvent['phase'],
): void {
  const task = findTaskByKey(state.orchestratorTasks || [], key);
  if (!task) return;
  assertCanStart(task, state.orchestratorTasks);
  state.orchestratorTasks = patchTask(state.orchestratorTasks, key, startTask);
  pushMemory(state, phase, `${task.label} queued`, 'running');
  pushMemory(state, phase, `${task.label} started`, key);
  syncLegacyTasks(state);
}

function finishOrchestratorTask(
  state: CampaignState,
  key: string,
  phase: CampaignTimelineEvent['phase'],
  resultSummary: string,
  mode: 'completed' | 'waiting_approval' = 'completed',
): void {
  state.orchestratorTasks = patchTask(state.orchestratorTasks || [], key, t =>
    mode === 'waiting_approval' ? waitApprovalTask(t, resultSummary) : completeTask(t, resultSummary),
  );
  const label = findTaskByKey(state.orchestratorTasks, key)?.label || key;
  pushMemory(
    state,
    phase,
    mode === 'waiting_approval' ? `${label} waiting approval` : `${label} completed`,
    resultSummary,
  );
  syncLegacyTasks(state);
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
          orchestratorTasks: [],
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

  if (!Array.isArray(state.orchestratorTasks)) state.orchestratorTasks = [];
  if (!state.orchestratorTasks.length && row.id) {
    state.orchestratorTasks = createCampaignTaskGraph({
      campaignId: row.id,
      priority: row.priority as CampaignPriority,
      owner: row.owner,
    });
    state.tasks = toLegacyCampaignTasks(state.orchestratorTasks);
  }

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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  campaign.status = 'researching';
  recomputeProgress(campaign.state, campaign.status);

  beginOrchestratorTask(campaign.state, 'research_market', 'researching');
  const research = await buildMarketIntelligenceReport({
    propertyHint: campaign.propertyHint,
    companyId: campaign.companyId,
  });
  campaign.state.research = research;
  finishOrchestratorTask(
    campaign.state,
    'research_market',
    'researching',
    `Giá TB ${research.avgPricePerSqm} ${research.priceUnit}`,
  );

  beginOrchestratorTask(campaign.state, 'analyze_competitors', 'researching');
  finishOrchestratorTask(
    campaign.state,
    'analyze_competitors',
    'researching',
    `${research.competitors?.length || 0} competitors`,
  );

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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  campaign.status = 'mission_planning';
  recomputeProgress(campaign.state, campaign.status);
  beginOrchestratorTask(campaign.state, 'generate_missions', 'mission_planning');
  const missions = proposeMissions({
    propertyHint: campaign.propertyHint,
    campaignName: campaign.name,
  });
  campaign.state.missions = missions.map(m => ({
    ...m,
    id: `${m.id}_${campaign.id.slice(0, 6)}`,
  }));
  finishOrchestratorTask(
    campaign.state,
    'generate_missions',
    'mission_planning',
    `${campaign.state.missions.length} missions`,
  );
  campaign.state.planChecklist = campaign.state.planChecklist.map(c =>
    c.key === 'buyer_mission' ? { ...c, done: true } : c,
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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  campaign.status = 'finding_leads';
  recomputeProgress(campaign.state, campaign.status);
  beginOrchestratorTask(campaign.state, 'review_leads', 'finding_leads');
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
  finishOrchestratorTask(
    campaign.state,
    'review_leads',
    'finding_leads',
    `${leads.length} leads`,
  );
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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  campaign.status = 'content_drafting';
  recomputeProgress(campaign.state, campaign.status);
  beginOrchestratorTask(campaign.state, 'generate_contents', 'content_drafting');
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
  finishOrchestratorTask(
    campaign.state,
    'generate_contents',
    'content_drafting',
    `${content.schedule.length} slots`,
  );
  campaign.state.planChecklist = campaign.state.planChecklist.map(c =>
    ['facebook', 'threads', 'seo'].includes(c.key) ? { ...c, done: true } : c,
  );
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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  campaign.status = 'waiting_approval';
  recomputeProgress(campaign.state, campaign.status);
  beginOrchestratorTask(campaign.state, 'schedule_publishing', 'waiting_approval');
  finishOrchestratorTask(
    campaign.state,
    'schedule_publishing',
    'waiting_approval',
    `đề xuất ${campaign.state.publishProposal?.suggestedAt || '18:00'}`,
    'waiting_approval',
  );
  const board = livingToBoard(campaign);
  campaign.state.recommendations = buildCampaignRecommendations({
    board,
    research: campaign.state.research,
    content: campaign.state.content,
  });
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
      ...formatOrchestratorWorkLines({
        campaignName: campaign.name,
        tasks: campaign.state.orchestratorTasks,
      }).slice(0, 10),
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
  const board = await tracedStep(
    'Campaign Planner',
    async () => planCampaignBoard({ utterance: input.utterance, companyId: input.companyId }),
    b => `Goal ${b.goal} · Priority ${b.priority} · ${b.name}`,
  );
  const initialState: CampaignState = {
    audience: board.audience,
    budget: board.budget,
    health: board.health,
    timeline: [],
    tasks: [],
    orchestratorTasks: [],
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
  campaign.state.orchestratorTasks = createCampaignTaskGraph({
    campaignId: campaign.id,
    priority: campaign.priority,
    owner: campaign.owner,
  });
  syncLegacyTasks(campaign.state);
  pushMemory(campaign.state, 'planning', 'Research queued', 'Task Orchestrator graph ready');
  campaign = await persist(campaign);

  const traceId = getActiveTraceId();
  if (traceId) {
    await attachCampaignToTrace(traceId, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      missionId: campaign.state.missions[0]?.id || null,
    });
    await startTraceStep(traceId, 'Campaign Created', 'creating');
    await finishTraceStep(traceId, 'Campaign Created', {
      status: 'ok',
      summary: `Campaign ${campaign.name} · Priority ${campaign.priority}`,
      metadata: { campaignId: campaign.id },
    });
  }

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

  await tracedStep(
    'Research',
    async () => {
      await runResearchPhase(campaign);
      campaign = (await getCampaign(campaign.id))!;
      return campaign;
    },
    c => `Collected ${c.state.research?.competitors?.length || 0} competitors`,
  );
  await tracedStep(
    'Mission Planner',
    async () => {
      await runMissionPhase(campaign);
      campaign = (await getCampaign(campaign.id))!;
      return campaign;
    },
    c => `Generated ${c.state.missions.length} missions`,
  );
  await runKeywordTraceStep(campaign);
  await tracedStep(
    'Content Planner',
    async () => {
      await runContentPhase(campaign);
      campaign = (await getCampaign(campaign.id))!;
      return campaign;
    },
    c => `Created ${c.state.content?.schedule?.length || c.state.metrics.contentSlots || 0} drafts`,
  );
  await tracedStep(
    'Decision',
    async () => {
      await runLeadPhase(campaign);
      campaign = (await getCampaign(campaign.id))!;
      return campaign;
    },
    c => `Reviewed ${c.state.leads.length} leads`,
  );
  await runWaitingApproval(campaign);
  campaign = (await getCampaign(campaign.id))!;

  if (traceId) {
    await startTraceStep(traceId, 'Waiting Approval', 'awaiting user');
    await finishTraceStep(traceId, 'Waiting Approval', {
      status: 'ok',
      summary: 'Waiting user Approve / Reject',
    });
  }

  return campaign!;
}

async function runKeywordTraceStep(campaign: LivingCampaign): Promise<void> {
  const keywords = new Set<string>();
  for (const m of campaign.state.missions || []) {
    for (const part of [m.name, m.persona, m.areaHint, m.intent, campaign.propertyHint]) {
      String(part || '')
        .split(/[\s,/|·•-]+/)
        .map(x => x.trim())
        .filter(x => x.length >= 2)
        .forEach(k => keywords.add(k));
    }
  }
  await tracedStep(
    'Keyword Generator',
    async () => Array.from(keywords).slice(0, 40),
    list => `Generated ${list.length} keywords`,
  );
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
  ensureOrchestrator(campaign.state, campaign.id, campaign.priority, campaign.owner);
  // Complete waiting schedule task
  campaign.state.orchestratorTasks = patchTask(
    campaign.state.orchestratorTasks,
    'schedule_publishing',
    t => completeTask(t, `approved by ${input.actor || 'user'}`),
  );
  syncLegacyTasks(campaign.state);

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
  beginOrchestratorTask(campaign.state, 'monitor_campaign', 'monitoring');
  finishOrchestratorTask(campaign.state, 'monitor_campaign', 'monitoring', 'monitoring started');
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
  ensureOrchestrator(found.state, found.id, found.priority, found.owner);
  found.state.orchestratorTasks = (found.state.orchestratorTasks || []).map(t =>
    t.status === 'pending' || t.status === 'running' || t.status === 'waiting_approval'
      ? cancelTask(t, input.reason || 'rejected')
      : t,
  );
  syncLegacyTasks(found.state);
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
  const work = formatOrchestratorWorkLines({
    campaignName: c.name,
    tasks: c.state.orchestratorTasks || [],
  });
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
    ...work,
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

export function getCampaignOrchestratorTasks(c: LivingCampaign): OrchestratorTask[] {
  return c.state.orchestratorTasks || [];
}
