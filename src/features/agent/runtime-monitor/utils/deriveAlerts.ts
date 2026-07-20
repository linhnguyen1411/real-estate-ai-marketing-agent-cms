/**
 * Derive alerts from existing Runtime Snapshot (presentation only — no API).
 */
import type {
  AutomationRuntimeSnapshot,
  OperationsMetricsSnapshot,
} from '../../../../types/agentPlatform';

export type OpsAlert = {
  id: string;
  severity: 'warning' | 'error' | 'info';
  title: string;
  detail?: string;
  category: 'retry' | 'error' | 'memory' | 'offline' | 'checkpoint' | 'queue';
};

function ramUsedPct(m: {
  memFreeMb: number | null;
  memTotalMb: number | null;
}): number | null {
  if (m.memTotalMb == null || m.memTotalMb <= 0 || m.memFreeMb == null) return null;
  return ((m.memTotalMb - m.memFreeMb) / m.memTotalMb) * 100;
}

export function deriveOpsAlerts(
  data: AutomationRuntimeSnapshot,
  ops?: OperationsMetricsSnapshot | null,
): OpsAlert[] {
  const alerts: OpsAlert[] = [];

  if (data.queue.deadLetter > 0) {
    alerts.push({
      id: 'dead-letter',
      severity: 'error',
      title: `${data.queue.deadLetter} dead-letter jobs`,
      detail: 'Cần retry hoặc discard',
      category: 'queue',
    });
  }
  if (data.queue.retry > 0) {
    alerts.push({
      id: 'retry-queue',
      severity: 'warning',
      title: `${data.queue.retry} jobs retrying`,
      category: 'retry',
    });
  }
  if (data.missions.failed > 0) {
    alerts.push({
      id: 'mission-failed',
      severity: 'error',
      title: `${data.missions.failed} missions failed`,
      category: 'error',
    });
  }
  if (ops && ops.workload.failedJobs > 0) {
    alerts.push({
      id: 'failed-jobs',
      severity: 'error',
      title: `${ops.workload.failedJobs} failed jobs`,
      category: 'error',
    });
  }
  if (ops && ops.publisher.retry > 0) {
    alerts.push({
      id: 'publish-retry',
      severity: 'warning',
      title: `${ops.publisher.retry} publish retries`,
      category: 'retry',
    });
  }
  if (ops && ops.fleet.machinesOffline > 0) {
    alerts.push({
      id: 'offline-agents',
      severity: 'warning',
      title: `${ops.fleet.machinesOffline} agents offline`,
      category: 'offline',
    });
  }

  const machines = ops?.machines || [];
  for (const m of machines) {
    if (m.activity === 'error' || m.status === 'degraded' || m.status === 'needs_login') {
      alerts.push({
        id: `err-${m.agentId}`,
        severity: 'error',
        title: `${m.displayName || m.hostname} · ${m.status}/${m.activity}`,
        category: 'error',
      });
    }
    if (m.activity === 'offline' || m.status === 'offline') {
      alerts.push({
        id: `off-${m.agentId}`,
        severity: 'warning',
        title: `${m.displayName || m.hostname} offline`,
        detail: `heartbeat ${m.heartbeatAgeMs != null ? Math.round(m.heartbeatAgeMs / 1000) + 's' : '—'}`,
        category: 'offline',
      });
    }
    const ram = ramUsedPct(m);
    if (ram != null && ram >= 85) {
      alerts.push({
        id: `mem-${m.agentId}`,
        severity: 'warning',
        title: `Memory high · ${m.hostname}`,
        detail: `${Math.round(ram)}% used`,
        category: 'memory',
      });
    }
  }

  for (const w of data.workers || []) {
    if (w.lastError) {
      alerts.push({
        id: `werr-${w.id}`,
        severity: 'error',
        title: `Worker error · ${w.workerId || w.name}`,
        detail: String(w.lastError).slice(0, 120),
        category: 'error',
      });
    }
  }

  for (const j of (data.activeJobs || []).filter(x => x.errorMessage).slice(0, 5)) {
    alerts.push({
      id: `job-${j.id}`,
      severity: 'warning',
      title: `Job checkpoint · ${j.type}`,
      detail: String(j.errorMessage).slice(0, 100),
      category: 'checkpoint',
    });
  }

  // Dedupe by id
  const seen = new Set<string>();
  return alerts.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

export type TimelineItem = {
  id: string;
  type: string;
  label: string;
  at: string;
  agentId?: string | null;
  detail?: string;
};

const EVENT_LABELS: Record<string, string> = {
  MISSION_STARTED: 'Mission Started',
  MISSION_COMPLETED: 'Mission Finished',
  MISSION_FAILED: 'Mission Failed',
  JOB_COMPLETED: 'Job Completed',
  JOB_FAILED: 'Job Failed',
  JOB_CLAIMED: 'Job Claimed',
  PUBLISH_STARTED: 'Publish Started',
  PUBLISH_FINISHED: 'Publish Finished',
  BROWSER_LEASED: 'Browser Locked',
  BROWSER_RELEASED: 'Browser Released',
  BROWSER_CRASH: 'Browser Crash',
  AGENT_ONLINE: 'Agent Online',
  AGENT_OFFLINE: 'Agent Offline',
  AGENT_RESTART: 'Agent Restart',
};

export function mapRuntimeEventsToTimeline(
  events: Array<{
    id: string;
    type: string;
    agentId?: string | null;
    createdAt: string;
    payload?: Record<string, unknown>;
  }> = [],
): TimelineItem[] {
  return events.slice(0, 40).map(e => ({
    id: e.id,
    type: e.type,
    label: EVENT_LABELS[e.type] || e.type.replace(/_/g, ' '),
    at: e.createdAt,
    agentId: e.agentId,
    detail:
      typeof e.payload?.error === 'string'
        ? e.payload.error.slice(0, 80)
        : typeof e.payload?.action === 'string'
          ? String(e.payload.action)
          : undefined,
  }));
}

/** Fallback timeline when events array is empty — derive from mission/job snapshot. */
export function deriveFallbackTimeline(data: AutomationRuntimeSnapshot): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const m of (data.missionTimeline || []).slice(0, 12)) {
    items.push({
      id: `mission-${m.id}`,
      type: m.status === 'completed' ? 'MISSION_COMPLETED' : m.status === 'failed' ? 'MISSION_FAILED' : 'MISSION_STARTED',
      label:
        m.status === 'completed'
          ? 'Mission Finished'
          : m.status === 'failed'
            ? 'Mission Failed'
            : 'Mission Started',
      at: m.updatedAt || m.startedAt || m.createdAt,
      detail: m.error ? String(m.error).slice(0, 80) : m.id.slice(0, 10),
    });
  }
  for (const j of (data.activeJobs || []).slice(0, 8)) {
    items.push({
      id: `aj-${j.id}`,
      type: 'JOB_CLAIMED',
      label: `${j.type} · ${j.status}`,
      at: j.startedAt || j.claimedAt || j.createdAt,
      agentId: j.claimedBy,
    });
  }
  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 30);
}
