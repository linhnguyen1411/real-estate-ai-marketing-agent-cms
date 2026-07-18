/**
 * Intent handlers — Strategy objects registered on IntentRegistry.
 */

import { formatCommandText } from '../command-engine';
import {
  agentJobKeyboard,
  approvalKeyboard,
  incidentKeyboard,
  missionActionKeyboard,
  publishJobKeyboard,
} from '../inlineKeyboard';
import {
  rememberFindingList,
  rememberJobList,
  rememberMissionList,
  resolveIndexedId,
} from './contextStore';
import { formatLeadLines, replyFail, replyOk } from './replyFormatter';
import type { IntentHandler, IntentRegistry } from './intentRegistry';
import type { ClassifiedIntent } from './types';

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
    const dash = await port.getDashboard();
    const leads = await port.countLeadsToday();
    const offline = await port.listOfflineAgents();
    rememberFindingList(
      ctx,
      leads.items.map(x => x.id),
    );
    const lines = [
      'Có gì mới:',
      `• Health ${String(dash.healthScore ?? '—')}/100`,
      `• Lead hôm nay: ${leads.total}`,
      `• Agents online ${String(dash.agentsOnline ?? 0)}/${String(dash.agentsTotal ?? 0)}`,
      offline.length ? `• Offline: ${offline.map(a => a.agentId).join(', ')}` : '• Không có agent offline',
      `• Queue wait=${String((dash.queue as { waiting?: number } | undefined)?.waiting ?? '—')} fail=${String((dash.queue as { deadLetter?: number } | undefined)?.deadLetter ?? '—')}`,
      `• Missions run=${String((dash.missions as { running?: number } | undefined)?.running ?? '—')}`,
    ];
    return replyOk(intent.name, lines, { dash, leads, offline });
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
    const loc = intent.slots.location ? ` tại ${intent.slots.location}` : '';
    const lines = [
      `Hôm nay có ${result.total} lead${loc}.`,
      ...formatLeadLines(result.items, result.total).slice(1),
    ];
    const first = result.items[0];
    return replyOk(
      intent.name,
      lines,
      result,
      first ? approvalKeyboard(first.id) : undefined,
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
      return replyOk(intent.name, ['Không có agent nào offline.'], { offline });
    }
    const lines = [
      `${offline.length} agent offline:`,
      ...offline.map((a, i) => `${i + 1}. ${a.agentId} [${a.status}]`),
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
      return replyOk(intent.name, ['Không có publish job lỗi để retry.']);
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
    return replyOk(intent.name, ['Khởi động lại / kiểm tra publish queue:', text], { cmd }, undefined, '/publish queue');
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
      lines,
      result,
      first ? approvalKeyboard(first.id) : undefined,
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
      (cmd.data?.jobs as Array<{ id?: string }> | undefined)?.map(j => String(j.id || '')).filter(Boolean) ||
      [];
    rememberJobList(ctx, ids, 'failed_jobs');
    return replyOk(
      intent.name,
      ['Job publish / agent lỗi:', text],
      cmd.data,
      ids[0] ? agentJobKeyboard(ids[0]) : undefined,
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
      'Campaign (cửa sổ gần đây):',
      `health=${String(report.healthScore ?? '—')}`,
      `events=${JSON.stringify(report.eventCounts ?? {}).slice(0, 180)}`,
    ];
    return replyOk(intent.name, lines, { report });
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
    const report = await port.report(kind);
    return replyOk(
      intent.name,
      [
        `Báo cáo · ${kind}`,
        `health=${String(report.healthScore ?? '—')}`,
        `metrics=${JSON.stringify(report.metrics ?? {}).slice(0, 200)}`,
      ],
      { report },
    );
  },
};

const insightHandler: IntentHandler = {
  name: 'insight',
  supports: i => i.name === 'insight',
  async execute({ intent, port }) {
    const bundle = await port.buildInsights();
    return replyOk(intent.name, ['AI Insight:', ...bundle.lines], bundle);
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
      return replyFail(intent.name, 'Chưa có danh sách job/mission trong context. Gõ /jobs trước.');
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
      return replyOk(intent.name, [`Edit lead ${id}: mở CMS Lead Intelligence để chỉnh.`, `id=${id}`], { id });
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
      return replyOk(intent.name, [`Đã mute incident: ${id}`], { id });
    }
    if (action === 'ack' || action === 'acknowledge') {
      return replyOk(intent.name, [`Acknowledged: ${id}`], { id });
    }
    if (action === 'escalate') {
      return replyOk(
        intent.name,
        [`Escalate ${id}: đã ghi OPS_REQUEST escalate (qua /agent restart nếu agent).`],
        { id },
      );
    }
    const cmd = await port.runCommand(`/agent restart ${id}`);
    return replyOk(intent.name, [`Retry/Restart ${id}:`, formatCommandText(cmd)], { id });
  },
};

const helpHandler: IntentHandler = {
  name: 'help',
  supports: i => i.name === 'help' || i.name === 'unknown',
  async execute({ intent, text }) {
    if (intent.name === 'unknown') {
      return replyOk(intent.name, [
        `Mình chưa chắc ý "${text.slice(0, 80)}".`,
        'Thử: "Có gì mới?", "Hôm nay có bao nhiêu lead?", "Có agent nào offline?",',
        '"Retry tất cả publish lỗi.", "Tìm lead Hòa Xuân hôm nay.", hoặc /help',
      ]);
    }
    return replyOk(intent.name, [
      'Copilot — nói tiếng Việt hoặc slash command.',
      'VD: Có gì mới? · Lead hôm nay · Agent offline · Retry publish lỗi',
      'Context: sau /jobs có thể nói "retry job 1"',
      'Slash: /dashboard /jobs /mission /publish /report /lead',
    ]);
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
      cmd.replyMarkup,
      raw,
    );
  },
};

export function registerDefaultIntentHandlers(registry: IntentRegistry): void {
  const all = [
    whatsNew,
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
