/**
 * Telegram Operations Experience — human summaries (F5).
 * Conclusion first · no JSON · no raw metrics dumps.
 */

import type { OperationsMetricsSnapshot } from '../operations/types';
import type { OpsIncident } from './operationalIntelligence';
import { recommendForIncident, type OpsRecommendation } from './recommendations';
import type { CopilotLeadHit } from './ports';

function bar(pct: number, width = 8): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((p / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function activityEmoji(activity: string, status: string): string {
  if (status === 'offline' || activity === 'offline') return '⚪';
  if (activity === 'error') return '🔴';
  return '🟢';
}

function severityMark(s: OpsIncident['severity']): string {
  if (s === 'critical') return '❌';
  if (s === 'warning') return '⚠';
  return 'ℹ';
}

function ramPct(m: OperationsMetricsSnapshot['machines'][number]): string {
  if (m.memFreeMb != null && m.memTotalMb != null && m.memTotalMb > 0) {
    return `${Math.round(((m.memTotalMb - m.memFreeMb) / m.memTotalMb) * 100)}%`;
  }
  if (m.rssMb != null) return `RSS ${m.rssMb}MB`;
  return '—';
}

function cpuPct(m: OperationsMetricsSnapshot['machines'][number]): string {
  return m.cpuLoad1m != null ? `${Math.round(m.cpuLoad1m * 10) / 10}%` : '—';
}

function heartbeat(m: OperationsMetricsSnapshot['machines'][number]): string {
  if (m.heartbeatAgeMs == null) return '—';
  const s = Math.max(0, Math.round(m.heartbeatAgeMs / 1000));
  return `${s}s`;
}

function progressPct(m: OperationsMetricsSnapshot['machines'][number]): number {
  const total = m.assigned || m.running + m.waiting + m.completed;
  if (!total) return m.activity === 'idle' ? 100 : m.running > 0 ? 45 : 0;
  return Math.round((m.completed / Math.max(1, total)) * 100);
}

function roleOf(m: OperationsMetricsSnapshot['machines'][number]): string {
  if (m.status === 'offline' || m.activity === 'offline') return 'Offline';
  if (m.activity === 'scanning') return 'Scanner';
  if (m.activity === 'publishing') return 'Publisher';
  if (m.activity === 'campaign') return 'Campaign';
  if (m.activity === 'browser_hold') return 'Browser';
  if (m.activity === 'busy') return 'Busy';
  return 'Control Plane';
}

function systemVerdict(
  ops: OperationsMetricsSnapshot,
  incidents: OpsIncident[],
  leadsToday: number,
): string[] {
  const critical = incidents.filter(i => i.severity === 'critical');
  const warnings = incidents.filter(i => i.severity === 'warning');
  const lines: string[] = [];

  if (critical.length > 0) {
    lines.push(`🔴 Có ${critical.length} sự cố cần xử lý.`);
  } else if (warnings.length > 0) {
    lines.push(`🟡 Hệ thống chạy — ${warnings.length} cảnh báo.`);
  } else if (ops.fleet.healthScore >= 80) {
    lines.push('🟢 Hệ thống đang hoạt động ổn định.');
  } else {
    lines.push('🟡 Hệ thống đang chạy — health cần theo dõi.');
  }

  lines.push(
    `${ops.fleet.machinesOnline} máy online` +
      (ops.fleet.machinesBusy ? ` · ${ops.fleet.machinesBusy} bận` : ''),
  );

  if (ops.publisher.publishing > 0) {
    lines.push(`Publisher đang đăng · ${ops.publisher.publishing} job.`);
  } else {
    lines.push('Không có Publish đang chạy.');
  }

  if (ops.scanner.running > 0) {
    lines.push(`Scanner đang quét · ${ops.scanner.running} source.`);
  } else if (ops.scanner.sources > 0 && ops.scanner.completed >= ops.scanner.sources) {
    lines.push('Scanner đã hoàn thành toàn bộ nguồn.');
  } else if (ops.scanner.assigned === 0) {
    lines.push('Scanner đang idle — không còn source pending.');
  } else {
    lines.push(`Scanner · completed ${ops.scanner.completed}/${ops.scanner.sources}.`);
  }

  lines.push(`Hôm nay tìm được ${leadsToday} lead.`);
  return lines;
}

/** AI Briefing — conclusion first, then light facts. */
export function formatDashboardBriefLines(
  ops: OperationsMetricsSnapshot,
  extras?: {
    leadsToday?: number;
    incidents?: OpsIncident[];
    recommendations?: string[];
  },
): string[] {
  const incidents = extras?.incidents || [];
  const leadsToday = extras?.leadsToday ?? 0;
  const lines = [
    '🤖 AI Briefing',
    '',
    ...systemVerdict(ops, incidents, leadsToday),
    '',
    '--------',
    `Health ${ops.fleet.healthScore}/100`,
    `Fleet ${ops.fleet.machinesOnline}/${Math.max(ops.machines.length, ops.fleet.machinesOnline + ops.fleet.machinesOffline)} online`,
    `Scanner · run ${ops.scanner.running} · findings ${ops.scanner.findingsToday}`,
    `Publisher · queue ${ops.publisher.queue} · today ${ops.publisher.publishedToday}`,
    `Mission · run ${ops.mission.running} · fail ${ops.mission.failed}`,
  ];

  if (incidents.length) {
    lines.push('');
    lines.push('Incidents');
    for (const i of incidents.slice(0, 3)) {
      lines.push(`${severityMark(i.severity)} ${i.title}`);
    }
  }
  if (extras?.recommendations?.length) {
    lines.push('');
    lines.push('Recommendations');
    for (const r of extras.recommendations.slice(0, 2)) lines.push(`• ${r}`);
  }
  return lines;
}

export function formatFleetAwarenessLines(
  ops: OperationsMetricsSnapshot,
  capacityHint?: { totalMachines?: number },
): string[] {
  const total =
    capacityHint?.totalMachines ??
    Math.max(ops.machines.length, ops.fleet.machinesOnline + ops.fleet.machinesOffline, 1);
  const lines = [
    'Fleet',
    `${ops.fleet.machinesOnline} / ${total} online`,
    '--------',
  ];
  if (ops.machines.length === 0) {
    lines.push('Chưa có máy online.');
    return lines;
  }
  for (const m of ops.machines.slice(0, 8)) {
    const name = m.displayName || m.hostname;
    lines.push(name);
    lines.push(
      `${activityEmoji(m.activity, m.status)} ${
        m.status === 'offline' ? 'Offline' : 'Online'
      }`,
    );
    lines.push(roleOf(m));
    if (m.activity === 'idle') {
      lines.push('Healthy');
    } else {
      lines.push(String(m.currentStep || m.activity));
      if (m.missionName) lines.push(String(m.missionName));
      lines.push(bar(progressPct(m)));
    }
    if (m.status !== 'offline') {
      lines.push(`CPU`);
      lines.push(cpuPct(m));
      lines.push(`RAM`);
      lines.push(ramPct(m));
      lines.push(`Heartbeat`);
      lines.push(heartbeat(m));
    }
    lines.push('--------');
  }
  if (lines[lines.length - 1] === '--------') lines.pop();
  return lines;
}

export function formatScannerSummaryLines(
  ops: OperationsMetricsSnapshot,
  topLead?: CopilotLeadHit | { title?: string | null; score?: number | null } | null,
): string[] {
  const s = ops.scanner;
  const scanning = ops.machines.filter(
    m => m.activity === 'scanning' || String(m.currentStep || '').toLowerCase().includes('scan'),
  );
  const current = scanning[0];
  const eta =
    s.running > 0 && s.completed > 0
      ? `~${Math.max(1, Math.ceil((Math.max(s.assigned, 1) - s.completed) / Math.max(1, s.running)))} batch`
      : s.running > 0
        ? 'in progress'
        : '—';
  const progress =
    s.sources > 0
      ? Math.round((s.completed / Math.max(s.sources, 1)) * 100)
      : current
        ? progressPct(current)
        : 0;

  const lines = [
    'Scanner',
    `${s.sources} Sources`,
    `${s.completed} Completed`,
    `${s.running} Running`,
    '',
  ];

  if (current) {
    lines.push('Current');
    lines.push(String(current.missionName || current.currentStep || 'scan_source'));
    lines.push(`Machine`);
    lines.push(current.displayName || current.hostname);
    lines.push(bar(progressPct(current)));
  } else {
    lines.push('Current');
    lines.push(s.assigned > 0 ? 'Waiting for claim' : 'Idle — không còn source pending');
  }

  lines.push('');
  lines.push(`Posts`);
  lines.push(String(s.postsScanned));
  lines.push(`Leads`);
  lines.push(String(s.findingsToday));
  lines.push(`ETA`);
  lines.push(eta);
  lines.push(bar(progress));

  if (topLead) {
    lines.push('');
    lines.push('Top Lead');
    lines.push(`${topLead.score ?? '—'}`);
    lines.push(topLead.title || '—');
  }
  return lines;
}

export function formatPublisherSummaryLines(ops: OperationsMetricsSnapshot): string[] {
  const p = ops.publisher;
  const pubs = ops.machines.filter(m => m.activity === 'publishing');
  const current = pubs[0];
  const lines = [
    'Publisher',
    `Queue ${p.queue}`,
    `Publishing ${p.publishing}`,
    `Published Today ${p.publishedToday}`,
    `Draft ${p.draft}`,
    `Retry ${p.retry}`,
    '',
  ];
  if (!current) {
    lines.push('Current Draft · —');
    lines.push('Destination · —');
    lines.push('Machine · idle');
  } else {
    lines.push('Current Draft');
    lines.push(String(current.missionName || current.currentStep || 'publish'));
    lines.push('Destination');
    lines.push(String(current.currentStep || 'Facebook'));
    lines.push('Current Step');
    lines.push(String(current.activity));
    lines.push('Machine');
    lines.push(current.displayName || current.hostname);
    lines.push(bar(progressPct(current)));
  }
  return lines;
}

export function formatMissionSummaryLines(ops: OperationsMetricsSnapshot): string[] {
  const mi = ops.mission;
  const withMission = ops.machines.filter(m => m.missionName || m.activity === 'busy' || m.activity === 'scanning' || m.activity === 'publishing');
  const lines = [
    'Mission',
    `Running ${mi.running}`,
    `Waiting ${mi.waiting}`,
    `Completed ${mi.completed}`,
    `Failed ${mi.failed}`,
    '',
  ];
  if (withMission.length === 0 || mi.running === 0) {
    lines.push('Current Mission · —');
    lines.push('Không có mission đang chạy.');
  } else {
    for (const m of withMission.slice(0, 4)) {
      lines.push('Current Mission');
      lines.push(String(m.missionName || m.currentStep || m.activity));
      lines.push('Machine');
      lines.push(m.displayName || m.hostname);
      lines.push(bar(progressPct(m)));
      lines.push('--------');
    }
    if (lines[lines.length - 1] === '--------') lines.pop();
  }
  return lines;
}

export function formatIncidentCenterLines(
  incidents: OpsIncident[],
  recommendations?: OpsRecommendation[],
): string[] {
  const lines = ['Incident Center', ''];
  if (incidents.length === 0) {
    lines.push('🟢 Không có sự cố đáng chú ý.');
    return lines;
  }
  for (const i of incidents.slice(0, 8)) {
    lines.push(`${severityMark(i.severity)} ${i.title}`);
    // Soft detail — never stack traces / raw JSON
    const soft = i.detail.replace(/\{[\s\S]*\}/g, '').trim().slice(0, 120);
    if (soft) lines.push(soft);
    const rec =
      recommendations?.find(r => r.incidentId === i.id) || recommendForIncident(i);
    if (rec) {
      lines.push(`→ ${rec.summary}`);
      lines.push(`Đề xuất: ${rec.actionLabel}`);
    }
    lines.push('');
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function formatMachineDetailLines(
  m: OperationsMetricsSnapshot['machines'][number],
): string[] {
  return [
    m.displayName || m.hostname,
    '',
    `Status · ${m.status === 'online' || m.status === 'degraded' ? 'Online' : 'Offline'}`,
    `CPU · ${cpuPct(m)}`,
    `RAM · ${ramPct(m)}`,
    `Execution Slots · ${m.running}/${Math.max(1, m.executionSlots || 1)}`,
    `Browser · busy ${m.browserBusy} · idle ${m.browserIdle}`,
    `Current Mission · ${m.missionName || '—'}`,
    `Current Job · ${m.currentStep || m.activity}`,
    `Heartbeat · ${heartbeat(m)}`,
    bar(progressPct(m)),
  ];
}

export function formatBrowserDetailLines(input: {
  profile?: string | null;
  account?: string | null;
  currentUrl?: string | null;
  mission?: string | null;
  lockedBy?: string | null;
  memoryMb?: number | null;
  agentId?: string | null;
  runningSec?: number | null;
}): string[] {
  return [
    'Browser',
    '',
    `Profile · ${input.profile || '—'}`,
    `Facebook Account · ${input.account || '—'}`,
    `Current URL · ${input.currentUrl || '—'}`,
    `Mission · ${input.mission || '—'}`,
    `Locked By · ${input.lockedBy || '—'}`,
    `Running Time · ${input.runningSec != null ? `${input.runningSec}s` : '—'}`,
    `Memory · ${input.memoryMb != null ? `${input.memoryMb}MB` : '—'}`,
  ];
}

export function formatLeadSummaryLines(
  total: number,
  items: CopilotLeadHit[],
): string[] {
  const lines = ['Lead Today', String(total), '', 'Top Leads'];
  if (!items.length) {
    lines.push('—');
    return lines;
  }
  for (const item of items.slice(0, 5)) {
    lines.push(String(item.score ?? '—'));
    lines.push(item.title || 'Lead');
    const bits = [
      item.location,
      item.intent || item.classification,
      item.budget,
      item.source,
    ].filter(Boolean);
    if (bits.length) lines.push(bits.join(' · '));
    if (item.link) lines.push(item.link);
    lines.push('');
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Daily briefing — max ~15 lines. */
export function formatDailyBriefingLines(input: {
  slotLabel: string;
  ops: OperationsMetricsSnapshot;
  leadsToday: number;
  topLeads: Array<{ title?: string | null; score?: number | null }>;
  incidents: OpsIncident[];
  recommendations: string[];
}): string[] {
  const { ops } = input;
  const verdict =
    input.incidents.some(i => i.severity === 'critical')
      ? '🔴 Cần xử lý'
      : input.incidents.some(i => i.severity === 'warning')
        ? '🟡 Có cảnh báo'
        : '🟢 Ổn định';

  const lines = [
    `🤖 AI Operations Briefing · ${input.slotLabel}`,
    '--------',
    `System · ${verdict} · health ${ops.fleet.healthScore}`,
    `Fleet · ${ops.fleet.machinesOnline} online · ${ops.fleet.machinesBusy} busy`,
    `Scanner · run ${ops.scanner.running} · findings ${ops.scanner.findingsToday}`,
    `Publisher · queue ${ops.publisher.queue} · today ${ops.publisher.publishedToday}`,
    `Mission · run ${ops.mission.running} · fail ${ops.mission.failed}`,
    `Lead · ${input.leadsToday}`,
  ];

  if (input.topLeads[0]) {
    lines.push(
      `Top · [${input.topLeads[0].score ?? '—'}] ${input.topLeads[0].title || 'lead'}`,
    );
  }

  if (input.incidents.length) {
    lines.push(
      `Incidents · ${input.incidents
        .slice(0, 2)
        .map(i => i.title)
        .join(' · ')}`,
    );
  } else {
    lines.push('Incidents · none');
  }

  if (input.recommendations.length) {
    lines.push(`→ ${input.recommendations[0]}`);
  } else {
    lines.push('→ Không cần hành động ngay.');
  }

  lines.push('--------');
  return lines.slice(0, 15);
}

// Back-compat alias used by older imports
export { formatDashboardBriefLines as formatAiBriefingLines };
