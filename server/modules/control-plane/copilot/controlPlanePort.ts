/**
 * Default Control Plane port implementation for Copilot.
 * Reads Operations / Fleet / Reports via Control Plane only.
 */

import type { AuthUser } from '../../../../src/types';
import { listAgentFindings } from '../../../agent/agentDb';
import { executeControlCommand } from '../command-engine';
import { consoleSystemUser } from '../command-engine/defaultCommands';
import { listRegisteredAgents } from '../agentRegistry';
import {
  opsBrowserStatus,
  opsGetDashboard,
  opsGetOperationsMetrics,
  opsListPublishQueue,
  opsPauseMission,
  opsReport,
  opsResumeMission,
  opsRetryPublish,
} from '../operationsService';
import type { OperationsMetricsSnapshot } from '../operations/types';
import type { ControlPlaneReportKind } from '../types';
import { buildRuleInsights, enrichInsightsWithLlm } from './insightEngine';
import {
  detectOperationalIncidents,
  explainScannerIdle,
} from './operationalIntelligence';
import { formatDailyBriefingLines } from './opsSummaries';
import { recommendAll } from './recommendations';
import type { CopilotBrowserRow, CopilotControlPlanePort, CopilotLeadHit } from './ports';
import type { SummarySlot } from './summaryScheduler';

function mapFinding(row: Record<string, unknown>): CopilotLeadHit {
  return {
    id: String(row.id || ''),
    title: (row.title as string | null) ?? null,
    score: (row.finalScore as number | null) ?? (row.score as number | null) ?? null,
    location: (row.primaryLocation as string | null) ?? null,
    classification: (row.classification as string | null) ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt || new Date().toISOString()),
  };
}

function todayBounds(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: new Date().toISOString() };
}

function yesterdayBounds(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function emptyOps(): OperationsMetricsSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refreshReason: 'dashboard',
    companyId: null,
    fleet: {
      machinesOnline: 0,
      machinesOffline: 0,
      machinesBusy: 0,
      machinesIdle: 0,
      cpuAvg: null,
      ramUsedPctAvg: null,
      browserBusy: 0,
      browserIdle: 0,
      healthScore: 0,
    },
    scanner: {
      sources: 0,
      assigned: 0,
      running: 0,
      completed: 0,
      findingsToday: 0,
      postsScanned: 0,
    },
    publisher: {
      draft: 0,
      queue: 0,
      publishing: 0,
      publishedToday: 0,
      retry: 0,
    },
    mission: { running: 0, waiting: 0, completed: 0, failed: 0 },
    workload: {
      totalScanSources: 0,
      assignedSources: 0,
      completedSources: 0,
      runningMissions: 0,
      runningPublishJobs: 0,
      runningCampaigns: 0,
      waitingJobs: 0,
      retryJobs: 0,
      failedJobs: 0,
    },
    machines: [],
  };
}

