/**
 * Default Control Plane commands — adapters over Runtime API / Mission enqueue / Reports.
 * No Telegram-specific logic.
 */

import { enqueueMissionRun, enqueueSourceScan } from '../../../agent/agentJobService';
import { buildAutomationRuntimeSnapshot } from '../../../agent/runtimeObservability';
import { prisma } from '../../../prisma';
import { listRegisteredAgents } from '../agentRegistry';
import { buildControlPlaneReport } from '../reportEngine';
import { listAgentSnapshots } from '../telemetry';
import type { ControlPlaneReportKind } from '../types';
import { subscribeRuntimeEvents, summarizeEventStream } from './eventSubscription';
import type { CommandRegistry } from './registry';
import type { CommandContext, CommandResult } from './types';

function ok(command: string, lines: string[], data?: Record<string, unknown>): CommandResult {
  return { ok: true, command, lines, data };
}

function fail(command: string, message: string): CommandResult {
  return { ok: false, command, lines: [message], error: message };
}

async function resolveMission(idOrName: string) {
  const byId = await prisma.agentMission.findUnique({ where: { id: idOrName } });
  if (byId) return byId;
  return prisma.agentMission.findFirst({
    where: { name: { equals: idOrName, mode: 'insensitive' } },
  });
}

async function resolveCampaign(idOrName: string) {
  const byId = await prisma.socialCampaign.findUnique({ where: { id: idOrName } });
  if (byId) return byId;
  return prisma.socialCampaign.findFirst({
    where: { name: { equals: idOrName, mode: 'insensitive' } },
  });
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
  if (scope === 'failed' || scope === 'fail' || scope === 'failures') return 'failed';
  return 'daily';
}

