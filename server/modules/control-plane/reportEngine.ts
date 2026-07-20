/**
 * Report Engine — projections from Runtime API (+ daily metrics reuse).
 * Never queries Worker process directly.
 */

import type { AuthUser } from '../../../src/types';
import { buildAutomationRuntimeSnapshot } from '../../agent/runtimeObservability';
import { getDailyAgentReport } from '../../agent/dailyReportService';
import { listRegisteredAgents } from './agentRegistry';
import { listRuntimeEvents } from './runtimeEventBus';
import type { ControlPlaneReportKind } from './types';

export async function buildControlPlaneReport(
  user: AuthUser,
  kind: ControlPlaneReportKind,
  options?: { date?: string },
): Promise<Record<string, unknown>> {
  const runtime = await buildAutomationRuntimeSnapshot(user);
  const agents = await listRegisteredAgents({
    companyId: user.role === 'owner' ? undefined : user.company_id ?? '__none__',
  });
  const since =
    kind === 'weekly'
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await listRuntimeEvents({
    companyId: user.role === 'owner' ? undefined : user.company_id ?? null,
    since,
    limit: 100,
  });

  const base = {
    kind,
    generatedAt: new Date().toISOString(),
    dataSource: 'runtime_api' as const,
    healthScore: runtime.healthScore,
    health: runtime.health,
    metrics: runtime.metrics,
    agents: agents.map(a => ({
      agentId: a.agentId,
      hostname: a.hostname,
      status: a.status,
      capabilities: a.capabilities,
      slotUtilization: a.metrics.slotUtilization,
    })),
    eventCounts: countByType(events.map(e => e.type)),
  };

  switch (kind) {
    case 'runtime_health':
      return {
        ...base,
        queue: runtime.queue,
        slots: runtime.slots,
        browsers: runtime.browsers,
        workersOnline: agents.filter(a => a.status === 'online').length,
        recentEvents: events.slice(0, 20),
      };

    case 'scanner':
      return {
        ...base,
        scanPerHour: runtime.metrics.scanPerHour,
        missions: runtime.missions,
        activeScanJobs: runtime.activeJobs.filter(
          j => j.type === 'scan_source' || j.type === 'source_scan',
        ),
      };

    case 'publish':
      return {
        ...base,
        publishPerHour: runtime.metrics.publishPerHour,
        successRate: runtime.metrics.successRate,
        campaigns: runtime.campaigns,
        activePublishJobs: runtime.activeJobs.filter(j => j.type === 'publish_social'),
      };

    case 'campaign':
      return {
        ...base,
        campaigns: runtime.campaigns,
        campaignEvents: events.filter(e => e.type.startsWith('CAMPAIGN_')),
      };

    case 'agent':
      return {
        ...base,
        agentsDetail: agents,
        agentEvents: events.filter(e => e.type.startsWith('AGENT_')),
        online: agents.filter(a => a.status === 'online').length,
      };

    case 'fleet': {
      const { getFleetState, listFleetBrowsers } = await import('./fleet');
      const fleet = await getFleetState({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? null,
      });
      return {
        ...base,
        fleet,
        browsers: listFleetBrowsers(fleet.agents),
        online: fleet.online,
        offline: fleet.offline,
        busy: fleet.busy,
        idle: fleet.idle,
      };
    }

    case 'browser':
      return {
        ...base,
        browsers: runtime.browsers,
        slots: runtime.slots,
        browserEvents: events.filter(
          e => e.type.startsWith('BROWSER_') || e.type.startsWith('SLOT_'),
        ),
        browserUtilization: runtime.metrics.browserUtilization,
      };

    case 'failed':
      return {
        ...base,
        failedMissions: runtime.missions.failed,
        deadLetter: runtime.queue.deadLetter,
        failedEvents: events.filter(
          e =>
            e.type === 'MISSION_FAILED' ||
            e.type === 'JOB_FAILED' ||
            String(e.payload?.error || ''),
        ),
        activeFailedJobs: runtime.activeJobs.filter(j => j.status === 'failed'),
      };

    case 'weekly':
      return {
        ...base,
        windowDays: 7,
        missions: runtime.missions,
        queue: runtime.queue,
        campaigns: runtime.campaigns,
      };

    case 'daily':
    default: {
      // Reuse existing daily report metrics; attach runtime health (no worker direct query).
      const daily = await getDailyAgentReport(user, {
        date: options?.date,
        includeAiSummary: false,
      });
      return {
        ...base,
        dailyMetrics: daily.metrics,
        queue: runtime.queue,
        missions: runtime.missions,
      };
    }
  }
}

function countByType(types: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of types) out[t] = (out[t] || 0) + 1;
  return out;
}
