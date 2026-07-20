/**
 * Human-readable Operations summaries for Copilot (no JSON dumps).
 */

import type { OperationsMetricsSnapshot } from '../operations/types';
import type { OpsIncident } from './operationalIntelligence';
import { recommendForIncident, type OpsRecommendation } from './recommendations';

function bar(pct: number, width = 8): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((p / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function activityEmoji(activity: string, status: string): string {
  if (status === 'offline' || activity === 'offline') return '⚪';
  if (activity === 'error') return '🔴';
  if (['scanning', 'publishing', 'campaign', 'busy', 'browser_hold'].includes(activity)) {
    return '🟢';
  }
  return '🟢';
}

function severityMark(s: OpsIncident['severity']): string {
  if (s === 'critical') return '❌';
  if (s === 'warning') return '⚠';
  return 'ℹ';
}

function ramLine(m: OperationsMetricsSnapshot['machines'][number]): string {
  if (m.memFreeMb != null && m.memTotalMb != null && m.memTotalMb > 0) {
    const used = Math.round(((m.memTotalMb - m.memFreeMb) / m.memTotalMb) * 100);
    return `RAM ${used}%`;
  }
  if (m.rssMb != null) return `RSS ${m.rssMb}MB`;
  return 'RAM —';
}

function cpuLine(m: OperationsMetricsSnapshot['machines'][number]): string {
  return m.cpuLoad1m != null ? `CPU ${Math.round(m.cpuLoad1m * 10) / 10}%` : 'CPU —';
}

function progressPct(m: OperationsMetricsSnapshot['machines'][number]): number {
  const total = m.assigned || m.running + m.waiting + m.completed;
  if (!total) return m.activity === 'idle' ? 100 : m.running > 0 ? 40 : 0;
  return Math.round((m.completed / total) * 100);
}

export function formatFleetAwarenessLines(ops: OperationsMetricsSnapshot): string[] {
  const lines = [
    'Fleet',
    `${ops.machines.length} Machine${ops.machines.length === 1 ? '' : 's'}`,
    '',
  ];
  if (ops.machines.length === 0) {
    lines.push('Chưa có máy online.');
    return lines;
  }
  for (const m of ops.machines.slice(0, 12)) {
    const emoji = activityEmoji(m.activity, m.status);
    const role =
      m.activity === 'scanning'
        ? 'Scanner'
        : m.activity === 'publishing'
          ? 'Publisher'
          : m.activity === 'campaign'
            ? 'Campaign'
            : m.status === 'offline'
              ? 'Offline'
              : 'Control Plane';
    lines.push(`${emoji} ${m.displayName || m.hostname}`);
    lines.push(role);
    lines.push(
      m.status === 'offline'
        ? 'Offline'
        : m.activity === 'idle'
          ? 'Healthy / Idle'
          : String(m.currentStep || m.activity),
    );
    if (m.missionName) lines.push(String(m.missionName));
    const pct = progressPct(m);
    if (m.activity !== 'offline') lines.push(bar(pct));
    if (m.status !== 'offline') {
      lines.push(`${cpuLine(m)} · ${ramLine(m)}`);
    }
    lines.push('--------');
  }
  if (lines[lines.length - 1] === '--------') lines.pop();
  return lines;
}

export function formatScannerSummaryLines(
  ops: OperationsMetricsSnapshot,
  topLead?: { title?: string | null; score?: number | null } | null,
): string[] {
  const s = ops.scanner;
  const scanning = ops.machines.filter(
    m => m.activity === 'scanning' || String(m.currentStep || '').includes('scan'),
  );
  const eta =
    s.running > 0 && s.completed > 0
      ? `~${Math.max(1, Math.ceil((Math.max(s.assigned, s.sources) - s.completed) / Math.max(1, s.running)))} batch`
      : s.running > 0
        ? 'in progress'
        : '—';
  const lines = [
    'Scanner Summary',
    `Sources ${s.sources}`,
    `Running ${s.running}`,
    `Completed ${s.completed}`,
    `Posts ${s.postsScanned}`,
    `Findings ${s.findingsToday}`,
    `Assigned ${s.assigned}`,
    `ETA ${eta}`,
    '',
    'Current Sources / Machines',
  ];
  if (scanning.length === 0) {
    lines.push('• Không có máy đang scan.');
  } else {
    for (const m of scanning.slice(0, 6)) {
      lines.push(
        `• ${m.displayName || m.hostname} · ${m.currentStep || 'scanning'} · jobs ${m.running}/${m.waiting}`,
      );
    }
  }
  if (topLead) {
    lines.push('');
    lines.push(
      `Top Lead · [${topLead.score ?? '—'}] ${topLead.title || '—'}`,
    );
  }
  return lines;
}

export function formatPublisherSummaryLines(ops: OperationsMetricsSnapshot): string[] {
  const p = ops.publisher;
  const pubs = ops.machines.filter(m => m.activity === 'publishing');
  const lines = [
    'Publisher Summary',
    `Queue ${p.queue}`,
    `Publishing ${p.publishing}`,
    `Published today ${p.publishedToday}`,
    `Draft ${p.draft}`,
    `Retry ${p.retry}`,
    '',
  ];
  if (pubs.length === 0) {
    lines.push('Current · không có máy đang publish.');
  } else {
    for (const m of pubs.slice(0, 5)) {
      lines.push(`Machine · ${m.displayName || m.hostname}`);
      lines.push(`Step · ${m.currentStep || m.activity}`);
      lines.push(`Mission · ${m.missionName || '—'}`);
      lines.push(bar(progressPct(m)));
      lines.push('--------');
    }
    if (lines[lines.length - 1] === '--------') lines.pop();
  }
  return lines;
}

export function formatMissionSummaryLines(ops: OperationsMetricsSnapshot): string[] {
  const mi = ops.mission;
  const withMission = ops.machines.filter(m => m.missionName);
  const lines = [
    'Mission Summary',
    `Running ${mi.running}`,
    `Waiting ${mi.waiting}`,
    `Completed ${mi.completed}`,
    `Failed ${mi.failed}`,
    '',
  ];
  if (withMission.length === 0) {
    lines.push('Current Mission · —');
  } else {
    for (const m of withMission.slice(0, 5)) {
      lines.push(`• ${m.missionName}`);
      lines.push(`  Machine ${m.displayName || m.hostname}`);
      lines.push(`  Step ${m.currentStep || m.activity}`);
    }
  }
  return lines;
}

export function formatIncidentCenterLines(
  incidents: OpsIncident[],
  recommendations?: OpsRecommendation[],
): string[] {
  const lines = ['Incident Center'];
  if (incidents.length === 0) {
    lines.push('Không có sự cố đáng chú ý.');
    return lines;
  }
  for (const i of incidents.slice(0, 12)) {
    lines.push(`${severityMark(i.severity)} ${i.title}`);
    lines.push(i.detail);
    const rec =
      recommendations?.find(r => r.incidentId === i.id) || recommendForIncident(i);
    if (rec) {
      lines.push(`→ ${rec.summary}`);
      if (rec.actionLabel) lines.push(`Đề xuất: ${rec.actionLabel}`);
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
    m.status === 'online' || m.status === 'degraded' ? 'Online' : 'Offline',
    cpuLine(m),
    ramLine(m),
    `Browser · busy ${m.browserBusy} · idle ${m.browserIdle} · chrome ${m.chromeCount}`,
    `Execution Slots · ${m.running}/${Math.max(1, m.executionSlots || 1)}`,
    `Current Mission · ${m.missionName || '—'}`,
    `Current Job · ${m.currentStep || m.activity} · run ${m.running} wait ${m.waiting}`,
    `Heartbeat · ${m.heartbeatAgeMs != null ? `${Math.round(m.heartbeatAgeMs / 1000)}s ago` : '—'}`,
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
}): string[] {
  return [
    'Browser Detail',
    `Profile · ${input.profile || '—'}`,
    `Account · ${input.account || '—'}`,
    `Current URL · ${input.currentUrl || '—'}`,
    `Mission · ${input.mission || '—'}`,
    `Locked By · ${input.lockedBy || '—'}`,
    `Memory · ${input.memoryMb != null ? `${input.memoryMb}MB` : '—'}`,
    `Agent · ${input.agentId || '—'}`,
  ];
}

export function formatDashboardBriefLines(
  ops: OperationsMetricsSnapshot,
  extras?: { leadsToday?: number; incidents?: OpsIncident[]; recommendations?: string[] },
): string[] {
  const lines = [
    'Operations Copilot',
    `Health ${ops.fleet.healthScore}/100`,
    `Fleet ${ops.fleet.machinesOnline} online · ${ops.fleet.machinesBusy} busy`,
    `Scanner run ${ops.scanner.running} · findings ${ops.scanner.findingsToday}`,
    `Publisher queue ${ops.publisher.queue} · publishing ${ops.publisher.publishing}`,
    `Mission run ${ops.mission.running} · fail ${ops.mission.failed}`,
  ];
  if (extras?.leadsToday != null) lines.push(`Lead hôm nay ${extras.leadsToday}`);
  if (extras?.incidents?.length) {
    lines.push('');
    lines.push(`Incidents · ${extras.incidents.length}`);
    for (const i of extras.incidents.slice(0, 3)) {
      lines.push(`${severityMark(i.severity)} ${i.title}`);
    }
  }
  if (extras?.recommendations?.length) {
    lines.push('');
    lines.push('Recommendations');
    for (const r of extras.recommendations.slice(0, 3)) lines.push(`• ${r}`);
  }
  return lines;
}

export function formatDailyBriefingLines(input: {
  slotLabel: string;
  ops: OperationsMetricsSnapshot;
  leadsToday: number;
  topLeads: Array<{ title?: string | null; score?: number | null }>;
  incidents: OpsIncident[];
  recommendations: string[];
}): string[] {
  const { ops } = input;
  return [
    `[AI Ops Briefing ${input.slotLabel}]`,
    '',
    `Health ${ops.fleet.healthScore}/100`,
    `Fleet ${ops.fleet.machinesOnline} online / ${ops.machines.length} machines`,
    `Scanner · run ${ops.scanner.running} · done ${ops.scanner.completed} · findings ${ops.scanner.findingsToday}`,
    `Publisher · queue ${ops.publisher.queue} · pub ${ops.publisher.publishing} · today ${ops.publisher.publishedToday}`,
    `Mission · run ${ops.mission.running} · wait ${ops.mission.waiting} · fail ${ops.mission.failed}`,
    `Lead hôm nay ${input.leadsToday}`,
    '',
    'Top Leads',
    ...(input.topLeads.length
      ? input.topLeads.slice(0, 3).map(
          (l, i) => `${i + 1}. [${l.score ?? '—'}] ${l.title || 'lead'}`,
        )
      : ['• —']),
    '',
    'Incidents',
    ...(input.incidents.length
      ? input.incidents.slice(0, 5).map(i => `${severityMark(i.severity)} ${i.title}`)
      : ['• Không có']),
    '',
    'Recommendations',
    ...(input.recommendations.length
      ? input.recommendations.slice(0, 4).map(r => `• ${r}`)
      : ['• Hệ thống ổn định']),
  ];
}
