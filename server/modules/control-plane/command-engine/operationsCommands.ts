/**
 * Operations Center commands — adapters over Control Plane operationsService.
 * No Telegram-specific I/O here.
 */

import type { CommandRegistry } from './registry';
import type { CommandContext, CommandResult } from './types';
import {
  opsBrowserCommand,
  opsBrowserStatus,
  opsCancelMission,
  opsCancelPublish,
  opsGetAgent,
  opsGetDashboard,
  opsGetMission,
  opsListAgentJobs,
  opsListPublishQueue,
  opsPauseMission,
  opsReport,
  opsRequestAgentRestart,
  opsResumeMission,
  opsRetryCampaign,
  opsRetryMission,
  opsRetryPublish,
  opsRetryScan,
} from '../operationsService';
import {
  agentJobKeyboard,
  missionActionKeyboard,
  publishJobKeyboard,
} from '../inlineKeyboard';
import type { ControlPlaneReportKind } from '../types';
import { listRegisteredAgents } from '../agentRegistry';
import { buildAutomationRuntimeSnapshot } from '../../../agent/runtimeObservability';

function ok(
  command: string,
  lines: string[],
  data?: Record<string, unknown>,
  replyMarkup?: CommandResult['replyMarkup'],
): CommandResult {
  return { ok: true, command, lines, data, replyMarkup };
}

function fail(command: string, message: string): CommandResult {
  return { ok: false, command, lines: [message], error: message };
}

