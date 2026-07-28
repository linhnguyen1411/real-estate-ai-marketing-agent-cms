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
  opsLeadSkip,
  opsLeadCreateMission,
  opsLeadRetryNotify,
  opsLeadAssign,
  opsLeadAssignOwner,
  opsLeadCrm,
  opsLeadHistory,
  opsLeadCall,
  opsLeadContact,
  opsLeadOpen,
  opsLeadSource,
  opsRefreshRuntime,
  opsGetFleet,
  opsGetFleetAgent,
  opsListFleetJobs,
} from '../operationsService';
import {
  agentJobKeyboard,
  missionActionKeyboard,
  publishJobKeyboard,
} from '../inlineKeyboard';
import { listAgentSnapshots } from '../telemetry';
import {
  formatFleetDashboardLines,
  formatFleetAgentDetailLines,
  formatFleetBrowserLines,
  formatFleetJobOwnershipLines,
} from '../fleet';
import type { ControlPlaneReportKind } from '../types';
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
  if (scope === 'health' || scope === 'runtime' || scope === 'runtime_health') return 'runtime_health';
  if (scope === 'publish') return 'publish';
  if (scope === 'scan' || scope === 'scanner') return 'scanner';
  if (scope === 'campaign' || scope === 'campaigns') return 'campaign';
  if (scope === 'agent' || scope === 'agents') return 'agent';
  if (scope === 'browser' || scope === 'browsers') return 'browser';
  if (scope === 'failed' || scope === 'fail' || scope === 'failures') return 'failed';
  if (scope === 'fleet') return 'fleet';
  return 'daily';
}

