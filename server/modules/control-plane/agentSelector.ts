/**
 * Multi-agent selection prep — Execution Pool chooses a suitable Agent.
 * Does not change default global claim unless job targets an agent.
 */

import type { AgentCapability, AgentNode } from './types';

export type AgentSelectionRequest = {
  /** Required capabilities (all must match). */
  require?: AgentCapability[];
  /** Prefer this agentId / workerId when online. */
  preferredAgentId?: string | null;
  /** Prefer local hostname match. */
  preferredHostname?: string | null;
};

/**
 * Pick the best online agent for a workload.
 * Pure function — used by Control Plane / future affinity enqueue.
 */
export function selectAgent(
  agents: AgentNode[],
  req: AgentSelectionRequest = {},
): AgentNode | null {
  const online = agents.filter(a => a.status === 'online');
  if (online.length === 0) return null;

  const required = req.require ?? [];
  const eligible = online.filter(a =>
    required.every(cap => a.capabilities.includes(cap)),
  );
  if (eligible.length === 0) return null;

  if (req.preferredAgentId) {
    const hit = eligible.find(
      a => a.agentId === req.preferredAgentId || a.workerId === req.preferredAgentId,
    );
    if (hit) return hit;
  }

  if (req.preferredHostname) {
    const hit = eligible.find(
      a => a.hostname.toLowerCase() === req.preferredHostname!.toLowerCase(),
    );
    if (hit) return hit;
  }

  // Prefer lowest slot utilization, then freshest heartbeat
  return [...eligible].sort((a, b) => {
    const ua = a.metrics.slotUtilization ?? 0;
    const ub = b.metrics.slotUtilization ?? 0;
    if (ua !== ub) return ua - ub;
    return (a.heartbeatAgeMs ?? 999999) - (b.heartbeatAgeMs ?? 999999);
  })[0]!;
}

/** Environments supported conceptually by Control Plane (docs / affinity tags). */
export const AGENT_ENVIRONMENTS = [
  'local_pc',
  'mini_pc',
  'vps',
  'cloud_desktop',
] as const;

export type AgentEnvironment = (typeof AGENT_ENVIRONMENTS)[number];