export function createControlPlanePort(input: {
  user?: AuthUser;
  companyId?: string | null;
  useLlmInsights?: boolean;
}): CopilotControlPlanePort {
  const companyId = input.companyId ?? null;
  const user = input.user ?? consoleSystemUser(companyId, 'telegram');

  const port: CopilotControlPlanePort = {
    user,

    async runCommand(raw) {
      return executeControlCommand(raw, {
        user,
        companyId,
        client: 'telegram',
        triggeredBy: 'copilot',
      });
    },

    async getDashboard() {
      return opsGetDashboard(user) as unknown as Record<string, unknown>;
    },

    async getOpsMetrics(refresh = false) {
      try {
        return await opsGetOperationsMetrics({
          companyId,
          refresh,
          reason: refresh ? 'manual' : 'telegram',
        });
      } catch {
        return emptyOps();
      }
    },

    async listOfflineAgents() {
      const agents = await listRegisteredAgents({
        companyId: user.role === 'owner' ? undefined : user.company_id ?? undefined,
      });
      return agents
        .filter(a => a.status === 'offline' || a.status === 'needs_login')
        .map(a => ({ agentId: a.agentId, status: a.status }));
    },

    async countLeadsToday(filters) {
      const bounds = todayBounds();
      const result = await listAgentFindings(
        user,
        { skip: 0, take: 10, page: 1 },
        {
          createdFrom: bounds.from,
          createdTo: bounds.to,
          location: filters?.location,
          includeSupplySignals: true,
          includeDismissed: false,
        },
      );
      return {
        total: result.total,
        items: result.items.map(i => mapFinding(i as unknown as Record<string, unknown>)),
      };
    },

    async searchLeads(search) {
      const result = await listAgentFindings(
        user,
        { skip: 0, take: search.limit ?? 10, page: 1 },
        {
          createdFrom: search.createdFrom,
          createdTo: search.createdTo,
          location: search.location,
          search: search.query,
          includeSupplySignals: true,
        },
      );
      return {
        total: result.total,
        items: result.items.map(i => mapFinding(i as unknown as Record<string, unknown>)),
      };
    },

    async listFailedPublishJobs(limit = 10) {
      const queue = await opsListPublishQueue({
        companyId,
        status: 'failed',
        limit,
      });
      return queue.map(j => ({
        id: j.id,
        error:
          (j as { lastError?: string | null; errorMessage?: string | null }).lastError ??
          (j as { errorMessage?: string | null }).errorMessage ??
          null,
      }));
    },

    async retryPublish(id) {
      try {
        const r = await opsRetryPublish(id, 'copilot');
        if (r.skipped) return { ok: false, id, error: r.reason };
        return { ok: true, id: r.job.id };
      } catch (err) {
        return { ok: false, id, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async pauseMission(nameOrId) {
      try {
        const m = await opsPauseMission(nameOrId);
        return { ok: true, message: `Paused ${m.name}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },

    async resumeMission(nameOrId) {
      try {
        const m = await opsResumeMission(nameOrId);
        return { ok: true, message: `Resumed ${m.name}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },

    async report(kind: ControlPlaneReportKind) {
      return opsReport(user, kind);
    },

    async buildInsights() {
      const dash = await opsGetDashboard(user);
      const today = await port.countLeadsToday();
      const yBounds = yesterdayBounds();
      const yesterday = await listAgentFindings(
        user,
        { skip: 0, take: 1, page: 1 },
        {
          createdFrom: yBounds.from,
          createdTo: yBounds.to,
          includeSupplySignals: true,
        },
      );
      const failedToday = await opsListPublishQueue({ companyId, status: 'failed', limit: 50 });
      const offline = await port.listOfflineAgents();
      const metrics = {
        leadsToday: today.total,
        leadsYesterday: yesterday.total,
        publishFailToday: failedToday.length,
        publishFailYesterday: 0,
        healthScore: dash.healthScore,
        agentsOffline: offline.length,
        scannerNote:
          dash.metrics.scanPerHour === 0
            ? 'Scanner Group / scan throughput gần 0 — nguồn có thể không còn hiệu quả.'
            : null,
      };
      const ruleLines = buildRuleInsights(metrics);
      return enrichInsightsWithLlm(
        { ...metrics, locationSample: today.items[0]?.location },
        ruleLines,
        Boolean(input.useLlmInsights),
      );
    },

    async detectIncidents() {
      const ops = await port.getOpsMetrics(false);
      const offline = await port.listOfflineAgents();
      const failed = await port.listFailedPublishJobs(20);
      const lastErrors = failed
        .filter(j => j.error)
        .map(j => ({ entityId: j.id, message: String(j.error) }));
      return detectOperationalIncidents(ops, {
        offlineAgentIds: offline.map(a => a.agentId),
        lastErrors,
      });
    },

    async listBrowsers() {
      try {
        const status = await opsBrowserStatus(user);
        const rows: CopilotBrowserRow[] = [];
        for (const w of status.workers || []) {
          const pool = Array.isArray(w.browserPool) ? w.browserPool : [];
          for (const raw of pool) {
            const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
            rows.push({
              agentId: String(w.workerId || ''),
              profile: String(p.profile || p.name || 'default'),
              facebookAccount: (p.facebookAccount as string | null) ?? null,
              busy: Boolean(p.busy),
              currentUrl: (p.currentUrl as string | null) ?? w.currentUrl ?? null,
              lockedBy: (p.lockedBy as string | null) ?? null,
              state: String(p.state || (p.busy ? 'busy' : 'idle')),
            });
          }
        }
        return rows;
      } catch {
        return [];
      }
    },

    async findMachine(query) {
      const q = query.trim().toLowerCase();
      if (!q) return null;
      const ops = await port.getOpsMetrics(false);
      return (
        ops.machines.find(
          m =>
            m.agentId.toLowerCase() === q ||
            m.hostname.toLowerCase() === q ||
            m.machineId.toLowerCase() === q ||
            (m.displayName || '').toLowerCase() === q ||
            m.hostname.toLowerCase().includes(q) ||
            (m.displayName || '').toLowerCase().includes(q),
        ) || null
      );
    },

    async explainScanner() {
      const ops = await port.getOpsMetrics(false);
      return explainScannerIdle(ops);
    },

    async buildSummary(slot: SummarySlot) {
      const ops = await port.getOpsMetrics(true);
      const leads = await port.countLeadsToday();
      const signals = await port.detectIncidents();
      const recs = recommendAll(signals.incidents);
      const label = slot === 'morning' ? '08:00' : slot === 'noon' ? '12:00' : '18:00';
      const lines = formatDailyBriefingLines({
        slotLabel: label,
        ops,
        leadsToday: leads.total,
        topLeads: leads.items,
        incidents: signals.incidents,
        recommendations: recs.map(r => r.summary),
      });
      return { text: lines.join('\n'), lines };
    },
  };

  return port;
}
