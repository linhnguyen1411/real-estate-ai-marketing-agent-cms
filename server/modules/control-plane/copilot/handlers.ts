/**
 * Intent handlers — Strategy objects registered on IntentRegistry.
 */

import { formatCommandText } from '../command-engine';
import {
  agentJobKeyboard,
  approvalKeyboard,
  browserActionKeyboard,
  incidentKeyboard,
  machineActionKeyboard,
  missionActionKeyboard,
  opsActionKeyboard,
  publishJobKeyboard,
} from '../inlineKeyboard';
import {
  rememberFindingList,
  rememberJobList,
  rememberMissionList,
  resolveIndexedId,
} from './contextStore';
import {
  formatBrowserDetailLines,
  formatDashboardBriefLines,
  formatFleetAwarenessLines,
  formatIncidentCenterLines,
  formatLeadSummaryLines,
  formatMachineDetailLines,
  formatMissionSummaryLines,
  formatPublisherSummaryLines,
  formatScannerSummaryLines,
} from './opsSummaries';
import { recommendAll } from './recommendations';
import { formatLeadLines, replyFail, replyOk } from './replyFormatter';
import type { IntentHandler, IntentRegistry } from './intentRegistry';
import type { ClassifiedIntent, CopilotIntentName } from './types';
import { runSalesEmployee } from '../../planning/salesEmployee';

async function runAiEmployeeHandler(
  intentName: CopilotIntentName,
  text: string,
  companyId?: string | null,
) {
  const modeMap: Partial<Record<CopilotIntentName, Parameters<typeof runSalesEmployee>[0]['mode']>> = {
    ai_sales_campaign: 'campaign_board',
    ai_sales_research: 'research_report',
    ai_sales_missions: 'mission_proposals',
    ai_sales_leads: 'lead_cards',
    ai_sales_content: 'content_plan',
    ai_sales_timeline: 'work_status',
    ai_sales_recommendations: 'recommendations',
    ai_sales_help: 'help',
  };
  const result = await runSalesEmployee({
    utterance: text,
    companyId,
    mode: modeMap[intentName],
  });
  return replyOk(intentName, result.lines, {
    mode: result.mode,
    board: result.board,
    research: result.research,
    missions: result.missions,
    leads: result.leads,
    content: result.content,
    recommendations: result.recommendations,
    timeline: result.timeline,
    orchestratorTasks: result.orchestratorTasks,
    livingCampaign: result.livingCampaign,
  }, result.replyMarkup);
}

