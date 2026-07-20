/**
 * Telemetry Collector — ingest heartbeat snapshots (no duplicate heartbeat events).
 * Snapshot store is in-memory + last snapshot mirrored under metadata.telemetry.
 */

import { normalizeRuntimeSnapshot } from './normalize';
import type { ExecutionAgentRuntimeSnapshot, TelemetryRemoteCommand } from './types';

const lastSnapshots = new Map<string, ExecutionAgentRuntimeSnapshot>();
const pendingCommands = new Map<string, TelemetryRemoteCommand[]>();

export function resetTelemetryCollectorForTests(): void {
  lastSnapshots.clear();
  pendingCommands.clear();
}

export function ingestAgentHeartbeat(input: {
  agentId: string;
  metadata?: Record<string, unknown> | null;
  currentUrl?: string | null;
  status?: string;
  heartbeatAt?: string;
  companyId?: string | null;
}): ExecutionAgentRuntimeSnapshot {
  const snapshot = normalizeRuntimeSnapshot({
    agentId: input.agentId,
    metadata: input.metadata || {},
    currentUrl: input.currentUrl,
    heartbeatAt: input.heartbeatAt,
    status: input.status,
  });
  lastSnapshots.set(input.agentId, snapshot);
  // Throttled Operations Metrics refresh (event-driven, not continuous poll).
  void import('../operations')
    .then(m =>
      m.notifyMetricsEvent({
        reason: 'heartbeat',
        companyId: input.companyId ?? null,
      }),
    )
    .catch(() => undefined);
  return snapshot;
}

export function getLastAgentSnapshot(agentId: string): ExecutionAgentRuntimeSnapshot | null {
  return lastSnapshots.get(agentId) || null;
}

export function listAgentSnapshots(): ExecutionAgentRuntimeSnapshot[] {
  return [...lastSnapshots.values()];
}

export function enqueueRemoteCommand(input: {
  agentId: string;
  action: string;
  payload?: Record<string, unknown>;
}): TelemetryRemoteCommand {
  const cmd: TelemetryRemoteCommand = {
    id: `ops_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: input.action,
    requestedAt: new Date().toISOString(),
    payload: input.payload,
  };
  const list = pendingCommands.get(input.agentId) || [];
  list.push(cmd);
  // Cap queue to avoid unbounded growth if agent offline
  pendingCommands.set(input.agentId, list.slice(-20));
  return cmd;
}

/** Drain pending OPS commands for delivery on next heartbeat response. */
export function drainRemoteCommands(agentId: string): TelemetryRemoteCommand[] {
  const list = pendingCommands.get(agentId) || [];
  pendingCommands.delete(agentId);
  return list;
}

export function peekRemoteCommands(agentId: string): TelemetryRemoteCommand[] {
  return [...(pendingCommands.get(agentId) || [])];
}
