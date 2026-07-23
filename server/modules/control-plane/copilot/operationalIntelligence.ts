/**
 * Operational Intelligence — detect ops signals from snapshots (read-only).
 * Copilot layer only — never mutates Scanner / Publisher / Mission / Browser.
 */

import type { OperationsMetricsSnapshot } from '../operations/types';

export type IncidentSeverity = 'info' | 'warning' | 'critical';

export type OpsIncidentKind =
  | 'idle_machine'
  | 'busy_machine'
  | 'hot_browser'
  | 'memory_high'
  | 'retry_loop'
  | 'checkpoint'
  | 'offline_agent'
  | 'queue_backlog'
  | 'slow_mission'
  | 'publish_failure'
  | 'source_removed'
  | 'browser_locked'
  | 'slot_full'
  | 'scanner_idle'
  | 'publisher_idle'
  | 'duplicate_publish'
  | 'health_low';

export type OpsIncident = {
  id: string;
  kind: OpsIncidentKind;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  entityId?: string | null;
  machineId?: string | null;
};

export type OpsSignalBundle = {
  incidents: OpsIncident[];
  counts: { info: number; warning: number; critical: number };
};

function ramUsedPct(m: OperationsMetricsSnapshot['machines'][number]): number | null {
  if (m.memTotalMb != null && m.memTotalMb > 0 && m.memFreeMb != null) {
    return Math.round(((m.memTotalMb - m.memFreeMb) / m.memTotalMb) * 100);
  }
  return null;
}

/** Detect operational incidents from Operations Metrics + optional last-error hints. */
export function detectOperationalIncidents(
  ops: OperationsMetricsSnapshot,
  hints?: {
    lastErrors?: Array<{ entityId: string; message: string }>;
    offlineAgentIds?: string[];
  },
): OpsSignalBundle {
  const incidents: OpsIncident[] = [];
  const push = (inc: OpsIncident) => incidents.push(inc);

  if (ops.fleet.healthScore < 70) {
    push({
      id: 'health_low',
      kind: 'health_low',
      severity: ops.fleet.healthScore < 50 ? 'critical' : 'warning',
      title: 'Health thấp',
      detail: `Fleet health ${ops.fleet.healthScore}/100.`,
    });
  }

  for (const m of ops.machines) {
    if (m.status === 'offline' || m.activity === 'offline') {
      push({
        id: `offline_${m.agentId}`,
        kind: 'offline_agent',
        severity: 'critical',
        title: 'Agent Offline',
        detail: `${m.displayName || m.hostname} không heartbeat.`,
        entityId: m.agentId,
        machineId: m.machineId,
      });
      continue;
    }

    if (m.activity === 'idle' && (m.running || 0) === 0 && ops.workload.waitingJobs > 0) {
      push({
        id: `idle_${m.agentId}`,
        kind: 'idle_machine',
        severity: 'info',
        title: 'Idle Machine',
        detail: `${m.displayName || m.hostname} đang idle trong khi queue còn ${ops.workload.waitingJobs} job.`,
        entityId: m.agentId,
        machineId: m.machineId,
      });
    }

    if (
      ['scanning', 'publishing', 'busy', 'campaign', 'browser_hold'].includes(m.activity) &&
      (m.running || 0) > 0
    ) {
      push({
        id: `busy_${m.agentId}`,
        kind: 'busy_machine',
        severity: 'info',
        title: 'Busy Machine',
        detail: `${m.displayName || m.hostname} · ${m.activity} · jobs ${m.running}.`,
        entityId: m.agentId,
        machineId: m.machineId,
      });
    }

    if (m.browserBusy >= 1 && m.activity === 'browser_hold') {
      push({
        id: `hot_browser_${m.agentId}`,
        kind: 'hot_browser',
        severity: 'warning',
        title: 'Hot Browser',
        detail: `${m.displayName || m.hostname} · browser busy ${m.browserBusy}.`,
        entityId: m.agentId,
        machineId: m.machineId,
      });
    }

    const ram = ramUsedPct(m);
    if ((ram != null && ram >= 85) || (m.rssMb != null && m.rssMb >= 2048)) {
      push({
        id: `mem_${m.agentId}`,
        kind: 'memory_high',
        severity: 'warning',
        title: 'Browser Memory High',
        detail:
          ram != null
            ? `${m.displayName || m.hostname} RAM ~${ram}%` +
              (m.rssMb != null ? ` · RSS ${m.rssMb}MB` : '')
            : `${m.displayName || m.hostname} RSS ${m.rssMb}MB`,
        entityId: m.agentId,
        machineId: m.machineId,
      });
    }
  }

  if (ops.workload.retryJobs >= 5) {
    push({
      id: 'retry_loop',
      kind: 'retry_loop',
      severity: 'warning',
      title: 'Retry Loop',
      detail: `${ops.workload.retryJobs} job đang retry — có thể lặp lỗi.`,
    });
  }

  if (ops.workload.waitingJobs >= 20) {
    push({
      id: 'queue_backlog',
      kind: 'queue_backlog',
      severity: ops.workload.waitingJobs >= 50 ? 'critical' : 'warning',
      title: 'Queue Backlog',
      detail: `${ops.workload.waitingJobs} job đang chờ.`,
    });
  }

  if (ops.publisher.retry > 0 || ops.workload.failedJobs > 0) {
    push({
      id: 'publish_failure',
      kind: 'publish_failure',
      severity: ops.workload.failedJobs > 5 ? 'critical' : 'warning',
      title: 'Publish Failure Pattern',
      detail: `Publisher retry=${ops.publisher.retry} · failed jobs=${ops.workload.failedJobs}.`,
    });
  }

  if (
    ops.scanner.sources > 0 &&
    ops.scanner.running === 0 &&
    ops.scanner.assigned === 0 &&
    ops.fleet.machinesOnline > 0
  ) {
    push({
      id: 'scanner_idle',
      kind: 'scanner_idle',
      severity: 'info',
      title: 'Scanner Idle',
      detail: 'Không còn source đang assigned / running.',
    });
  }

  if (
    ops.publisher.publishing === 0 &&
    ops.publisher.queue === 0 &&
    ops.fleet.machinesOnline > 0
  ) {
    push({
      id: 'publisher_idle',
      kind: 'publisher_idle',
      severity: 'info',
      title: 'Publisher Idle',
      detail: 'Không có publish đang chạy hoặc trong queue.',
    });
  }

  if (ops.publisher.publishing >= 2) {
    push({
      id: 'duplicate_publish',
      kind: 'duplicate_publish',
      severity: 'warning',
      title: 'Duplicate Publish Risk',
      detail: `${ops.publisher.publishing} publish đang chạy song song — kiểm tra destination.`,
    });
  }

  if (ops.mission.running > 0 && ops.mission.failed > ops.mission.completed) {
    push({
      id: 'slow_mission',
      kind: 'slow_mission',
      severity: 'warning',
      title: 'Slow / Failed Mission',
      detail: `Mission fail hôm nay ${ops.mission.failed} > completed ${ops.mission.completed}.`,
    });
  }

  for (const err of hints?.lastErrors || []) {
    const msg = err.message.toLowerCase();
    if (/checkpoint|challenge/.test(msg)) {
      push({
        id: `checkpoint_${err.entityId}`,
        kind: 'checkpoint',
        severity: 'critical',
        title: 'Group Checkpoint',
        detail: err.message.slice(0, 160),
        entityId: err.entityId,
      });
    }
    if (/source.*(removed|deleted|not found)|SOURCE_REMOVED|SOURCE_NOT_FOUND/i.test(err.message)) {
      push({
        id: `source_removed_${err.entityId}`,
        kind: 'source_removed',
        severity: 'critical',
        title: 'Source Removed',
        detail: err.message.slice(0, 160),
        entityId: err.entityId,
      });
    }
    if (/cdp_busy|browser.*lock|BROWSER_BUSY|CDP_BUSY/i.test(err.message)) {
      push({
        id: `browser_locked_${err.entityId}`,
        kind: 'browser_locked',
        severity: 'warning',
        title: 'Browser Locked',
        detail: err.message.slice(0, 160),
        entityId: err.entityId,
      });
    }
    if (/SLOT_BUSY|slot.*full/i.test(err.message)) {
      push({
        id: `slot_${err.entityId}`,
        kind: 'slot_full',
        severity: 'info',
        title: 'Execution Slot Full',
        detail: err.message.slice(0, 160),
        entityId: err.entityId,
      });
    }
  }

  for (const id of hints?.offlineAgentIds || []) {
    if (!incidents.some(i => i.kind === 'offline_agent' && i.entityId === id)) {
      push({
        id: `offline_hint_${id}`,
        kind: 'offline_agent',
        severity: 'critical',
        title: 'Agent Offline',
        detail: `${id} offline.`,
        entityId: id,
      });
    }
  }

  // Cap noise
  const capped = incidents.slice(0, 24);
  const counts = {
    info: capped.filter(i => i.severity === 'info').length,
    warning: capped.filter(i => i.severity === 'warning').length,
    critical: capped.filter(i => i.severity === 'critical').length,
  };
  return { incidents: capped, counts };
}

