/**
 * AI Task Orchestrator (H2.0.5) — planning-layer work coordination.
 * Does NOT touch Runtime / Execution Agent / Fleet / Browser / Scheduler / Publisher / Scanner cores.
 * "Execution Queue" here = ordered planning tasks persisted on the Campaign state.
 */

import type {
  CampaignPriority,
  CampaignTimelineEvent,
  OrchestratorAgent,
  OrchestratorTask,
  OrchestratorTaskStatus,
} from './types';

export type TaskGraphTemplateItem = {
  key: string;
  label: string;
  agent: OrchestratorAgent;
  dependsOnKeys: string[];
};

/** Canonical campaign work graph (dependency order). */
export const DEFAULT_CAMPAIGN_TASK_GRAPH: TaskGraphTemplateItem[] = [
  { key: 'research_market', label: 'Research Market', agent: 'research', dependsOnKeys: [] },
  {
    key: 'analyze_competitors',
    label: 'Analyze Competitors',
    agent: 'research',
    dependsOnKeys: ['research_market'],
  },
  {
    key: 'generate_missions',
    label: 'Generate Missions',
    agent: 'mission',
    dependsOnKeys: ['analyze_competitors'],
  },
  {
    key: 'generate_contents',
    label: 'Generate Contents',
    agent: 'content',
    dependsOnKeys: ['generate_missions'],
  },
  {
    key: 'review_leads',
    label: 'Review Existing Leads',
    agent: 'lead',
    dependsOnKeys: ['generate_contents'],
  },
  {
    key: 'schedule_publishing',
    label: 'Schedule Publishing',
    agent: 'publisher',
    dependsOnKeys: ['review_leads'],
  },
  {
    key: 'monitor_campaign',
    label: 'Monitor Campaign',
    agent: 'monitor',
    dependsOnKeys: ['schedule_publishing'],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

export function createCampaignTaskGraph(input: {
  campaignId: string;
  priority?: CampaignPriority;
  owner?: string | null;
}): OrchestratorTask[] {
  const priority = input.priority || 'medium';
  const owner = input.owner || 'ai-sales-employee';
  const createdAt = nowIso();
  const byKey = new Map<string, OrchestratorTask>();

  for (const tpl of DEFAULT_CAMPAIGN_TASK_GRAPH) {
    const id = `ot_${input.campaignId.slice(0, 8)}_${tpl.key}`;
    byKey.set(tpl.key, {
      id,
      campaignId: input.campaignId,
      key: tpl.key,
      label: tpl.label,
      agent: tpl.agent,
      priority,
      status: 'pending',
      owner,
      createdAt,
      startedAt: null,
      finishedAt: null,
      retryCount: 0,
      dependencies: [],
      resultSummary: null,
    });
  }

  for (const tpl of DEFAULT_CAMPAIGN_TASK_GRAPH) {
    const task = byKey.get(tpl.key)!;
    task.dependencies = tpl.dependsOnKeys.map(k => byKey.get(k)!.id);
  }

  return DEFAULT_CAMPAIGN_TASK_GRAPH.map(t => byKey.get(t.key)!);
}

export function findTaskByKey(
  tasks: OrchestratorTask[],
  key: string,
): OrchestratorTask | undefined {
  return tasks.find(t => t.key === key);
}

export function isTaskReady(task: OrchestratorTask, tasks: OrchestratorTask[]): boolean {
  if (task.status !== 'pending') return false;
  const byId = new Map(tasks.map(t => [t.id, t]));
  return task.dependencies.every(depId => byId.get(depId)?.status === 'completed');
}

export function listReadyTasks(tasks: OrchestratorTask[]): OrchestratorTask[] {
  return tasks.filter(t => isTaskReady(t, tasks));
}

export function assertCanStart(task: OrchestratorTask, tasks: OrchestratorTask[]): void {
  if (task.status !== 'pending' && task.status !== 'failed') {
    throw new Error(`Task ${task.key} cannot start from status=${task.status}`);
  }
  const probe = { ...task, status: 'pending' as const };
  if (task.status === 'pending' && !isTaskReady(probe, tasks)) {
    const pendingDeps = task.dependencies.filter(id => {
      const d = tasks.find(t => t.id === id);
      return d?.status !== 'completed';
    });
    throw new Error(`Task ${task.key} blocked by dependencies: ${pendingDeps.join(',')}`);
  }
}

export function startTask(task: OrchestratorTask): OrchestratorTask {
  return {
    ...task,
    status: 'running',
    startedAt: task.startedAt || nowIso(),
    finishedAt: null,
  };
}

export function completeTask(task: OrchestratorTask, resultSummary?: string): OrchestratorTask {
  return {
    ...task,
    status: 'completed',
    finishedAt: nowIso(),
    resultSummary: resultSummary ?? task.resultSummary ?? 'done',
  };
}

export function waitApprovalTask(task: OrchestratorTask, resultSummary?: string): OrchestratorTask {
  return {
    ...task,
    status: 'waiting_approval',
    finishedAt: null,
    resultSummary: resultSummary ?? task.resultSummary ?? 'waiting approval',
  };
}

export function failTask(task: OrchestratorTask, resultSummary?: string): OrchestratorTask {
  return {
    ...task,
    status: 'failed',
    finishedAt: nowIso(),
    retryCount: task.retryCount + 1,
    resultSummary: resultSummary ?? 'failed',
  };
}

export function cancelTask(task: OrchestratorTask, resultSummary?: string): OrchestratorTask {
  return {
    ...task,
    status: 'cancelled',
    finishedAt: nowIso(),
    resultSummary: resultSummary ?? 'cancelled',
  };
}

export function patchTask(
  tasks: OrchestratorTask[],
  taskIdOrKey: string,
  patch: (t: OrchestratorTask) => OrchestratorTask,
): OrchestratorTask[] {
  return tasks.map(t => (t.id === taskIdOrKey || t.key === taskIdOrKey ? patch(t) : t));
}

export function taskDurationMs(task: OrchestratorTask): number | null {
  if (!task.startedAt) return null;
  const end = task.finishedAt ? new Date(task.finishedAt).getTime() : Date.now();
  return Math.max(0, end - new Date(task.startedAt).getTime());
}

export function orchestratorProgress(tasks: OrchestratorTask[]): {
  total: number;
  completed: number;
  running: number;
  waitingApproval: number;
  failed: number;
  pending: number;
  percent: number;
  blocked: OrchestratorTask[];
  stuck: OrchestratorTask[];
} {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const running = tasks.filter(t => t.status === 'running').length;
  const waitingApproval = tasks.filter(t => t.status === 'waiting_approval').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const ready = listReadyTasks(tasks);
  const blocked = tasks.filter(t => t.status === 'pending' && !ready.some(r => r.id === t.id));
  const stuck = tasks.filter(
    t =>
      t.status === 'failed' ||
      t.status === 'waiting_approval' ||
      (t.status === 'running' &&
        t.startedAt &&
        Date.now() - new Date(t.startedAt).getTime() > 30 * 60 * 1000),
  );
  return {
    total,
    completed,
    running,
    waitingApproval,
    failed,
    pending,
    percent: total ? Math.round((completed / total) * 100) : 0,
    blocked,
    stuck,
  };
}

export function pushTaskMemory(
  memory: CampaignTimelineEvent[],
  title: string,
  detail?: string,
  phase: CampaignTimelineEvent['phase'] = 'system',
): void {
  memory.push({ at: nowIso(), phase, title, detail });
}

/** Human work status — Copilot "AI đang làm gì?" (not a log dump). */
export function formatOrchestratorWorkLines(input: {
  campaignName: string;
  tasks: OrchestratorTask[];
}): string[] {
  const { tasks, campaignName } = input;
  const lines = ['AI đang thực hiện:', campaignName, '────────────────────────────────'];

  for (const t of tasks) {
    if (t.status === 'completed') {
      lines.push(`✓ ${t.label}${t.resultSummary ? ` — ${t.resultSummary}` : ''}`);
    } else if (t.status === 'running') {
      lines.push(`… ${t.label} (đang chạy)`);
    } else if (t.status === 'waiting_approval') {
      lines.push(`⏸ ${t.label} — chờ bạn duyệt`);
    } else if (t.status === 'failed') {
      lines.push(`✗ ${t.label} — kẹt/failed`);
    } else if (t.status === 'cancelled') {
      lines.push(`– ${t.label} (cancelled)`);
    } else {
      lines.push(`○ ${t.label} (chưa tới)`);
    }
  }

  const p = orchestratorProgress(tasks);
  lines.push('────────────────────────────────');
  lines.push(
    `Tiến độ ${p.completed}/${p.total} · running ${p.running} · chờ duyệt ${p.waitingApproval} · kẹt ${p.stuck.length}`,
  );
  if (p.stuck.length) {
    lines.push(`Task kẹt: ${p.stuck.map(t => t.label).join(', ')}`);
  }
  const next = listReadyTasks(tasks)[0];
  if (next) lines.push(`Tiếp theo: ${next.label}`);
  else if (p.waitingApproval) lines.push('Còn gì phải làm: Approve / Reject content.');
  else if (p.completed === p.total) lines.push('Không còn task pending.');

  return lines;
}

/** Compact task rows for Telegram Campaign card. */
export function formatOrchestratorTaskCardLines(tasks: OrchestratorTask[]): string[] {
  const statusLabel: Record<OrchestratorTaskStatus, string> = {
    pending: 'Pending',
    running: 'Running',
    waiting_approval: 'Waiting Approval',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
  };
  const lines = ['Tasks', '────────────────────────────────'];
  for (const t of tasks) {
    const short =
      t.key === 'research_market' || t.key === 'analyze_competitors'
        ? 'Research'
        : t.key === 'generate_missions'
          ? 'Mission'
          : t.key === 'generate_contents'
            ? 'Content'
            : t.key === 'schedule_publishing'
              ? 'Publishing'
              : t.key === 'review_leads'
                ? 'Leads'
                : t.key === 'monitor_campaign'
                  ? 'Monitor'
                  : t.label;
    lines.push(`${short.padEnd(12)} ${statusLabel[t.status]}`);
  }
  lines.push('────────────────────────────────');
  return lines;
}

/** Sync legacy checklist-style tasks for older UI. */
export function toLegacyCampaignTasks(tasks: OrchestratorTask[]) {
  const phaseMap: Record<string, string> = {
    research_market: 'researching',
    analyze_competitors: 'researching',
    generate_missions: 'mission_planning',
    generate_contents: 'content_drafting',
    review_leads: 'finding_leads',
    schedule_publishing: 'waiting_approval',
    monitor_campaign: 'monitoring',
  };
  return tasks.map(t => ({
    id: t.id,
    phase: (phaseMap[t.key] || 'planning') as import('./types').CampaignLifecycleStatus,
    label: t.label,
    status:
      t.status === 'completed'
        ? ('done' as const)
        : t.status === 'running' || t.status === 'waiting_approval'
          ? ('running' as const)
          : t.status === 'cancelled'
            ? ('skipped' as const)
            : ('pending' as const),
    result: t.resultSummary || undefined,
  }));
}
