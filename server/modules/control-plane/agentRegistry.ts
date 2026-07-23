/**
 * Agent Registry — Execution Nodes.
 * Façade over BrowserSession + heartbeat metadata. No new worker process.
 */

import os from 'os';
import type { BrowserSession } from '@prisma/client';
import { prisma } from '../../prisma';
import type { AgentCapability, AgentNode, AgentNodeStatus } from './types';

const STALE_MS = 45_000;
/** Offline sessions older than this are excluded from Fleet (zombie history). */
const FLEET_OFFLINE_RETENTION_MS = 30 * 60_000;
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

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

/** Ephemeral test / one-shot agents — never count as fleet machines. */
export function isEphemeralAgentId(agentId: string): boolean {
  return /^(exec-agent-test|exec-poll|pub-only)/i.test(agentId);
}

/**
 * Physical machine key for Fleet SSOT.
 * Prefer machineId → hostname → stable worker prefix (strip trailing -PID).
 */
export function resolveMachineKey(session: BrowserSession, agentId: string): string {
  const meta = asRecord(session.metadata);
  const hostRec = asRecord(meta.host);
  const machineId = str(meta.machineId);
  if (machineId) return machineId.toLowerCase();
  const hostname =
    str(meta.hostname) ||
    str(hostRec.hostname) ||
    (typeof meta.host === 'string' ? meta.host.trim() : null);
  if (hostname) return hostname.toLowerCase();
  // worker-LinhMSC-22116 → linhmsc (same physical host as hostname metadata)
  const m = agentId.match(/^worker-(.+?)(?:-\d+)?$/i);
  if (m) return m[1].toLowerCase();
  return agentId.toLowerCase();
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
    (typeof asRecord(meta.host).hostname === 'string' && String(asRecord(meta.host).hostname)) ||
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
  /** Include long-offline zombie sessions (default false — real fleet only). */
  includeStaleOffline?: boolean;
}): Promise<AgentNode[]> {
  const sessions = await prisma.browserSession.findMany({
    where: input?.companyId ? { companyId: input.companyId } : {},
    orderBy: { lastHeartbeatAt: 'desc' },
    take: 200,
  });
  const now = Date.now();

  type Ranked = { node: AgentNode; session: BrowserSession; machineKey: string };
  const ranked: Ranked[] = [];
  for (const s of sessions) {
    const node = sessionToAgentNode(s, now);
    if (isEphemeralAgentId(node.agentId)) continue;
    if (input?.onlineOnly && node.status !== 'online' && node.status !== 'degraded') {
      continue;
    }
    if (!input?.includeStaleOffline) {
      const age = node.heartbeatAgeMs;
      const offline =
        node.status === 'offline' ||
        s.status === 'offline' ||
        age == null ||
        age > STALE_MS;
      if (offline && (age == null || age > FLEET_OFFLINE_RETENTION_MS)) {
        continue;
      }
    }
    ranked.push({
      node,
      session: s,
      machineKey: resolveMachineKey(s, node.agentId),
    });
  }

  // One Execution Node per physical machine — prefer online, then freshest heartbeat.
  const byMachine = new Map<string, Ranked>();
  for (const row of ranked) {
    const prev = byMachine.get(row.machineKey);
    if (!prev) {
      byMachine.set(row.machineKey, row);
      continue;
    }
    const prevOnline =
      prev.node.status === 'online' || prev.node.status === 'degraded' ? 1 : 0;
    const nextOnline =
      row.node.status === 'online' || row.node.status === 'degraded' ? 1 : 0;
    if (nextOnline !== prevOnline) {
      if (nextOnline > prevOnline) byMachine.set(row.machineKey, row);
      continue;
    }
    const prevAge = prev.node.heartbeatAgeMs ?? Number.POSITIVE_INFINITY;
    const nextAge = row.node.heartbeatAgeMs ?? Number.POSITIVE_INFINITY;
    if (nextAge < prevAge) byMachine.set(row.machineKey, row);
  }

  return [...byMachine.values()].map(r => r.node);
}

/**
 * Mark older sessions for the same physical machine offline (PID restart cleanup).
 */
export async function retireSiblingSessions(input: {
  keepSessionId: string;
  machineId?: string | null;
  hostname?: string | null;
  workerIdPrefix?: string | null;
}): Promise<number> {
  const sessions = await prisma.browserSession.findMany({
    where: {
      id: { not: input.keepSessionId },
      status: { not: 'offline' },
    },
    select: { id: true, workerId: true, metadata: true, name: true },
    take: 200,
  });
  const machineId = input.machineId?.trim().toLowerCase() || null;
  const hostname = input.hostname?.trim().toLowerCase() || null;
  const prefix = input.workerIdPrefix?.trim().toLowerCase() || null;
  const toRetire: string[] = [];
  for (const s of sessions) {
    const meta = asRecord(s.metadata);
    const hostRec = asRecord(meta.host);
    const mid = str(meta.machineId)?.toLowerCase() || null;
    const host =
      str(meta.hostname)?.toLowerCase() ||
      str(hostRec.hostname)?.toLowerCase() ||
      null;
    const wid = (s.workerId || '').toLowerCase();
    const matchMachine = machineId && mid === machineId;
    const matchHost = hostname && (host === hostname || mid === hostname);
    const matchPrefix =
      prefix && (wid.startsWith(prefix + '-') || wid === prefix);
    if (matchMachine || matchHost || matchPrefix) toRetire.push(s.id);
  }
  if (toRetire.length === 0) return 0;
  const res = await prisma.browserSession.updateMany({
    where: { id: { in: toRetire } },
    data: {
      status: 'offline',
      lastError: 'Superseded by newer agent on same machine',
    },
  });
  return res.count;
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
  displayName?: string;
  machineId?: string;
  tags?: string[];
}): Record<string, unknown> {
  const caps = input.capabilities ?? (['scan', 'publish', 'browser'] as AgentCapability[]);
  if (input.browserMode === 'cdp' && !caps.includes('cdp')) caps.push('cdp');
  const hostname = os.hostname();
  const machineId =
    input.machineId?.trim() ||
    process.env.AGENT_MACHINE_ID?.trim() ||
    hostname;
  const displayName =
    input.displayName?.trim() ||
    process.env.AGENT_DISPLAY_NAME?.trim() ||
    hostname;
  const tags =
    input.tags ||
    String(process.env.AGENT_TAGS || '')
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  return {
    agentId: input.workerId,
    hostname,
    machineId,
    displayName,
    tags,
    version: input.version ?? CONTROL_PLANE_VERSION,
    capabilities: caps,
    controlPlane: true,
    registeredAt: new Date().toISOString(),
  };
}
