/**
 * Agent Registry — Execution Nodes.
 * Façade over BrowserSession + heartbeat metadata. No new worker process.
 */

import os from 'os';
import type { BrowserSession } from '@prisma/client';
import { prisma } from '../../prisma';
import type { AgentCapability, AgentNode, AgentNodeStatus } from './types';

const STALE_MS = 45_000;
const CONTROL_PLANE_VERSION =
  process.env.AGENT_CONTROL_PLANE_VERSION?.trim() ||
  process.env.npm_package_version ||
  '0.0.0';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function deriveStatus(session: BrowserSession, ageMs: number | null): AgentNodeStatus {
  if (session.status === 'needs_login') return 'needs_login';
  if (session.status === 'starting') return 'starting';
  if (session.status === 'offline' || session.status === 'error') return 'offline';
  if (ageMs == null || ageMs > STALE_MS) return 'offline';
  if (session.lastError) return 'degraded';
  return 'online';
}

function defaultCapabilities(meta: Record<string, unknown>): AgentCapability[] {
  const fromMeta = meta.capabilities;
  if (Array.isArray(fromMeta) && fromMeta.every(x => typeof x === 'string')) {
    return fromMeta as AgentCapability[];
  }
  const caps: AgentCapability[] = ['scan', 'publish', 'browser'];
  if (meta.mode === 'cdp') caps.push('cdp');
  const slots = asArray(meta.executionPool);
  for (const raw of slots) {
    const s = asRecord(raw);
    const kind = String(s.kind || '');
    const max = Number(s.maxConcurrency) || 0;
    if (kind === 'messaging' && max > 0) caps.push('messaging');
    if (kind === 'comment' && max > 0) caps.push('comment');
  }
  return [...new Set(caps)];
}

function utilFromSlots(slots: unknown[]): number | null {
  let used = 0;
  let cap = 0;
  for (const raw of slots) {
    const s = asRecord(raw);
    const max = Number(s.maxConcurrency) || 0;
    const run = Number(s.runningJobs) || 0;
    if (max > 0) {
      cap += max;
      used += run;
    }
  }
  return cap > 0 ? Math.round((used / cap) * 1000) / 10 : null;
}

function utilFromBrowsers(browsers: unknown[]): number | null {
  if (browsers.length === 0) return null;
  const leased = browsers.filter(b => asRecord(b).state === 'leased').length;
  return Math.round((leased / browsers.length) * 1000) / 10;
}

/** Map a BrowserSession row → AgentNode (Execution Node). */
export function sessionToAgentNode(session: BrowserSession, now = Date.now()): AgentNode {
  const meta = asRecord(session.metadata);
  const ageMs = session.lastHeartbeatAt
    ? now - new Date(session.lastHeartbeatAt).getTime()
    : null;
  const processMeta = asRecord(meta.process);
  const slots = asArray(meta.executionPool);
  const browsers = asArray(meta.browserPool);
  const agentId =
    (typeof meta.agentId === 'string' && meta.agentId) ||
    session.workerId ||
    session.id;
  const hostname =
    (typeof meta.hostname === 'string' && meta.hostname) ||
    (typeof meta.host === 'string' && meta.host) ||
    'unknown';
  const version =
    (typeof meta.version === 'string' && meta.version) || CONTROL_PLANE_VERSION;

  return {
    agentId,
    hostname,
    version,
    capabilities: defaultCapabilities(meta),
    status: deriveStatus(session, ageMs),
    heartbeatAt: session.lastHeartbeatAt
      ? new Date(session.lastHeartbeatAt).toISOString()
      : null,
    heartbeatAgeMs: ageMs,
    companyId: session.companyId,
    sessionId: session.id,
    workerId: session.workerId,
    executionSlots: slots,
    browserPool: browsers,
    metrics: {
      pid: typeof processMeta.pid === 'number' ? processMeta.pid : null,
      rssMb: typeof processMeta.rssMb === 'number' ? processMeta.rssMb : null,
      heapUsedMb:
        typeof processMeta.heapUsedMb === 'number' ? processMeta.heapUsedMb : null,
      uptimeSec:
        typeof processMeta.uptimeSec === 'number' ? processMeta.uptimeSec : null,
      slotUtilization: utilFromSlots(slots),
      browserUtilization: utilFromBrowsers(browsers),
    },
    currentUrl: session.currentUrl,
    lastError: session.lastError,
  };
}

export async function listRegisteredAgents(input?: {
  companyId?: string | null;
  onlineOnly?: boolean;
}): Promise<AgentNode[]> {
  const sessions = await prisma.browserSession.findMany({
    where: input?.companyId ? { companyId: input.companyId } : {},
    orderBy: { lastHeartbeatAt: 'desc' },
    take: 50,
  });
  const now = Date.now();
  const agents = sessions.map(s => sessionToAgentNode(s, now));
  if (input?.onlineOnly) return agents.filter(a => a.status === 'online');
  // Dedupe by agentId keeping freshest
  const byId = new Map<string, AgentNode>();
  for (const a of agents) {
    const prev = byId.get(a.agentId);
    if (!prev) {
      byId.set(a.agentId, a);
      continue;
    }
    const prevAge = prev.heartbeatAgeMs ?? Number.POSITIVE_INFINITY;
    const nextAge = a.heartbeatAgeMs ?? Number.POSITIVE_INFINITY;
    if (nextAge < prevAge) byId.set(a.agentId, a);
  }
  return [...byId.values()];
}

export async function getAgentById(agentId: string): Promise<AgentNode | null> {
  const agents = await listRegisteredAgents();
  return agents.find(a => a.agentId === agentId || a.workerId === agentId) ?? null;
}

/**
 * Metadata block every worker publishes on register/heartbeat.
 * Self-registration = HeartbeatService.register with this payload.
 */
export function buildAgentRegistryMetadata(input: {
  workerId: string;
  browserMode: string;
  capabilities?: AgentCapability[];
  version?: string;
}): Record<string, unknown> {
  const caps = input.capabilities ?? (['scan', 'publish', 'browser'] as AgentCapability[]);
  if (input.browserMode === 'cdp' && !caps.includes('cdp')) caps.push('cdp');
  return {
    agentId: input.workerId,
    hostname: os.hostname(),
    version: input.version ?? CONTROL_PLANE_VERSION,
    capabilities: caps,
    controlPlane: true,
    registeredAt: new Date().toISOString(),
  };
}
