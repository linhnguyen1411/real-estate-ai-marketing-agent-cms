/**
 * Telegram Remote Console — commands go through Control Plane / Runtime API only.
 * Never calls Worker process APIs directly.
 */

import type { AuthUser } from '../../../src/types';
import { enqueueMissionRun, enqueueSourceScan } from '../../agent/agentJobService';
import { prisma } from '../../prisma';
import { buildAutomationRuntimeSnapshot } from '../../agent/runtimeObservability';
import { listRegisteredAgents } from './agentRegistry';
import { buildControlPlaneReport } from './reportEngine';
import { listRuntimeEvents } from './runtimeEventBus';

export type TelegramCommandResult = {
  ok: boolean;
  command: string;
  text: string;
};

function systemUser(companyId?: string | null): AuthUser {
  return {
    id: 'telegram-console',
    name: 'Telegram Console',
    email: 'telegram@local',
    role: companyId ? 'company' : 'owner',
    company_id: companyId ?? undefined,
  };
}

function parseCommand(raw: string): { command: string; args: string[] } {
  const text = raw.trim().replace(/^\//, '');
  const parts = text.split(/\s+/).filter(Boolean);
  const command = (parts[0] || '').toLowerCase();
  return { command, args: parts.slice(1) };
}

export async function handleTelegramControlCommand(
  raw: string,
  options?: { companyId?: string | null },
): Promise<TelegramCommandResult> {
  const { command, args } = parseCommand(raw);
  const user = systemUser(options?.companyId);

  try {
    switch (command) {
      case 'health': {
        const snap = await buildAutomationRuntimeSnapshot(user);
        return {
          ok: true,
          command,
          text: [
            `Health ${snap.healthScore}/100`,
            `worker=${snap.health.worker} browser=${snap.health.browser} queue=${snap.health.queue}`,
            `mission=${snap.health.mission} scheduler=${snap.health.scheduler}`,
            `queue waiting=${snap.queue.waiting} running=${snap.queue.running} dead=${snap.queue.deadLetter}`,
          ].join('\n'),
        };
      }

      case 'agents': {
        const agents = await listRegisteredAgents({
          companyId: options?.companyId ?? undefined,
        });
        if (agents.length === 0) {
          return { ok: true, command, text: 'No registered agents.' };
        }
        const lines = agents.map(
          a =>
            `• ${a.agentId} [${a.status}] host=${a.hostname} caps=${a.capabilities.join(',')} util=${a.metrics.slotUtilization ?? '—'}%`,
        );
        return { ok: true, command, text: `Agents (${agents.length})\n${lines.join('\n')}` };
      }

      case 'runtime': {
        const snap = await buildAutomationRuntimeSnapshot(user);
        const events = await listRuntimeEvents({ limit: 5 });
        return {
          ok: true,
          command,
          text: [
            `Runtime @ ${snap.generatedAt}`,
            `publish/h=${snap.metrics.publishPerHour} scan/h=${snap.metrics.scanPerHour}`,
            `success=${snap.metrics.successRate ?? '—'}% slotUtil=${snap.metrics.slotUtilization ?? '—'}%`,
            `missions running=${snap.missions.running} failed=${snap.missions.failed}`,
            `recent: ${events.map(e => e.type).join(', ') || 'none'}`,
          ].join('\n'),
        };
      }

      case 'missions': {
        const snap = await buildAutomationRuntimeSnapshot(user);
        const lines = snap.missionTimeline.slice(0, 8).map(
          m => `• ${m.id.slice(0, 8)} ${m.status} ${m.startedAt || m.createdAt}`,
        );
        return {
          ok: true,
          command,
          text: [
            `Missions W=${snap.missions.waiting} R=${snap.missions.running} C=${snap.missions.completed} F=${snap.missions.failed}`,
            ...lines,
          ].join('\n'),
        };
      }

      case 'report': {
        const scope = (args[0] || 'today').toLowerCase();
        const kind =
          scope === 'week' || scope === 'weekly'
            ? 'weekly'
            : scope === 'health'
              ? 'runtime_health'
              : scope === 'publish'
                ? 'publish'
                : scope === 'scan' || scope === 'scanner'
                  ? 'scanner'
                  : scope === 'campaign'
                    ? 'campaign'
                    : 'daily';
        const report = await buildControlPlaneReport(user, kind);
        return {
          ok: true,
          command,
          text: [
            `Report ${kind}`,
            `health=${report.healthScore}`,
            `metrics=${JSON.stringify(report.metrics)}`,
            `agents=${Array.isArray(report.agents) ? report.agents.length : 0}`,
          ].join('\n'),
        };
      }

      case 'scan': {
        if ((args[0] || '').toLowerCase() !== 'start') {
          return { ok: false, command, text: 'Usage: /scan start [sourceId]' };
        }
        const sourceId = args[1];
        if (sourceId) {
          const source = await prisma.agentSource.findUnique({ where: { id: sourceId } });
          if (!source) return { ok: false, command, text: `Source not found: ${sourceId}` };
          const r = await enqueueSourceScan({
            sourceId: source.id,
            companyId: source.companyId || options?.companyId || 'comp-da-nang',
            triggeredByUserId: 'telegram-console',
          });
          return { ok: true, command, text: `Scan enqueued job=${r.jobId} source=${source.name}` };
        }
        const sources = await prisma.agentSource.findMany({
          where: { status: 'active', ...(options?.companyId ? { companyId: options.companyId } : {}) },
          take: 20,
          orderBy: { priority: 'asc' },
        });
        const results: string[] = [];
        for (const s of sources) {
          try {
            const r = await enqueueSourceScan({
              sourceId: s.id,
              companyId: s.companyId || options?.companyId || 'comp-da-nang',
              triggeredByUserId: 'telegram-console',
            });
            results.push(`✓ ${s.name} → ${r.jobId}`);
          } catch (err) {
            results.push(`✗ ${s.name}: ${err instanceof Error ? err.message : err}`);
          }
        }
        return {
          ok: true,
          command,
          text: `Scan start (${sources.length})\n${results.join('\n') || 'No active sources'}`,
        };
      }

      case 'publish': {
        if ((args[0] || '').toLowerCase() !== 'now') {
          return { ok: false, command, text: 'Usage: /publish now' };
        }
        // Control plane does not invent publish jobs — surface queue state via Runtime API.
        const snap = await buildAutomationRuntimeSnapshot(user);
        const pubs = snap.activeJobs.filter(j => j.type === 'publish_social');
        return {
          ok: true,
          command,
          text: [
            'Publish now — use Campaign / approved drafts in CMS.',
            `Active publish jobs: ${pubs.length}`,
            `publish/hour: ${snap.metrics.publishPerHour}`,
            pubs
              .slice(0, 5)
              .map(j => `• ${j.id.slice(0, 8)} ${j.status}`)
              .join('\n') || '(none)',
          ].join('\n'),
        };
      }

      case 'cancel': {
        if ((args[0] || '').toLowerCase() !== 'mission' || !args[1]) {
          return { ok: false, command, text: 'Usage: /cancel mission <missionRunId>' };
        }
        const runId = args[1];
        const run = await prisma.agentMissionRun.findUnique({ where: { id: runId } });
        if (!run) return { ok: false, command, text: `Mission run not found: ${runId}` };
        await prisma.agentMissionRun.update({
          where: { id: runId },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
            error: 'Cancelled via Telegram console',
          },
        });
        await prisma.agentJob.updateMany({
          where: {
            missionRunId: runId,
            status: { in: ['queued', 'claimed', 'running'] },
          },
          data: {
            status: 'cancelled',
            finishedAt: new Date(),
            errorMessage: 'Cancelled via Telegram console',
          },
        });
        return { ok: true, command, text: `Cancelled mission run ${runId}` };
      }

      case 'help':
      case 'start':
        return {
          ok: true,
          command: 'help',
          text: [
            'Remote Console (Runtime API)',
            '/health',
            '/agents',
            '/runtime',
            '/missions',
            '/report today|week|health|publish|scanner|campaign',
            '/scan start [sourceId]',
            '/publish now',
            '/cancel mission <missionRunId>',
          ].join('\n'),
        };

      default:
        return {
          ok: false,
          command: command || 'unknown',
          text: `Unknown command. Try /help`,
        };
    }
  } catch (err) {
    return {
      ok: false,
      command: command || 'error',
      text: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Optional: start a mission run by id (used by tests / CLI). */
export async function telegramStartMission(
  missionId: string,
  companyId?: string | null,
): Promise<TelegramCommandResult> {
  try {
    const mission = await prisma.agentMission.findUnique({ where: { id: missionId } });
    if (!mission) {
      return { ok: false, command: 'mission', text: `Mission not found: ${missionId}` };
    }
    const r = await enqueueMissionRun({
      missionId: mission.id,
      companyId: mission.companyId || companyId || 'comp-da-nang',
      triggeredByUserId: 'telegram-console',
    });
    return {
      ok: true,
      command: 'mission',
      text: `Mission started run=${r.missionRunId} jobs=${r.jobsCreated}`,
    };
  } catch (err) {
    return {
      ok: false,
      command: 'mission',
      text: err instanceof Error ? err.message : String(err),
    };
  }
}
