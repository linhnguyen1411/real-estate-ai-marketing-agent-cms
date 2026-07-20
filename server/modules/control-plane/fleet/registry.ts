/**
 * Fleet Registry — enrich AgentNode + Runtime Snapshot → FleetAgent.
 * Snapshot-first: prefer in-memory telemetry, else normalize session metadata.
 */

import type { BrowserSession } from '@prisma/client';
import { prisma } from '../../../prisma';
import { listRegisteredAgents, sessionToAgentNode } from '../agentRegistry';
import {
  getLastAgentSnapshot,
  normalizeRuntimeSnapshot,
} from '../telemetry';
import type { ExecutionAgentRuntimeSnapshot } from '../telemetry/types';
import type { AgentNode } from '../types';
import type { FleetActivity, FleetAgent, FleetBrowserRow } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

function deriveActivity(
  status: AgentNode['status'],
  snap: ExecutionAgentRuntimeSnapshot | null,
  lastError: string | null,
): FleetActivity {
  if (status === 'offline' || status === 'starting') return 'offline';
  if (status === 'needs_login' || status === 'degraded' || lastError) return 'error';

  if (!snap) {
    return status === 'online' ? 'idle' : 'offline';
  }

  const missionType = String(snap.mission?.missionType || '').toLowerCase();
  if (missionType.includes('campaign')) return 'campaign';

  const publishPhase = String(snap.publish?.phase || '').toLowerCase();
  if (
    publishPhase &&
    !['idle', 'none', 'null', ''].includes(publishPhase)
  ) {
    return 'publishing';
  }
  if (missionType.includes('publish')) return 'publishing';

  const step = String(snap.jobs.currentStep || '').toLowerCase();
  if (
    snap.jobs.running > 0 &&
    (step.includes('scan') ||
      missionType.includes('scan') ||
      Boolean(snap.scanner?.currentSource || snap.scanner?.currentGroup))
  ) {
    return 'scanning';
  }

  const browserBusy = snap.browserProfiles.some(p => p.busy);
  if (browserBusy) return 'browser_hold';

  if (snap.jobs.running > 0) return 'busy';
  return 'idle';
}

function resolveSnapshot(
  agentId: string,
  meta: Record<string, unknown>,
  currentUrl: string | null,
  status: string,
  heartbeatAt: string | null,
): ExecutionAgentRuntimeSnapshot | null {
  const warm = getLastAgentSnapshot(agentId);
  if (warm) return warm;
  if (!Object.keys(meta).length) return null;
  return normalizeRuntimeSnapshot({
    agentId,
    metadata: meta,
    currentUrl,
    status,
    heartbeatAt: heartbeatAt || undefined,
  });
}

export function enrichFleetAgent(
  node: AgentNode,
  session?: BrowserSession | null,
): FleetAgent {
  const meta = session ? asRecord(session.metadata) : {};
  const hostRec = asRecord(meta.host);
  const snap = resolveSnapshot(
    node.agentId,
    meta,
    node.currentUrl,
    node.status,
    node.heartbeatAt,
  );

  const hostname =
    snap?.hostname ||
    str(hostRec.hostname) ||
    str(meta.hostname) ||
    node.hostname;

  const platform =
    snap?.platform ||
    str(hostRec.platform) ||
    str(meta.platform) ||
    'unknown';

  const displayName =
    str(meta.displayName) ||
    str(meta.sessionName) ||
    (session?.name && session.name !== `Execution Agent (${node.agentId})`
      ? session.name
      : null) ||
    node.agentId;

  const machineId =
    str(meta.machineId) || hostname || node.agentId;

  const tags = parseTags(meta.tags);
  const activity = deriveActivity(node.status, snap, node.lastError);

  return {
    agentId: node.agentId,
    displayName,
    hostname,
    machineId,
    platform,
    version: snap?.version || node.version,
    tags,
    capabilities: node.capabilities,
    status: node.status,
    activity,
    lastHeartbeat: node.heartbeatAt,
    heartbeatAgeMs: node.heartbeatAgeMs,
    uptimeSec: snap?.uptimeSec ?? node.metrics.uptimeSec,
    companyId: node.companyId,
    sessionId: node.sessionId,
    workerId: node.workerId,
    cpuLoad1m: snap?.host.loadAvg1m ?? null,
    memFreeMb: snap?.host.memFreeMb ?? null,
    memTotalMb: snap?.host.memTotalMb ?? null,
    rssMb: snap?.process.rssMb ?? node.metrics.rssMb,
    heapUsedMb: snap?.process.heapUsedMb ?? node.metrics.heapUsedMb,
    chromeCount: snap?.chromeCount ?? node.browserPool.length,
    executionSlots: snap?.executionSlots.length ?? node.executionSlots.length,
    jobs: snap?.jobs || { running: 0, waiting: 0, owners: [] },
    mission: snap?.mission || null,
    scanner: snap?.scanner || null,
    publish: snap?.publish || null,
    browserProfiles: snap?.browserProfiles || [],
    currentUrl: snap?.currentUrl ?? node.currentUrl,
    lastError: node.lastError,
    snapshot: snap,
  };
}

export async function listFleetAgents(input?: {
  companyId?: string | null;
  onlineOnly?: boolean;
}): Promise<FleetAgent[]> {
  const nodes = await listRegisteredAgents({
    companyId: input?.companyId,
    onlineOnly: input?.onlineOnly,
  });
  if (nodes.length === 0) return [];

  const sessions = await prisma.browserSession.findMany({
    where: {
      id: { in: nodes.map(n => n.sessionId) },
    },
  });
  const bySession = new Map(sessions.map(s => [s.id, s]));

  return nodes.map(n => enrichFleetAgent(n, bySession.get(n.sessionId) || null));
}

export async function getFleetAgent(idOrMachine: string): Promise<FleetAgent | null> {
  const key = idOrMachine.trim();
  if (!key) return null;
  const agents = await listFleetAgents();
  return (
    agents.find(
      a =>
        a.agentId === key ||
        a.workerId === key ||
        a.machineId === key ||
        a.hostname === key ||
        a.displayName.toLowerCase() === key.toLowerCase(),
    ) || null
  );
}

/** Rebuild FleetAgent from a raw session (tests / internal). */
export function fleetAgentFromSession(session: BrowserSession, now = Date.now()): FleetAgent {
  return enrichFleetAgent(sessionToAgentNode(session, now), session);
}

export function listFleetBrowsers(agents: FleetAgent[]): FleetBrowserRow[] {
  const rows: FleetBrowserRow[] = [];
  for (const a of agents) {
    for (const p of a.browserProfiles) {
      rows.push({
        agentId: a.agentId,
        hostname: a.hostname,
        machineId: a.machineId,
        profile: p.profile,
        facebookAccount: p.facebookAccount || null,
        busy: p.busy,
        currentUrl: p.currentUrl || null,
        lockedBy: p.lockedBy || null,
        state: p.state,
      });
    }
  }
  return rows;
}