export function registerOperationsCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'dashboard',
    description: 'Executive AI operations dashboard (business)',
    usage: '/dashboard',
    handler: async () => {
      const { buildExecutiveSnapshot, formatExecutiveDashboardLines } = await import(
        '../../executive-dashboard'
      );
      const snap = await buildExecutiveSnapshot();
      return ok('dashboard', formatExecutiveDashboardLines(snap), { snap });
    },
  });

  registry.register({
    name: 'ops',
    description: 'Operations / Runtime metrics dashboard',
    usage: '/ops',
    handler: async (_args, ctx) => {
      const d = await opsGetDashboard(ctx.user);
      const { formatOperationsDashboardLines } = await import('../operations');
      if (d.operations) {
        return ok('ops', formatOperationsDashboardLines(d.operations), {
          dashboard: d,
        });
      }
      return ok(
        'ops',
        [
          '══ Operations ══',
          `Health ${d.healthScore}/100`,
          `Agents online ${d.agentsOnline}/${d.agentsTotal}`,
          `Queue wait=${d.queue.waiting} run=${d.queue.running} fail=${d.queue.deadLetter}`,
          `Jobs active=${d.activeJobs}`,
          `Missions run=${d.missions.running} fail=${d.missions.failed} wait=${d.missions.waiting}`,
        ],
        { dashboard: d },
      );
    },
  });

  registry.register({
    name: 'jobs',
    description: 'List agent jobs',
    usage: '/jobs [running|pending|waiting|failed|completed]',
    handler: async (args, ctx) => {
      const raw = (args[0] || 'all').toLowerCase();
      const mapped = raw === 'waiting' ? 'pending' : raw;
      const allowed = ['running', 'pending', 'failed', 'completed', 'all'];
      const status = (allowed.includes(mapped) ? mapped : 'all') as
        | 'running'
        | 'pending'
        | 'failed'
        | 'completed'
        | 'all';
      const jobs = await opsListAgentJobs({
        companyId: ctx.companyId,
        status,
        limit: 12,
      });
      if (jobs.length === 0) {
        return ok('jobs', [`No jobs (${raw}).`], { jobs: [] });
      }
      const fleetJobs = await opsListFleetJobs({
        companyId: ctx.companyId,
        status,
        limit: 12,
      });
      const lines = [
        `Jobs · ${raw} (${jobs.length})`,
        ...formatFleetJobOwnershipLines(fleetJobs).slice(1),
      ];
      const first = jobs[0];
      return ok('jobs', lines, { jobs: fleetJobs }, first ? agentJobKeyboard(first.missionId || first.id) : undefined);
    },
  });

  registry.register({
    name: 'fleet',
    description: 'Fleet dashboard + orchestrator (placement / drain / policy)',
    usage:
      '/fleet | /fleet planner|drain|maintenance|policy <mode> | /fleet drain <agentId>',
    handler: async (args, ctx) => {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'planner' || sub === 'orchestrator' || sub === 'placement') {
        const { getOrchestratorSnapshot, formatOrchestratorReportLines } = await import(
          '../fleet-orchestrator'
        );
        const snap = getOrchestratorSnapshot();
        return ok('fleet', formatOrchestratorReportLines(snap), { orchestrator: snap });
      }
      if (sub === 'drain' || sub === 'maintenance') {
        const id = args[1] || '';
        if (!id) return fail('fleet', `Usage: /fleet ${sub} <agentId|hostname>`);
        const enable = (args[2] || 'on').toLowerCase() !== 'off';
        const { opsFleetPolicy } = await import('../operationsService');
        const r = await opsFleetPolicy({
          action: sub,
          machineId: id,
          agentId: id,
          hostname: id,
          enable,
        });
        return ok('fleet', [`${sub} ${enable ? 'ON' : 'OFF'} for ${id}`], r as Record<string, unknown>);
      }
      if (sub === 'policy') {
        const mode = (args[1] || '').toLowerCase();
        if (!mode) {
          const { getOrchestratorSnapshot, formatOrchestratorOverviewLines } = await import(
            '../fleet-orchestrator'
          );
          const snap = getOrchestratorSnapshot();
          return ok('fleet', formatOrchestratorOverviewLines(snap), { policy: snap.policyDefault });
        }
        const { opsFleetPolicy } = await import('../operationsService');
        const r = await opsFleetPolicy({ action: 'policy', mode });
        return ok('fleet', [`Fleet policy → ${mode}`], r as Record<string, unknown>);
      }
      const { state, orchestrator } = await opsGetFleet(ctx.companyId);
      const { formatOrchestratorOverviewLines } = await import('../fleet-orchestrator');
      return ok(
        'fleet',
        [
          ...formatFleetDashboardLines(state),
          ...formatOrchestratorOverviewLines(orchestrator),
        ],
        {
          total: state.total,
          online: state.online,
          healthScore: state.healthScore,
          orchestrator,
        },
      );
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
      const locals = listAgentSnapshots();
      const publishTel = locals
        .filter(a => a.publish?.destination || a.publish?.phase)
        .slice(0, 5)
        .map(
          a =>
            `• ${a.agentId} ${a.publish?.phase || '—'} → ${a.publish?.destination || '—'} url=${(a.publish?.publishedUrl || '—').slice(0, 40)} retries=${a.publish?.retryCount ?? 0}`,
        );
      const lines = [
        'Publish queue',
        ...jobs.slice(0, 10).map(j => {
          const when = j.scheduledAt ? new Date(j.scheduledAt).toISOString() : '—';
          return `• ${j.id.slice(0, 10)} [${j.status}] at=${when}`;
        }),
        jobs.length === 0 ? '(empty)' : '',
        `Agent publish_social active: ${active.length}`,
        publishTel.length ? 'Local publish telemetry:' : '',
        ...publishTel,
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
    description: 'Machine detail / soft restart request',
    usage: '/agent | /agent <id|hostname> | /agent restart <id>',
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
        const { state } = await opsGetFleet(ctx.companyId);
        return ok(
          'agent',
          [
            `Agents (${state.agents.length}) — use /agent <id|hostname>`,
            ...state.agents.slice(0, 12).map(a => {
              const age =
                a.heartbeatAgeMs != null ? `${Math.round(a.heartbeatAgeMs / 1000)}s` : '—';
              return `• ${a.hostname} [${a.status}/${a.activity}] id=${a.agentId} hb=${age}`;
            }),
          ],
          { agents: state.agents.map(a => a.agentId) },
        );
      }
      const fleet = await opsGetFleetAgent(id);
      if (!fleet) return fail('agent', `Agent not found: ${id}`);
      return ok('agent', formatFleetAgentDetailLines(fleet), {
        agentId: fleet.agentId,
        machineId: fleet.machineId,
        activity: fleet.activity,
      });
    },
  });

  registry.register({
    name: 'browser',
    description: 'Fleet browser ownership & lease ops (soft commands via Event Bus)',
    usage:
      '/browser | /browser profiles|release|force|takeover|recover|restart|screenshot [agentId]',
    handler: async (args, ctx) => {
      const sub = (args[0] || '').toLowerCase();
      if (
        sub === 'release' ||
        sub === 'recover' ||
        sub === 'screenshot' ||
        sub === 'restart' ||
        sub === 'force' ||
        sub === 'takeover'
      ) {
        const agentId = args[1] || null;
        const r = await opsBrowserCommand(
          sub === 'restart' ? 'restart' : (sub as 'release' | 'recover' | 'screenshot' | 'force' | 'takeover'),
          ctx.companyId,
          agentId,
        );
        return ok('browser', [`Browser ${sub} requested (OPS via heartbeat — no SSH)`], r);
      }
      if (sub === 'refresh') {
        const r = await opsRefreshRuntime(args[1] || null, ctx.companyId);
        return ok('browser', [`Runtime refresh requested for ${r.agentId}`], r);
      }
      if (sub === 'profiles') {
        const r = await opsBrowserCommand('profiles', ctx.companyId);
        return ok(
          'browser',
          Array.isArray((r as { lines?: string[] }).lines)
            ? (r as { lines: string[] }).lines
            : [`Profiles: ${(r as { profiles?: unknown[] }).profiles?.length ?? 0}`],
          r,
        );
      }
      const { listBrowserOwnership, formatBrowserOwnershipLines } = await import(
        '../browser-ownership'
      );
      const ownership = listBrowserOwnership();
      if (ownership.length > 0) {
        return ok('browser', formatBrowserOwnershipLines(ownership), {
          browsers: ownership.length,
          ownership,
        });
      }
      const { browsers } = await opsGetFleet(ctx.companyId);
      return ok('browser', formatFleetBrowserLines(browsers), { browsers: browsers.length });
    },
  });

  registry.register({
    name: 'runtime',
    description: 'Runtime metrics from Operations Metrics Snapshot',
    usage: '/runtime',
    handler: async (_args, ctx) => {
      const { opsGetOperationsMetrics } = await import('../operationsService');
      const { formatRuntimeMetricsLines } = await import('../operations');
      const metrics = await opsGetOperationsMetrics({
        companyId: ctx.companyId,
        refresh: true,
        reason: 'telegram',
      });
      return ok('runtime', formatRuntimeMetricsLines(metrics), {
        generatedAt: metrics.generatedAt,
        machines: metrics.machines.length,
      });
    },
  });

  // Override report to accept agents/browser aliases already in parseReportKind
  registry.register({
    name: 'report',
    description: 'Control Plane reports',
    usage: '/report today|week|fleet|runtime|publish|scan|failed|agent|browser',
    handler: async (args, ctx) => {
      const kind = parseReportKind(args[0]);
      const report = await opsReport(ctx.user, kind);
      const { formatOperationsDashboardLines, formatRuntimeMetricsLines } = await import(
        '../operations'
      );
      if (kind === 'fleet' && report.fleet && typeof report.fleet === 'object') {
        const fleet = report.fleet as Parameters<typeof formatFleetDashboardLines>[0];
        const lines = [`Report · fleet`, ...formatFleetDashboardLines(fleet)];
        if (report.operations && typeof report.operations === 'object') {
          lines.push(
            ...formatOperationsDashboardLines(
              report.operations as Parameters<typeof formatOperationsDashboardLines>[0],
            ).slice(0, 8),
          );
        }
        return ok('report', lines, { kind, report });
      }
      if (
        (kind === 'runtime_health' || kind === 'scanner' || kind === 'publish') &&
        report.operations &&
        typeof report.operations === 'object'
      ) {
        const ops = report.operations as Parameters<typeof formatOperationsDashboardLines>[0];
        const header =
          kind === 'runtime_health'
            ? formatRuntimeMetricsLines(ops)
            : formatOperationsDashboardLines(ops);
        return ok('report', [`Report · ${kind}`, ...header], { kind, report });
      }
      const lines = [
        `Report · ${kind}`,
        `health=${String(report.healthScore ?? '—')}`,
        `metrics=${JSON.stringify(report.metrics ?? {}).slice(0, 200)}`,
        `events=${JSON.stringify(report.eventCounts ?? {}).slice(0, 200)}`,
        `agents=${Array.isArray(report.agents) ? (report.agents as unknown[]).length : 0}`,
      ];
      if (kind === 'failed') {
        lines.push(
          `failedMissions=${String(report.failedMissions ?? '—')}`,
          `deadLetter=${String(report.deadLetter ?? '—')}`,
        );
      }
      return ok('report', lines, { kind, report });
    },
  });

  registry.register({
    name: 'lead',
    description: 'Lead alert actions (skip / mission / retry / assign / owner / crm / history / call / contact / open / source)',
    usage: '/lead skip|mission|retry|assign|owner|crm|history|call|contact|open|source <findingId> [ownerId]',
    handler: async (args, ctx) => {
      const action = (args[0] || '').toLowerCase();
      const id = args[1];
      if (
        !id ||
        ![
          'skip',
          'mission',
          'retry',
          'assign',
          'owner',
          'crm',
          'history',
          'call',
          'contact',
          'open',
          'source',
        ].includes(action)
      ) {
        return fail(
          'lead',
          'Usage: /lead skip|mission|retry|assign|owner|crm|history|call|contact|open|source <findingId> [ownerId]',
        );
      }
      if (action === 'skip') {
        const r = await opsLeadSkip(id, ctx.triggeredBy);
        return ok(
          'lead',
          r.idempotent
            ? ['🚫 Lead đã được bỏ qua trước đó.']
            : ['🚫 Đã bỏ qua lead.'],
          r,
        );
      }
      if (action === 'mission') {
        const r = await opsLeadCreateMission(id, ctx.triggeredBy);
        return ok('lead', [`Lead mission requested ${r.findingId}`], r);
      }
      if (action === 'assign') {
        const r = await opsLeadAssign(id, ctx.triggeredBy);
        return ok('lead', r.lines, r, r.replyMarkup);
      }
      if (action === 'owner') {
        const ownerId = args[2] || 'self';
        const r = await opsLeadAssignOwner(id, ownerId, ctx.triggeredBy);
        return ok('lead', r.lines, r);
      }
      if (action === 'crm') {
        const r = await opsLeadCrm(id, ctx.triggeredBy);
        return ok('lead', [`Lead → CRM ${r.findingId}`], r);
      }
      if (action === 'history') {
        const r = await opsLeadHistory(id);
        return ok('lead', r.lines, r);
      }
      if (action === 'call') {
        const r = await opsLeadCall(id, ctx.triggeredBy);
        return ok('lead', r.lines, r);
      }
      if (action === 'contact') {
        const r = await opsLeadContact(id, ctx.triggeredBy);
        return ok('lead', r.lines, r);
      }
      if (action === 'open') {
        const r = await opsLeadOpen(id, ctx.triggeredBy);
        return ok('lead', r.lines, r);
      }
      if (action === 'source') {
        const r = await opsLeadSource(id, ctx.triggeredBy);
        return ok('lead', r.lines, r);
      }
      const r = await opsLeadRetryNotify(id);
      if (!r.ok) {
        return fail('lead', r.reason || r.error || 'retry notify failed');
      }
      return ok('lead', [`Lead notify retried ${id}`], { messageId: r.messageId });
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

  // H2.4.9 — Urgent Buyers drill-down
  registry.register({
    name: 'sales',
    description: 'Sales Pipeline · Urgent Buyers',
    usage: '/sales urgent [page] | /sales card <findingId>',
    handler: async (args, ctx) => {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'urgent' || sub === 'buyers') {
        const page = Math.max(0, Number(args[1] || 0) || 0);
        const {
          getUrgentBuyersBundle,
          formatUrgentBuyersListText,
          urgentBuyersListKeyboard,
        } = await import('../../sales-layer');
        const bundle = await getUrgentBuyersBundle({
          companyId: ctx.companyId,
          sinceHours: 720,
          page,
        });
        if (bundle.total !== bundle.metrics.urgentBuyers) {
          console.warn(
            '[sales] urgent count mismatch list=%s metrics=%s',
            bundle.total,
            bundle.metrics.urgentBuyers,
          );
        }
        const text = formatUrgentBuyersListText({
          total: bundle.total,
          items: bundle.items,
          page: bundle.page,
        });
        const kb =
          bundle.total > 0
            ? urgentBuyersListKeyboard({
                items: bundle.items,
                total: bundle.total,
                page: bundle.page,
              })
            : undefined;
        return ok('sales', text.split('\n'), bundle, kb);
      }
      if (sub === 'card' || sub === 'open') {
        const id = args[1];
        if (!id) return fail('sales', 'Usage: /sales card <findingId>');
        const r = await opsLeadRetryNotify(id);
        if (!r.ok) {
          return fail('sales', r.reason || r.error || 'Không mở được Sales Action Card');
        }
        return ok('sales', [`🎯 Đã mở Sales Action Card · ${id.slice(0, 12)}`], {
          messageId: r.messageId,
        });
      }
      return fail('sales', 'Usage: /sales urgent [page] | /sales card <findingId>');
    },
  });
}

/** Used by help listing from operations surface */
export function operationsHelpLines(): string[] {
  return [
    '/dashboard · Executive',
    '/ops · Runtime metrics',
    '/fleet',
    '/jobs [running|waiting|pending|failed|completed]',
    '/mission <id> | retry|cancel|pause|resume',
    '/publish queue|now|retry|cancel',
    '/scan | start|stop <mission>',
    '/agents · /agent <id|hostname>|restart <id>',
    '/browser [profiles|release|recover|restart|refresh]',
    '/runtime · /health',
    '/report today|week|fleet|runtime|publish|scan|failed|agent|browser',
    '/lead skip|mission|retry|assign|crm|history|call|contact|open|source <id>',
    '/sales urgent [page] | /sales card <findingId>',
    '/retry <mission>|publish|scan|campaign',
  ];
}