/** Explain why scanner may not be running — plain language. */
export function explainScannerIdle(ops: OperationsMetricsSnapshot): string[] {
  const lines: string[] = ['Tại sao Scanner không chạy?'];
  if (ops.fleet.machinesOnline === 0) {
    lines.push('• Không có máy online trong Fleet.');
    lines.push('Khuyến nghị: kiểm tra agent / heartbeat.');
    return lines;
  }
  if (ops.scanner.assigned === 0 && ops.scanner.running === 0) {
    lines.push('• Không còn Source Pending / assigned.');
    lines.push('Khuyến nghị: kiểm tra scheduler hoặc thêm source active.');
    return lines;
  }
  const scanning = ops.machines.filter(m => m.activity === 'scanning');
  const busySlots = ops.machines.filter(m => (m.running || 0) >= Math.max(1, m.executionSlots || 1));
  if (busySlots.length && scanning.length === 0) {
    lines.push('• Execution Slot đang đầy trên máy online.');
    lines.push('Khuyến nghị: đợi slot trống hoặc tăng concurrency scan (cẩn thận).');
    return lines;
  }
  if (ops.fleet.browserBusy > 0 && ops.scanner.running === 0) {
    lines.push('• Browser đang bị lock / busy.');
    lines.push('Khuyến nghị: Release Browser rồi Refresh.');
    return lines;
  }
  if (ops.scanner.running > 0) {
    lines.push(`• Scanner đang chạy (${ops.scanner.running} job).`);
    return lines;
  }
  lines.push('• Chưa đủ tín hiệu — kiểm tra /runtime và job queue.');
  return lines;
}