function parseReportKind(arg: string | undefined): ControlPlaneReportKind {
  const scope = (arg || 'today').toLowerCase();
  if (scope === 'week' || scope === 'weekly') return 'weekly';
  if (scope === 'health' || scope === 'runtime_health') return 'runtime_health';
  if (scope === 'publish') return 'publish';
  if (scope === 'scan' || scope === 'scanner') return 'scanner';
  if (scope === 'campaign' || scope === 'campaigns') return 'campaign';
  if (scope === 'agent' || scope === 'agents') return 'agent';
  if (scope === 'browser' || scope === 'browsers') return 'browser';
  return 'daily';
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

export function registerOperationsCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'dashboard',
    description: 'Operations dashboard',
    usage: '/dashboard',
    handler: async (_args, ctx) => {
      const d = await opsGetDashboard(ctx.user);
      return ok(
        'dashboard',
        [
          '══ Dashboard ══',
          `Health ${d.healthScore}/100`,
          `Agents online ${d.agentsOnline}/${d.agentsTotal}`,
          `Queue wait=${d.queue.waiting} run=${d.queue.running} fail=${d.queue.deadLetter} pending≈${d.queue.waiting + d.queue.claimed}`,
          `Jobs active=${d.activeJobs}`,
          `Missions run=${d.missions.running} fail=${d.missions.failed} wait=${d.missions.waiting}`,
          `Browser health=${d.health.browser} · Exec/slot util=${d.metrics.slotUtilization ?? '—'}%`,
          `publish/h=${d.metrics.publishPerHour} scan/h=${d.metrics.scanPerHour}`,
        ],
        { dashboard: d },
      );
    },
  });

  registry.register({
    name: 'jobs',
    description: 'List agent jobs',
    usage: '/jobs [running|pending|failed|completed]',
    handler: async (args, ctx) => {
      const filter = (args[0] || 'all').toLowerCase() as
        | 'running'
        | 'pending'
        | 'failed'
        | 'completed'
        | 'all';
      const allowed = ['running', 'pending', 'failed', 'completed', 'all'];
      const status = (allowed.includes(filter) ? filter : 'all') as typeof filter;
      const jobs = await opsListAgentJobs({
        companyId: ctx.companyId,
        status,
        limit: 12,
      });
      if (jobs.length === 0) {
        return ok('jobs', [`No jobs (${status}).`], { jobs: [] });
      }
      const lines = [
        `Jobs · ${status} (${jobs.length})`,
        ...jobs.map(j => {
          const err = j.errorMessage ? ` err=${j.errorMessage.slice(0, 40)}` : '';
          return `• ${j.id.slice(0, 10)} ${j.type} [${j.status}] agent=${j.claimedBy || '—'} try=${j.attempts} t=${fmtDuration(j.durationMs)} m=${j.missionId?.slice(0, 8) || '—'}${err}`;
        }),
      ];
      const first = jobs[0];
      return ok('jobs', lines, { jobs }, first ? agentJobKeyboard(first.missionId || first.id) : undefined);
    },
  });

  registry.register({
    name: 'mission',
    description: 'Mission detail / retry / cancel / pause / resume',
    usage: '/mission <id> | /mission retry|cancel|pause|resume <id>',
    handler: async (args, ctx) => {
      const a0 = (args[0] || '').toLowerCase();
      const action = ['retry', 'cancel', 'pause', 'resume'].includes(a0) ? a0 : null;
      const id = action ? args[1] : args[0];
      if (!id) return fail('mission', 'Usage: /mission <id> | /mission retry|cancel|pause|resume <id>');

      if (action === 'retry') {
        const r = await opsRetryMission(id, {
          companyId: ctx.companyId,
          triggeredBy: ctx.triggeredBy,
        });
        return ok(
          'mission',
          [`Retry mission → run=${r.missionRunId} jobs=${r.jobsCreated}`],
          { missionRunId: r.missionRunId },
          missionActionKeyboard(id),
        );
      }
      if (action === 'cancel') {
        const r = await opsCancelMission(id, ctx.triggeredBy);
        return ok(
          'mission',
          [`Cancelled jobs=${r.jobsCancelled}`],
          r as unknown as Record<string, unknown>,
          missionActionKeyboard(id),
        );
      }
      if (action === 'pause') {
        const m = await opsPauseMission(id);
        return ok('mission', [`Paused ${m.name} [${m.status}]`], { missionId: m.id }, missionActionKeyboard(m.id));
      }
      if (action === 'resume') {
        const m = await opsResumeMission(id);
        return ok('mission', [`Resumed ${m.name} [${m.status}]`], { missionId: m.id }, missionActionKeyboard(m.id));
      }

      const detail = await opsGetMission(id);
      if (!detail) return fail('mission', `Mission not found: ${id}`);
      const { mission, runs } = detail;
      const lines = [
        `Mission ${mission.name}`,
        `id=${mission.id} status=${mission.status}`,
        'Recent runs:',
        ...runs.map(
          r =>
            `• ${r.id.slice(0, 10)} [${r.status}] ${r.error ? r.error.slice(0, 48) : ''}`.trim(),
        ),
        runs.length === 0 ? '(no runs)' : '',
      ].filter(Boolean);
      return ok(
        'mission',
        lines,
        { missionId: mission.id, status: mission.status },
        missionActionKeyboard(mission.id),
      );
    },
  });

  // Enhance / publish with retry/cancel — replace is handled by re-registering
  registry.register({
    name: 'publish',
    description: 'Publish queue / now / retry / cancel',
    usage: '/publish | /publish queue | /publish now <campaign> | /publish retry|cancel <id>',
    handler: async (args, ctx) => {
      const sub = (args[0] || 'queue').toLowerCase();

      if (sub === 'retry') {
        const id = args[1];
        if (!id) return fail('publish', 'Usage: /publish retry <jobId>');
        const r = await opsRetryPublish(id, ctx.triggeredBy);
        if (r.skipped) {
          return fail('publish', `Retry skipped: ${r.reason}`);
        }
        return ok(
          'publish',
          [`Publish retry queued job=${r.job.id}`],
          { jobId: r.job.id },
          publishJobKeyboard(r.job.id),
        );
      }
      if (sub === 'cancel') {
        const id = args[1];
        if (!id) return fail('publish', 'Usage: /publish cancel <jobId>');
        const job = await opsCancelPublish(id, ctx.triggeredBy);
        return ok('publish', [`Cancelled publish job ${job.id}`], { jobId: job.id });
      }
      if (sub === 'now') {
        const target = args[1];
        if (!target) return fail('publish', 'Usage: /publish now <campaign>');
        const started = await opsRetryCampaign(target, ctx.triggeredBy);
        return ok(
          'publish',
          [
            `Publish now campaign run=${started.run.id}`,
            `status=${started.run.status} targets=${started.progress.total}`,
          ],
          { runId: started.run.id },
        );
      }

      // default + queue
      const jobs = await opsListPublishQueue({ companyId: ctx.companyId, limit: 12 });
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const active = snap.activeJobs.filter(j => j.type === 'publish_social');
      const lines = [
        'Publish queue',
        ...jobs.slice(0, 10).map(j => {
          const when = j.scheduledAt ? new Date(j.scheduledAt).toISOString() : '—';
          return `• ${j.id.slice(0, 10)} [${j.status}] at=${when}`;
        }),
        jobs.length === 0 ? '(empty)' : '',
        `Agent publish_social active: ${active.length}`,
        '/publish now <campaign> · /publish retry <id> · /publish cancel <id>',
      ].filter(Boolean);
      const first = jobs[0];
      return ok(
        'publish',
        lines,
        { queued: jobs.length },
        first ? publishJobKeyboard(first.id) : undefined,
      );
    },
  });

  registry.register({
    name: 'agent',
    description: 'Agent detail / soft restart request',
    usage: '/agent <id> | /agent restart <id>',
    handler: async (args, ctx) => {
      const a0 = (args[0] || '').toLowerCase();
      if (a0 === 'restart') {
        const id = args[1];
        if (!id) return fail('agent', 'Usage: /agent restart <id>');
        const r = await opsRequestAgentRestart(id, ctx.companyId);
        return ok('agent', [`Restart requested for ${r.agentId} (Event Bus — no SSH)`], r);
      }
      const id = args[0];
      if (!id) {
        const agents = await listRegisteredAgents({ companyId: ctx.companyId ?? undefined });
        return ok(
          'agent',
          [
            `Agents (${agents.length}) — use /agent <id>`,
            ...agents.slice(0, 10).map(a => `• ${a.agentId} [${a.status}]`),
          ],
          { agents: agents.map(a => a.agentId) },
        );
      }
      const agent = await opsGetAgent(id);
      if (!agent) return fail('agent', `Agent not found: ${id}`);
      return ok(
        'agent',
        [
          `Agent ${agent.agentId}`,
          `status=${agent.status} host=${agent.hostname}`,
          `caps=${agent.capabilities.join(',')}`,
          `heartbeatAgeMs=${agent.heartbeatAgeMs ?? '—'}`,
          `slotUtil=${agent.metrics.slotUtilization ?? '—'}% browserUtil=${agent.metrics.browserUtilization ?? '—'}%`,
          agent.lastError ? `lastError=${agent.lastError}` : '',
        ].filter(Boolean),
        { agentId: agent.agentId, status: agent.status },
      );
    },
  });

  registry.register({
    name: 'browser',
    description: 'Browser pool ops (soft commands via Event Bus)',
    usage: '/browser | /browser release|recover|screenshot',
    handler: async (args, ctx) => {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'release' || sub === 'recover' || sub === 'screenshot') {
        const r = await opsBrowserCommand(sub, ctx.companyId);
        return ok('browser', [`Browser ${sub} requested (OPS_REQUEST event)`], r);
      }
      const st = await opsBrowserStatus(ctx.user);
      const lines = [
        'Browser pool',
        `health=${st.healthBrowser}`,
        ...st.workers.slice(0, 8).map(w => {
          const pool = w.browserPool ? JSON.stringify(w.browserPool).slice(0, 80) : '—';
          return `• ${w.workerId || 'worker'} online=${w.online} url=${w.currentUrl || '—'} pool=${pool}`;
        }),
        st.workers.length === 0 ? '(no workers)' : '',
        '/browser release|recover|screenshot',
      ].filter(Boolean);
      return ok('browser', lines, { workers: st.workers.length });
    },
  });

  // Override report to accept agents/browser aliases already in parseReportKind
  registry.register({
    name: 'report',
    description: 'Control Plane reports',
    usage: '/report today|week|publish|scan|agents|browser',
    handler: async (args, ctx) => {
      const kind = parseReportKind(args[0]);
      const report = await opsReport(ctx.user, kind);
      const lines = [
        `Report · ${kind}`,
        `health=${String(report.healthScore ?? '—')}`,
        `metrics=${JSON.stringify(report.metrics ?? {}).slice(0, 200)}`,
        `events=${JSON.stringify(report.eventCounts ?? {}).slice(0, 200)}`,
        `agents=${Array.isArray(report.agents) ? (report.agents as unknown[]).length : 0}`,
      ];
      return ok('report', lines, { kind, report });
    },
  });

  // Unified retry entry
  registry.register({
    name: 'retry',
    description: 'Retry mission / publish / scan / campaign via Control Plane',
    usage: '/retry <mission> | /retry publish <id> | /retry scan <mission> | /retry campaign <id>',
    handler: async (args, ctx) => {
      const a0 = (args[0] || '').toLowerCase();
      if (a0 === 'publish') {
        const id = args[1];
        if (!id) return fail('retry', 'Usage: /retry publish <jobId>');
        const r = await opsRetryPublish(id, ctx.triggeredBy);
        if (r.skipped) return fail('retry', `Skipped: ${r.reason}`);
        return ok('retry', [`Publish retried ${r.job.id}`], { jobId: r.job.id }, publishJobKeyboard(r.job.id));
      }
      if (a0 === 'campaign') {
        const id = args[1];
        if (!id) return fail('retry', 'Usage: /retry campaign <id>');
        const r = await opsRetryCampaign(id, ctx.triggeredBy);
        return ok('retry', [`Campaign run ${r.run.id}`], { runId: r.run.id });
      }
      if (a0 === 'scan') {
        const id = args[1];
        if (!id) return fail('retry', 'Usage: /retry scan <mission>');
        const r = await opsRetryScan(id, { companyId: ctx.companyId, triggeredBy: ctx.triggeredBy });
        return ok('retry', [`Scan/mission run ${r.missionRunId}`], { missionRunId: r.missionRunId });
      }
      const id = args[0];
      if (!id) return fail('retry', 'Usage: /retry <mission>|publish|scan|campaign …');
      const r = await opsRetryMission(id, { companyId: ctx.companyId, triggeredBy: ctx.triggeredBy });
      return ok(
        'retry',
        [`Mission retry run=${r.missionRunId} jobs=${r.jobsCreated}`],
        { missionRunId: r.missionRunId },
        missionActionKeyboard(id),
      );
    },
  });
}

/** Used by help listing from operations surface */
export function operationsHelpLines(): string[] {
  return [
    '/dashboard',
    '/jobs [running|pending|failed|completed]',
    '/mission <id> | retry|cancel|pause|resume',
    '/publish queue|now|retry|cancel',
    '/agents · /agent <id>|restart <id>',
    '/browser [release|recover|screenshot]',
    '/report today|week|publish|scan|agents|browser',
    '/retry <mission>|publish|scan|campaign',
  ];
}