export function registerDefaultCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'health',
    description: 'Runtime health score + local agent heartbeats',
    usage: '/health',
    handler: async (_args, ctx) => {
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const events = await subscribeRuntimeEvents({
        companyId: ctx.companyId,
        limit: 10,
      });
      const summary = summarizeEventStream(events);
      const locals = listAgentSnapshots();
      return ok(
        'health',
        [
          `Health ${snap.healthScore}/100`,
          `worker=${snap.health.worker} browser=${snap.health.browser} queue=${snap.health.queue}`,
          `mission=${snap.health.mission} scheduler=${snap.health.scheduler}`,
          `queue waiting=${snap.queue.waiting} running=${snap.queue.running} dead=${snap.queue.deadLetter}`,
          `local agents=${locals.length}`,
          ...locals.slice(0, 5).map(
            a =>
              `• ${a.agentId} host=${a.hostname} hb=${a.heartbeatAt} jobs=${a.jobs.running}/${a.jobs.waiting}`,
          ),
          `events: ${summary.recent.join(', ') || 'none'}`,
        ],
        {
          healthScore: snap.healthScore,
          health: snap.health,
          queue: snap.queue,
          eventCounts: summary.counts,
          localAgents: locals.length,
        },
      );
    },
  });

  registry.register({
    name: 'runtime',
    description: 'Runtime snapshot (VPS + local Execution Agents)',
    usage: '/runtime',
    handler: async (_args, ctx) => {
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const events = await subscribeRuntimeEvents({ companyId: ctx.companyId, limit: 5 });
      const locals = listAgentSnapshots();
      return ok(
        'runtime',
        [
          `Runtime @ ${snap.generatedAt}`,
          `publish/h=${snap.metrics.publishPerHour} scan/h=${snap.metrics.scanPerHour}`,
          `success=${snap.metrics.successRate ?? '—'}% slotUtil=${snap.metrics.slotUtilization ?? '—'}%`,
          `missions running=${snap.missions.running} failed=${snap.missions.failed}`,
          `Execution Agents (${locals.length})`,
          ...locals.slice(0, 6).map(
            a =>
              `• ${a.agentId} ${a.platform} v${a.version} chrome=${a.chromeCount} rss=${a.process.rssMb ?? '—'}MB`,
          ),
          `recent: ${events.map(e => e.type).join(', ') || 'none'}`,
        ],
        {
          metrics: snap.metrics,
          missions: snap.missions,
          generatedAt: snap.generatedAt,
          agents: locals,
        },
      );
    },
  });

  registry.register({
    name: 'agents',
    description: 'Agent registry',
    usage: '/agents',
    handler: async (_args, ctx) => {
      const agents = await listRegisteredAgents({
        companyId: ctx.companyId ?? undefined,
      });
      if (agents.length === 0) {
        return ok('agents', ['No registered agents.'], { agents: [] });
      }
      const lines = agents.map(
        a =>
          `• ${a.agentId} [${a.status}] host=${a.hostname} caps=${a.capabilities.join(',')} util=${a.metrics.slotUtilization ?? '—'}%`,
      );
      return ok('agents', [`Agents (${agents.length})`, ...lines], {
        agents: agents.map(a => ({
          agentId: a.agentId,
          status: a.status,
          hostname: a.hostname,
          capabilities: a.capabilities,
        })),
      });
    },
  });

  registry.register({
    name: 'missions',
    description: 'Mission runtime timeline',
    usage: '/missions',
    handler: async (_args, ctx) => {
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const lines = snap.missionTimeline.slice(0, 8).map(
        m => `• ${m.id.slice(0, 10)} ${m.status} ${m.startedAt || m.createdAt}`,
      );
      return ok(
        'missions',
        [
          `Missions W=${snap.missions.waiting} R=${snap.missions.running} C=${snap.missions.completed} F=${snap.missions.failed}`,
          ...lines,
        ],
        { missions: snap.missions, timeline: snap.missionTimeline.slice(0, 8) },
      );
    },
  });

  registry.register({
    name: 'browser',
    description: 'Browser pool snapshot',
    usage: '/browser',
    handler: async (_args, ctx) => {
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const browsers = (snap.browsers as Array<Record<string, unknown>>) || [];
      const lines =
        browsers.length === 0
          ? ['No browser pool data (no online agent heartbeat).']
          : browsers.map(
              b =>
                `• ${b.browserId ?? '—'} ${b.purpose ?? '—'} [${b.state ?? '—'}] job=${b.ownerJob ?? '—'}`,
            );
      return ok('browser', ['Browser Pool', ...lines], { browsers });
    },
  });

  registry.register({
    name: 'campaigns',
    description: 'Campaign runtime',
    usage: '/campaigns',
    handler: async (_args, ctx) => {
      const snap = await buildAutomationRuntimeSnapshot(ctx.user);
      const lines =
        snap.campaigns.length === 0
          ? ['No recent campaigns.']
          : snap.campaigns.slice(0, 10).map(c => {
              const done = c.progress.completed + c.progress.failed;
              return `• ${c.id.slice(0, 10)} ${c.status} ${done}/${c.progress.total} ok=${c.success} fail=${c.failed}`;
            });
      return ok('campaigns', ['Campaign Runtime', ...lines], {
        campaigns: snap.campaigns.slice(0, 10),
      });
    },
  });

  registry.register({
    name: 'report',
    description: 'Report engine projection',
    usage: '/report today|week|health|publish|scanner|campaign|agent|browser',
    handler: async (args, ctx) => {
      const kind = parseReportKind(args[0]);
      const report = await buildControlPlaneReport(ctx.user, kind);
      return ok(
        'report',
        [
          `Report ${kind}`,
          `health=${report.healthScore}`,
          `metrics=${JSON.stringify(report.metrics)}`,
          `agents=${Array.isArray(report.agents) ? report.agents.length : 0}`,
          `events=${JSON.stringify(report.eventCounts || {})}`,
        ],
        report,
      );
    },
  });

  registry.register({
    name: 'scan',
    description: 'Scanner telemetry / start / stop via Mission Engine',
    usage: '/scan | /scan start <mission> | /scan stop <mission>',
    handler: async (args, ctx) => {
      const action = (args[0] || '').toLowerCase();
      const target = args[1];

      if (!action || action === 'status') {
        const locals = listAgentSnapshots();
        const lines = [
          `Scanner telemetry · agents=${locals.length}`,
          ...locals.slice(0, 8).map(a => {
            const s = a.scanner;
            return `• ${a.agentId} source=${s?.currentSource || s?.currentGroup || '—'} posts=${s?.postsScanned ?? '—'} rem=${s?.postsRemaining ?? '—'} findings=${s?.findings ?? '—'} kw=${s?.currentKeyword || '—'}`;
          }),
          locals.length === 0 ? '(no agent heartbeat yet)' : '',
          '/scan start <mission> · /scan stop <mission>',
        ].filter(Boolean);
        return ok('scan', lines, { agents: locals.map(a => a.agentId) });
      }

      if (action === 'start') {
        if (!target) {
          // Legacy: enqueue all active sources when no mission given
          const sources = await prisma.agentSource.findMany({
            where: {
              status: 'active',
              ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
            },
            take: 20,
            orderBy: { priority: 'asc' },
          });
          const results: string[] = [];
          for (const s of sources) {
            try {
              const r = await enqueueSourceScan({
                sourceId: s.id,
                companyId: s.companyId || ctx.companyId || 'comp-da-nang',
                triggeredByUserId: ctx.triggeredBy,
              });
              results.push(`✓ ${s.name} → ${r.jobId}`);
            } catch (err) {
              results.push(`✗ ${s.name}: ${err instanceof Error ? err.message : err}`);
            }
          }
          return ok('scan', [`Scan start sources (${sources.length})`, ...results], {
            mode: 'sources',
            count: sources.length,
          });
        }
        const mission = await resolveMission(target);
        if (!mission) return fail('scan', `Mission not found: ${target}`);
        const r = await enqueueMissionRun({
          missionId: mission.id,
          companyId: mission.companyId || ctx.companyId || 'comp-da-nang',
          triggeredByUserId: ctx.triggeredBy,
        });
        return ok(
          'scan',
          [
            `Scan started mission=${mission.name}`,
            `run=${r.missionRunId} jobs=${r.jobsCreated} skipped=${r.jobsSkipped}`,
          ],
          { missionRunId: r.missionRunId, jobsCreated: r.jobsCreated },
        );
      }

      if (action === 'stop') {
        if (!target) return fail('scan', 'Usage: /scan stop <mission>');
        const mission = await resolveMission(target);
        if (!mission) return fail('scan', `Mission not found: ${target}`);
        const runs = await prisma.agentMissionRun.findMany({
          where: {
            missionId: mission.id,
            status: { in: ['queued', 'running'] },
          },
          select: { id: true },
        });
        let cancelledJobs = 0;
        for (const run of runs) {
          await prisma.agentMissionRun.update({
            where: { id: run.id },
            data: {
              status: 'cancelled',
              completedAt: new Date(),
              error: `Stopped via Control Plane console (${ctx.client})`,
            },
          });
          const res = await prisma.agentJob.updateMany({
            where: {
              missionRunId: run.id,
              status: { in: ['queued', 'claimed', 'running'] },
            },
            data: {
              status: 'cancelled',
              finishedAt: new Date(),
              errorMessage: `Stopped via Control Plane console (${ctx.client})`,
            },
          });
          cancelledJobs += res.count;
        }
        return ok(
          'scan',
          [
            `Scan stopped mission=${mission.name}`,
            `runsCancelled=${runs.length} jobsCancelled=${cancelledJobs}`,
          ],
          { runsCancelled: runs.length, jobsCancelled: cancelledJobs },
        );
      }

      return fail('scan', 'Usage: /scan | /scan start <mission> | /scan stop <mission>');
    },
  });

  registry.register({
    name: 'publish',
    description: 'Publish queue or start campaign publish via Mission',
    usage: '/publish queue | /publish now <campaign>',
    handler: async (args, ctx) => {
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'queue') {
        const { listJobs } = await import('../../social-publishing/jobService');
        const jobs = await listJobs({
          companyId: ctx.companyId,
          status: 'queued',
          limit: 20,
        });
        const snap = await buildAutomationRuntimeSnapshot(ctx.user);
        const active = snap.activeJobs.filter(j => j.type === 'publish_social');
        return ok(
          'publish',
          [
            'Publish queue (SocialPublishJob queued → Mission → Agent poll):',
            ...jobs.slice(0, 12).map(j => {
              const when = j.scheduledAt ? new Date(j.scheduledAt).toISOString() : '—';
              return `• ${j.id.slice(0, 10)} channel=${j.channelId.slice(0, 8)} at=${when}`;
            }),
            jobs.length === 0 ? '(no queued SocialPublishJob)' : '',
            `Agent publish_social active: ${active.length}`,
            'Start campaign: /publish now <campaign>',
          ].filter(Boolean),
          {
            queued: jobs.length,
            activePublishJobs: active.length,
            jobIds: jobs.slice(0, 12).map(j => j.id),
          },
        );
      }

      if (sub !== 'now') {
        return fail('publish', 'Usage: /publish queue | /publish now <campaign>');
      }
      const target = args[1];
      if (!target) {
        return fail('publish', 'Usage: /publish now <campaign>');
      }
      const campaign = await resolveCampaign(target);
      if (!campaign) return fail('publish', `Campaign not found: ${target}`);
      const { startCampaignRun } = await import(
        '../../social-publishing/campaignService'
      );
      const started = await startCampaignRun({
        campaignId: campaign.id,
        triggeredBy: ctx.triggeredBy,
        triggerType: 'manual',
        enqueueNow: true,
      });
      return ok(
        'publish',
        [
          `Publish now campaign=${campaign.name}`,
          `run=${started.run.id} status=${started.run.status}`,
          `targets=${started.progress.total}`,
          'Flow: Mission → Production Queue → Execution Agent poll → Local schedule → Browser',
        ],
        {
          campaignId: campaign.id,
          runId: started.run.id,
          status: started.run.status,
          progress: started.progress,
        },
      );
    },
  });

  registry.register({
    name: 'pause',
    description: 'Pause a mission (Control Plane → Mission status)',
    usage: '/pause <mission>',
    handler: async (args, _ctx) => {
      const target = args[0];
      if (!target) return fail('pause', 'Usage: /pause <mission>');
      const mission = await resolveMission(target);
      if (!mission) return fail('pause', `Mission not found: ${target}`);
      const updated = await prisma.agentMission.update({
        where: { id: mission.id },
        data: { status: 'paused' },
      });
      return ok(
        'pause',
        [`Paused mission ${updated.name || updated.id}`, `status=${updated.status}`],
        { missionId: updated.id, status: updated.status },
      );
    },
  });

  registry.register({
    name: 'resume',
    description: 'Resume (activate) a paused mission',
    usage: '/resume <mission>',
    handler: async (args, _ctx) => {
      const target = args[0];
      if (!target) return fail('resume', 'Usage: /resume <mission>');
      const mission = await resolveMission(target);
      if (!mission) return fail('resume', `Mission not found: ${target}`);
      const updated = await prisma.agentMission.update({
        where: { id: mission.id },
        data: { status: 'active' },
      });
      return ok(
        'resume',
        [`Resumed mission ${updated.name || updated.id}`, `status=${updated.status}`],
        { missionId: updated.id, status: updated.status },
      );
    },
  });

  registry.register({
    name: 'cancel',
    description: 'Cancel mission run or active mission runs',
    usage: '/cancel <mission|missionRunId>',
    handler: async (args, ctx) => {
      // Support legacy: /cancel mission <id>
      const target =
        (args[0] || '').toLowerCase() === 'mission' ? args[1] : args[0];
      if (!target) return fail('cancel', 'Usage: /cancel <mission|missionRunId>');

      const run = await prisma.agentMissionRun.findUnique({ where: { id: target } });
      if (run) {
        await prisma.agentMissionRun.update({
          where: { id: run.id },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
            error: `Cancelled via Control Plane console (${ctx.client})`,
          },
        });
        const res = await prisma.agentJob.updateMany({
          where: {
            missionRunId: run.id,
            status: { in: ['queued', 'claimed', 'running'] },
          },
          data: {
            status: 'cancelled',
            finishedAt: new Date(),
            errorMessage: `Cancelled via Control Plane console (${ctx.client})`,
          },
        });
        return ok(
          'cancel',
          [`Cancelled mission run ${run.id}`, `jobs=${res.count}`],
          { missionRunId: run.id, jobsCancelled: res.count },
        );
      }

      const mission = await resolveMission(target);
      if (!mission) return fail('cancel', `Mission / run not found: ${target}`);
      const runs = await prisma.agentMissionRun.findMany({
        where: { missionId: mission.id, status: { in: ['queued', 'running'] } },
        select: { id: true },
      });
      let jobs = 0;
      for (const r of runs) {
        await prisma.agentMissionRun.update({
          where: { id: r.id },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
            error: `Cancelled via Control Plane console (${ctx.client})`,
          },
        });
        const res = await prisma.agentJob.updateMany({
          where: {
            missionRunId: r.id,
            status: { in: ['queued', 'claimed', 'running'] },
          },
          data: {
            status: 'cancelled',
            finishedAt: new Date(),
            errorMessage: `Cancelled via Control Plane console (${ctx.client})`,
          },
        });
        jobs += res.count;
      }
      return ok(
        'cancel',
        [`Cancelled mission=${mission.name} runs=${runs.length} jobs=${jobs}`],
        { missionId: mission.id, runsCancelled: runs.length, jobsCancelled: jobs },
      );
    },
  });

  registry.register({
    name: 'retry',
    description: 'Retry mission (new MissionRun)',
    usage: '/retry <mission>',
    handler: async (args, ctx) => {
      const target = args[0];
      if (!target) return fail('retry', 'Usage: /retry <mission>');
      const mission = await resolveMission(target);
      if (!mission) return fail('retry', `Mission not found: ${target}`);
      const r = await enqueueMissionRun({
        missionId: mission.id,
        companyId: mission.companyId || ctx.companyId || 'comp-da-nang',
        triggeredByUserId: ctx.triggeredBy,
      });
      return ok(
        'retry',
        [
          `Retry mission=${mission.name}`,
          `run=${r.missionRunId} jobs=${r.jobsCreated} skipped=${r.jobsSkipped}`,
        ],
        { missionRunId: r.missionRunId, jobsCreated: r.jobsCreated },
      );
    },
  });

  registry.register({
    name: 'help',
    description: 'List commands',
    usage: '/help',
    handler: async (_args, _ctx) => {
      const lines = [
        'Control Plane · Operations Center',
        '/dashboard',
        '/health · /runtime · /agents',
        '/jobs [running|pending|failed|completed]',
        '/missions · /mission <id>|retry|cancel|pause|resume',
        '/publish queue|now|retry|cancel',
        '/agent <id>|restart <id>',
        '/browser [release|recover|screenshot]',
        '/report today|week|publish|scan|agents|browser',
        '/scan start|stop <mission>',
        '/retry <mission>|publish|scan|campaign',
        '/cancel · /pause · /resume',
      ];
      return ok('help', lines, { commands: registry.list().map(c => c.name) });
    },
  });

  registry.alias('start', 'help');
}

/** Build AuthUser for console clients without browser session. */
export function consoleSystemUser(
  companyId: string | null | undefined,
  client: string,
): CommandContext['user'] {
  return {
    id: `${client}-console`,
    name: `${client} Console`,
    email: `${client}@local`,
    role: companyId ? 'company' : 'owner',
    company_id: companyId ?? undefined,
  };
}