const aiSalesCampaign: IntentHandler = {
  name: 'ai_sales_campaign',
  supports: i => i.name === 'ai_sales_campaign',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesResearch: IntentHandler = {
  name: 'ai_sales_research',
  supports: i => i.name === 'ai_sales_research',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesMissions: IntentHandler = {
  name: 'ai_sales_missions',
  supports: i => i.name === 'ai_sales_missions',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesLeads: IntentHandler = {
  name: 'ai_sales_leads',
  supports: i => i.name === 'ai_sales_leads',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesContent: IntentHandler = {
  name: 'ai_sales_content',
  supports: i => i.name === 'ai_sales_content',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesTimeline: IntentHandler = {
  name: 'ai_sales_timeline',
  supports: i => i.name === 'ai_sales_timeline',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesRecommendations: IntentHandler = {
  name: 'ai_sales_recommendations',
  supports: i => i.name === 'ai_sales_recommendations',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};
const aiSalesHelp: IntentHandler = {
  name: 'ai_sales_help',
  supports: i => i.name === 'ai_sales_help',
  execute: async ({ intent, text, ctx }) =>
    runAiEmployeeHandler(intent.name, text, ctx.companyId),
};

function dayBounds(hint?: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (hint === 'week') {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to };
  }
  if (hint === 'yesterday') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to };
}

const whatsNew: IntentHandler = {
  name: 'whats_new',
  supports: i => i.name === 'whats_new' || i.name === 'dashboard',
  async execute({ intent, port, ctx }) {
    const ops = await port.getOpsMetrics(true);
    const leads = await port.countLeadsToday();
    const signals = await port.detectIncidents();
    const recs = recommendAll(signals.incidents);
    rememberFindingList(
      ctx,
      leads.items.map(x => x.id),
    );
    ctx.lastAgentIds = ops.machines.map(m => m.agentId);
    const lines = formatDashboardBriefLines(ops, {
      leadsToday: leads.total,
      incidents: signals.incidents.slice(0, 4),
      recommendations: recs.slice(0, 3).map(r => r.summary),
    });
    const entity = signals.incidents[0]?.entityId || ops.machines[0]?.agentId;
    return replyOk(intent.name, lines, { ops, leads, signals }, opsActionKeyboard(entity));
  },
};

const fleetSummary: IntentHandler = {
  name: 'fleet_summary',
  supports: i => i.name === 'fleet_summary',
  async execute({ intent, port, ctx }) {
    const ops = await port.getOpsMetrics(true);
    ctx.lastAgentIds = ops.machines.map(m => m.agentId);
    const lines = formatFleetAwarenessLines(ops);
    const first = ops.machines[0]?.agentId;
    return replyOk(
      intent.name,
      lines,
      { ops },
      first ? machineActionKeyboard(first) : opsActionKeyboard(),
    );
  },
};

const scannerSummary: IntentHandler = {
  name: 'scanner_summary',
  supports: i => i.name === 'scanner_summary',
  async execute({ intent, port, ctx }) {
    const ops = await port.getOpsMetrics(true);
    const leads = await port.countLeadsToday();
    rememberFindingList(
      ctx,
      leads.items.map(x => x.id),
    );
    const lines = formatScannerSummaryLines(ops, leads.items[0] || null);
    return replyOk(intent.name, lines, { ops }, opsActionKeyboard(ops.machines[0]?.agentId));
  },
};

const publisherSummary: IntentHandler = {
  name: 'publisher_summary',
  supports: i => i.name === 'publisher_summary',
  async execute({ intent, port }) {
    const ops = await port.getOpsMetrics(true);
    const lines = formatPublisherSummaryLines(ops);
    return replyOk(
      intent.name,
      lines,
      { ops },
      ops.publisher.retry > 0 ? publishJobKeyboard('queue') : opsActionKeyboard(),
    );
  },
};

const marketingOrgSummary: IntentHandler = {
  name: 'marketing_org_summary',
  supports: i => i.name === 'marketing_org_summary',
  async execute({ intent }) {
    const { buildMarketingSnapshot, formatMarketingBriefing } = await import(
      '../../marketing-org'
    );
    const snapshot = await buildMarketingSnapshot({});
    const text = formatMarketingBriefing(snapshot);
    return replyOk(intent.name, text.split('\n'), { health: snapshot.health });
  },
};

const aiStatus: IntentHandler = {
  name: 'ai_status',
  supports: i => i.name === 'ai_status',
  async execute({ intent }) {
    const { getAiStatusBriefingText, getAIProviderStatus } = await import('../../../aiService');
    const text = await getAiStatusBriefingText();
    const providers = await getAIProviderStatus();
    return replyOk(intent.name, text.split('\n'), { providers });
  },
};

const decisionReport: IntentHandler = {
  name: 'decision_report',
  supports: i => i.name === 'decision_report',
  async execute({ intent }) {
    const { getDecisionReportText, getDecisionMetrics } = await import('../../decision-center');
    const text = await getDecisionReportText();
    const metrics = await getDecisionMetrics();
    return replyOk(intent.name, text.split('\n'), { metrics });
  },
};

const knowledgeReport: IntentHandler = {
  name: 'knowledge_report',
  supports: i => i.name === 'knowledge_report',
  async execute({ intent }) {
    const { getKnowledgeReportText, getKnowledgeHealth } = await import('../../knowledge-base');
    const text = await getKnowledgeReportText();
    const health = await getKnowledgeHealth();
    return replyOk(intent.name, text.split('\n'), { health });
  },
};

const knowledgeHealth: IntentHandler = {
  name: 'knowledge_health',
  supports: i => i.name === 'knowledge_health',
  async execute({ intent }) {
    const { buildKnowledgeAnalytics, formatKnowledgeHealthBriefing } = await import(
      '../../knowledge-base'
    );
    const snap = await buildKnowledgeAnalytics();
    const text = formatKnowledgeHealthBriefing(snap);
    return replyOk(intent.name, text.split('\n'), { analytics: snap });
  },
};

const weeklyEvolution: IntentHandler = {
  name: 'weekly_evolution',
  supports: i => i.name === 'weekly_evolution',
  async execute({ intent }) {
    const { buildFeedbackCenterSnapshot, formatWeeklyEvolution } = await import(
      '../../knowledge-base'
    );
    const snap = await buildFeedbackCenterSnapshot();
    const text = formatWeeklyEvolution(snap);
    return replyOk(intent.name, text.split('\n'), { weekly: snap.weekly });
  },
};

const missionSummary: IntentHandler = {
  name: 'mission_summary',
  supports: i => i.name === 'mission_summary',
  async execute({ intent, port, ctx }) {
    const ops = await port.getOpsMetrics(true);
    const names = ops.machines.map(m => m.missionName).filter(Boolean) as string[];
    rememberMissionList(ctx, names);
    const lines = formatMissionSummaryLines(ops);
    const mid = names[0];
    return replyOk(
      intent.name,
      lines,
      { ops },
      mid ? missionActionKeyboard(mid) : opsActionKeyboard(),
    );
  },
};

const incidentSummary: IntentHandler = {
  name: 'incident_summary',
  supports: i => i.name === 'incident_summary',
  async execute({ intent, port, ctx }) {
    const signals = await port.detectIncidents();
    // Prefer actionable incidents for "Có lỗi không?"
    const focused = signals.incidents.filter(
      i =>
        i.severity === 'critical' ||
        i.severity === 'warning' ||
        ['source_removed', 'checkpoint', 'offline_agent', 'publish_failure'].includes(i.kind),
    );
    const list = focused.length ? focused : signals.incidents.filter(i => i.severity !== 'info');
    const show = list.length ? list : signals.incidents.slice(0, 5);
    const recs = recommendAll(show);
    ctx.lastAgentIds = show.map(i => i.entityId).filter(Boolean) as string[];
    const lines = formatIncidentCenterLines(show, recs);
    const entity = show[0]?.entityId;
    return replyOk(
      intent.name,
      lines,
      { signals, recs },
      entity ? incidentKeyboard(entity) : opsActionKeyboard(),
    );
  },
};

const machineDetail: IntentHandler = {
  name: 'machine_detail',
  supports: i => i.name === 'machine_detail',
  async execute({ intent, port, ctx }) {
    const q = intent.slots.agentId || intent.slots.query || '';
    const ops = await port.getOpsMetrics(true);
    const machine =
      (q && (await port.findMachine(q))) ||
      ops.machines.find(m => m.activity !== 'idle' && m.activity !== 'offline') ||
      ops.machines[0] ||
      null;
    if (!machine) {
      return replyFail(intent.name, 'Chưa có máy trong Fleet.');
    }
    ctx.lastAgentIds = [machine.agentId];
    return replyOk(
      intent.name,
      formatMachineDetailLines(machine),
      { machine },
      machineActionKeyboard(machine.agentId),
    );
  },
};

const browserDetail: IntentHandler = {
  name: 'browser_detail',
  supports: i => i.name === 'browser_detail',
  async execute({ intent, port }) {
    const browsers = await port.listBrowsers();
    const ops = await port.getOpsMetrics(false);
    const busy = browsers.find(b => b.busy) || browsers[0];
    if (!busy) {
      const m = ops.machines[0];
      return replyOk(
        intent.name,
        formatBrowserDetailLines({
          profile: '—',
          currentUrl: null,
          memoryMb: m?.rssMb ?? null,
          agentId: m?.agentId,
        }),
        { browsers },
        browserActionKeyboard(m?.agentId),
      );
    }
    const m = ops.machines.find(x => x.agentId === busy.agentId);
    return replyOk(
      intent.name,
      formatBrowserDetailLines({
        profile: busy.profile,
        account: busy.facebookAccount,
        currentUrl: busy.currentUrl,
        lockedBy: busy.lockedBy,
        mission: m?.missionName,
        memoryMb: m?.rssMb ?? null,
        agentId: busy.agentId,
      }),
      { busy },
      browserActionKeyboard(busy.agentId),
    );
  },
};

const runtimeExplain: IntentHandler = {
  name: 'runtime_explain',
  supports: i => i.name === 'runtime_explain',
  async execute({ intent, port }) {
    const lines = await port.explainScanner();
    return replyOk(intent.name, lines, {}, opsActionKeyboard());
  },
};

const opsRecommendation: IntentHandler = {
  name: 'ops_recommendation',
  supports: i => i.name === 'ops_recommendation',
  async execute({ intent, port }) {
    const signals = await port.detectIncidents();
    const recs = recommendAll(signals.incidents);
    if (recs.length === 0) {
      return replyOk(
        intent.name,
        ['Không cần xử lý gì ngay.', 'Fleet và queue đang ổn.'],
        { signals },
        opsActionKeyboard(),
      );
    }
    const lines = [
      'Cần xử lý:',
      ...recs.slice(0, 5).map(r => `• ${r.summary} → ${r.actionLabel}`),
    ];
    return replyOk(intent.name, lines, { recs }, opsActionKeyboard(recs[0].entityId));
  },
};

const leadCount: IntentHandler = {
  name: 'lead_count',
  supports: i => i.name === 'lead_count',
  async execute({ intent, port, ctx }) {
    const result = await port.countLeadsToday({ location: intent.slots.location });
    rememberFindingList(
      ctx,
      result.items.map(x => x.id),
    );
    const lines = formatLeadSummaryLines(result.total, result.items);
    const first = result.items[0];
    return replyOk(
      intent.name,
      lines,
      result,
      first ? approvalKeyboard(first.id) : opsActionKeyboard(),
    );
  },
};

const agentsOffline: IntentHandler = {
  name: 'agents_offline',
  supports: i => i.name === 'agents_offline',
  async execute({ intent, port, ctx }) {
    const offline = await port.listOfflineAgents();
    ctx.lastAgentIds = offline.map(a => a.agentId);
    if (offline.length === 0) {
      return replyOk(intent.name, ['Không có agent nào offline.'], { offline }, opsActionKeyboard());
    }
    const lines = [
      `${offline.length} agent offline:`,
      ...offline.map((a, i) => `${i + 1}. ${a.agentId} [${a.status}]`),
      'Khuyến nghị: Restart Agent hoặc kiểm tra process trên máy.',
    ];
    const first = offline[0];
    return replyOk(
      intent.name,
      lines,
      { offline },
      first ? incidentKeyboard(first.agentId) : undefined,
    );
  },
};

const retryFailedPublish: IntentHandler = {
  name: 'retry_failed_publish',
  supports: i => i.name === 'retry_failed_publish',
  async execute({ intent, port, ctx }) {
    const failed = await port.listFailedPublishJobs(10);
    rememberJobList(
      ctx,
      failed.map(j => j.id),
      'failed_publish',
    );
    if (failed.length === 0) {
      return replyOk(intent.name, ['Không có publish job lỗi để retry.'], {}, opsActionKeyboard());
    }
    const results: string[] = [];
    for (const job of failed) {
      const r = await port.retryPublish(job.id);
      results.push(r.ok ? `✓ ${job.id.slice(0, 10)}` : `✗ ${job.id.slice(0, 10)} ${r.error || ''}`);
    }
    return replyOk(
      intent.name,
      [`Đã retry ${failed.length} publish lỗi:`, ...results],
      { failed },
      publishJobKeyboard(failed[0].id),
    );
  },
};

const pauseScanner: IntentHandler = {
  name: 'pause_scanner',
  supports: i => i.name === 'pause_scanner',
  async execute({ intent, port, ctx }) {
    const name = intent.slots.missionName || 'buyer';
    const r = await port.pauseMission(name);
    rememberMissionList(ctx, [name]);
    return replyOk(
      intent.name,
      [r.ok ? `Đã gửi pause scanner/mission: ${name}` : r.message],
      { name, r },
      missionActionKeyboard(name),
    );
  },
};

const resumePublish: IntentHandler = {
  name: 'resume_publish',
  supports: i => i.name === 'resume_publish',
  async execute({ intent, port }) {
    const cmd = await port.runCommand('/publish queue');
    const text = formatCommandText(cmd);
    return replyOk(
      intent.name,
      ['Publish queue:', text],
      { cmd },
      opsActionKeyboard(),
      '/publish queue',
    );
  },
};

const searchLeads: IntentHandler = {
  name: 'search_leads',
  supports: i => i.name === 'search_leads',
  async execute({ intent, port, ctx }) {
    const bounds = dayBounds(intent.slots.dateHint);
    const result = await port.searchLeads({
      location: intent.slots.location,
      query: intent.slots.query,
      createdFrom: bounds.from,
      createdTo: bounds.to,
      limit: 10,
    });
    rememberFindingList(
      ctx,
      result.items.map(x => x.id),
    );
    const lines = formatLeadLines(result.items, result.total);
    const first = result.items[0];
    return replyOk(
      intent.name,
      formatLeadSummaryLines(result.total, result.items).length > 2
        ? formatLeadSummaryLines(result.total, result.items)
        : lines,
      result,
      first ? approvalKeyboard(first.id) : opsActionKeyboard(),
    );
  },
};

const searchJobs: IntentHandler = {
  name: 'search_jobs',
  supports: i => i.name === 'search_jobs',
  async execute({ intent, port, ctx }) {
    const cmd = await port.runCommand('/jobs failed');
    const text = formatCommandText(cmd);
    const ids =
      (cmd.data?.jobs as Array<{ id?: string }> | undefined)
        ?.map(j => String(j.id || ''))
        .filter(Boolean) || [];
    rememberJobList(ctx, ids, 'failed_jobs');
    return replyOk(
      intent.name,
      ['Job lỗi gần đây:', text],
      cmd.data,
      ids[0] ? agentJobKeyboard(ids[0]) : opsActionKeyboard(),
      '/jobs failed',
    );
  },
};

const searchCampaigns: IntentHandler = {
  name: 'search_campaigns',
  supports: i => i.name === 'search_campaigns',
  async execute({ intent, port }) {
    const report = await port.report('campaign');
    const lines = [
      'Campaign Summary',
      `Health ${String(report.healthScore ?? '—')}/100`,
      'Chi tiết campaign xem CMS · không dump JSON.',
    ];
    return replyOk(intent.name, lines, { report }, opsActionKeyboard());
  },
};

const reportHandler: IntentHandler = {
  name: 'report',
  supports: i => i.name === 'report',
  async execute({ intent, port }) {
    const kind = (intent.slots.reportKind || 'daily') as
      | 'daily'
      | 'weekly'
      | 'publish'
      | 'scanner'
      | 'failed'
      | 'campaign';
    if (kind === 'scanner') {
      const ops = await port.getOpsMetrics(true);
      return replyOk(intent.name, formatScannerSummaryLines(ops), { ops }, opsActionKeyboard());
    }
    if (kind === 'publish') {
      const ops = await port.getOpsMetrics(true);
      return replyOk(intent.name, formatPublisherSummaryLines(ops), { ops }, opsActionKeyboard());
    }
    const ops = await port.getOpsMetrics(true);
    const leads = await port.countLeadsToday();
    return replyOk(
      intent.name,
      formatDashboardBriefLines(ops, { leadsToday: leads.total }),
      { kind, ops },
      opsActionKeyboard(),
    );
  },
};

const insightHandler: IntentHandler = {
  name: 'insight',
  supports: i => i.name === 'insight',
  async execute({ intent, port }) {
    const bundle = await port.buildInsights();
    const signals = await port.detectIncidents();
    const recs = recommendAll(signals.incidents).slice(0, 3);
    const lines = [
      'AI Insight:',
      ...bundle.lines,
      ...(recs.length ? ['', 'Khuyến nghị:', ...recs.map(r => `• ${r.summary}`)] : []),
    ];
    return replyOk(intent.name, lines, { bundle, recs }, opsActionKeyboard());
  },
};

const contextualRetry: IntentHandler = {
  name: 'contextual_retry',
  supports: i => i.name === 'contextual_retry',
  async execute({ intent, port, ctx }) {
    const id =
      intent.slots.jobId ||
      resolveIndexedId(ctx.lastJobIds, intent.slots.jobIndex) ||
      resolveIndexedId(ctx.lastMissionIds, intent.slots.jobIndex);
    if (!id) {
      return replyFail(
        intent.name,
        'Chưa có danh sách job/mission trong context. Hỏi "Có lỗi không?" trước.',
      );
    }
    const cmd = await port.runCommand(`/retry ${id}`);
    return replyOk(
      intent.name,
      [`Retry ${id}:`, formatCommandText(cmd)],
      { id, cmd },
      missionActionKeyboard(id),
      `/retry ${id}`,
    );
  },
};

const contextualCancel: IntentHandler = {
  name: 'contextual_cancel',
  supports: i => i.name === 'contextual_cancel',
  async execute({ intent, port, ctx }) {
    const id =
      intent.slots.jobId ||
      resolveIndexedId(ctx.lastJobIds, intent.slots.jobIndex) ||
      resolveIndexedId(ctx.lastMissionIds, intent.slots.jobIndex);
    if (!id) {
      return replyFail(intent.name, 'Chưa có id trong context để cancel.');
    }
    const cmd = await port.runCommand(`/mission cancel ${id}`);
    return replyOk(intent.name, [`Cancel ${id}:`, formatCommandText(cmd)], { id, cmd });
  },
};

const approvalAction: IntentHandler = {
  name: 'approval_action',
  supports: i => i.name === 'approval_action',
  async execute({ intent, port, ctx }) {
    const id = intent.slots.findingId || ctx.pendingApprovalId;
    const action = intent.slots.action || 'approve';
    if (!id) return replyFail(intent.name, 'Thiếu finding id để approval.');
    if (action === 'reject' || action === 'skip') {
      const cmd = await port.runCommand(`/lead skip ${id}`);
      return replyOk(intent.name, [`Reject/Skip ${id}:`, formatCommandText(cmd)], { id });
    }
    if (action === 'mission' || action === 'create_mission') {
      const cmd = await port.runCommand(`/lead mission ${id}`);
      return replyOk(intent.name, [`Create Mission ${id}:`, formatCommandText(cmd)], { id });
    }
    if (action === 'edit') {
      return replyOk(
        intent.name,
        [`Edit lead ${id}: mở CMS Lead Intelligence để chỉnh.`, `id=${id}`],
        { id },
      );
    }
    const cmd = await port.runCommand(`/lead retry ${id}`);
    return replyOk(intent.name, [`Approve/Notify ${id}:`, formatCommandText(cmd)], { id });
  },
};

const incidentAction: IntentHandler = {
  name: 'incident_action',
  supports: i => i.name === 'incident_action',
  async execute({ intent, port, ctx }) {
    const id = intent.slots.agentId || intent.slots.jobId || resolveIndexedId(ctx.lastAgentIds, 1);
    const action = intent.slots.action || 'ack';
    if (!id) return replyFail(intent.name, 'Thiếu entity cho incident.');
    if (action === 'mute') {
      if (!ctx.mutedIncidentKeys.includes(id)) ctx.mutedIncidentKeys.push(id);
      return replyOk(intent.name, [`Đã mute incident: ${id}`], { id }, opsActionKeyboard(id));
    }
    if (action === 'ack' || action === 'acknowledge') {
      return replyOk(intent.name, [`Acknowledged: ${id}`], { id }, opsActionKeyboard(id));
    }
    if (action === 'escalate') {
      return replyOk(
        intent.name,
        [`Escalate ${id}: đã ghi nhận — có thể Restart Agent.`],
        { id },
        incidentKeyboard(id),
      );
    }
    const cmd = await port.runCommand(`/agent restart ${id}`);
    return replyOk(
      intent.name,
      [`Retry/Restart ${id}:`, formatCommandText(cmd)],
      { id },
      machineActionKeyboard(id),
    );
  },
};

const helpHandler: IntentHandler = {
  name: 'help',
  supports: i => i.name === 'help' || i.name === 'unknown',
  async execute({ intent, text }) {
    if (intent.name === 'unknown') {
      return replyOk(
        intent.name,
        [
          `Mình chưa chắc ý "${text.slice(0, 80)}".`,
          'Thử: "Có gì mới?" · "Máy nào đang bận?" · "Có lỗi không?"',
          '"Scanner sao rồi?" · "Publisher thế nào?" · "Tại sao Scanner không chạy?"',
          'Hoặc /help',
        ],
        {},
        opsActionKeyboard(),
      );
    }
    return replyOk(
      intent.name,
      [
        'AI Operations Center — hỏi tiếng Việt, không cần slash.',
        '• Có gì mới? · Máy nào đang bận? · Có lỗi gì không?',
        '• Scanner / Publisher / Mission / Browser / Lead',
        '• AI Status · Knowledge Health · Weekly Evolution',
        '• Mỗi trả lời có nút: Refresh · Fleet · Retry · Release Browser',
      ],
      {},
      opsActionKeyboard(),
    );
  },
};

const rawCommand: IntentHandler = {
  name: 'raw_command',
  supports: i => i.name === 'raw_command',
  async execute({ intent, port, ctx }) {
    const raw = intent.slots.rawCommand || '';
    const cmd = await port.runCommand(raw);
    const jobs = (cmd.data?.jobs as Array<{ id?: string }> | undefined) || [];
    if (jobs.length) {
      rememberJobList(
        ctx,
        jobs.map(j => String(j.id || '')).filter(Boolean),
        raw,
      );
    }
    return replyOk(
      intent.name,
      [formatCommandText(cmd)],
      cmd.data,
      cmd.replyMarkup || opsActionKeyboard(),
      raw,
    );
  },
};

export function registerDefaultIntentHandlers(registry: IntentRegistry): void {
  const all = [
    whatsNew,
    fleetSummary,
    scannerSummary,
    publisherSummary,
    marketingOrgSummary,
    aiStatus,
    decisionReport,
    knowledgeReport,
    knowledgeHealth,
    weeklyEvolution,
    missionSummary,
    incidentSummary,
    machineDetail,
    browserDetail,
    runtimeExplain,
    opsRecommendation,
    aiSalesCampaign,
    aiSalesResearch,
    aiSalesMissions,
    aiSalesLeads,
    aiSalesContent,
    aiSalesTimeline,
    aiSalesRecommendations,
    aiSalesHelp,
    leadCount,
    agentsOffline,
    retryFailedPublish,
    pauseScanner,
    resumePublish,
    searchLeads,
    searchJobs,
    searchCampaigns,
    reportHandler,
    insightHandler,
    contextualRetry,
    contextualCancel,
    approvalAction,
    incidentAction,
    rawCommand,
    helpHandler,
  ];
  for (const h of all) registry.register(h);
}

export function classifiedFromApproval(
  action: string,
  findingId: string,
): ClassifiedIntent {
  return {
    name: 'approval_action',
    confidence: 1,
    source: 'command',
    slots: { action, findingId },
  };
}

export function classifiedFromIncident(
  action: string,
  agentId: string,
): ClassifiedIntent {
  return {
    name: 'incident_action',
    confidence: 1,
    source: 'command',
    slots: { action, agentId },
  };
}
