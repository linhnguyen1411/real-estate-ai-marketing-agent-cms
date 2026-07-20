/**
 * Fleet Scheduler — placement strategy over Fleet Registry (not a new job queue).
 * Ranking: capabilities → tags → priority/load → CPU → RAM → browser availability.
 */

import type { AgentCapability } from '../types';
import type { FleetAgent } from './types';

export type FleetScheduleRequest = {
  require?: AgentCapability[];
  /** Prefer agents that have ALL of these tags. */
  requireTags?: string[];
  /** Soft preference: score boost per matching tag. */
  preferTags?: string[];
  preferredAgentId?: string | null;
  preferredHostname?: string | null;
  /** Prefer agents with at least one free browser profile. */
  requireBrowserFree?: boolean;
  maxCpuLoad1m?: number;
  minMemFreeMb?: number;
  /** Higher priority workloads prefer less-loaded machines harder. */
  priority?: number;
};

export type FleetScheduleScore = {
  agent: FleetAgent;
  score: number;
  reasons: string[];
};

function normTag(t: string): string {
  return t.trim().toLowerCase();
}

function isSchedulable(a: FleetAgent): boolean {
  if (a.status === 'offline' || a.status === 'starting') return false;
  if (a.activity === 'offline' || a.activity === 'error') return false;
  return a.status === 'online' || a.status === 'degraded';
}

function loadRatio(a: FleetAgent): number {
  const slots = Math.max(1, a.executionSlots || 1);
  return a.jobs.running / slots;
}

function ramUsedPct(a: FleetAgent): number | null {
  if (a.memTotalMb == null || a.memTotalMb <= 0 || a.memFreeMb == null) return null;
  return Math.max(0, Math.min(100, ((a.memTotalMb - a.memFreeMb) / a.memTotalMb) * 100));
}

function browserFreeCount(a: FleetAgent): number {
  return a.browserProfiles.filter(p => !p.busy && p.state !== 'leased').length;
}

/**
 * Score eligible fleet agents. Higher score = better placement.
 * Pure function — Strategy pattern; does not claim jobs or touch queues.
 */
export function scoreFleetAgents(
  agents: FleetAgent[],
  req: FleetScheduleRequest = {},
): FleetScheduleScore[] {
  const required = req.require ?? [];
  const requireTags = (req.requireTags ?? []).map(normTag);
  const preferTags = (req.preferTags ?? []).map(normTag);
  const priority = req.priority ?? 5;
  const loadWeight = 10 + Math.max(0, Math.min(10, priority));

  const scored: FleetScheduleScore[] = [];

  for (const agent of agents) {
    const reasons: string[] = [];
    if (!isSchedulable(agent)) continue;

    if (required.length && !required.every(c => agent.capabilities.includes(c))) {
      continue;
    }
    reasons.push('caps_ok');

    const tags = agent.tags.map(normTag);
    if (requireTags.length && !requireTags.every(t => tags.includes(t))) {
      continue;
    }
    if (requireTags.length) reasons.push('tags_required');

    if (req.requireBrowserFree && browserFreeCount(agent) === 0) {
      continue;
    }

    if (req.maxCpuLoad1m != null && agent.cpuLoad1m != null && agent.cpuLoad1m > req.maxCpuLoad1m) {
      continue;
    }
    if (req.minMemFreeMb != null && agent.memFreeMb != null && agent.memFreeMb < req.minMemFreeMb) {
      continue;
    }

    let score = 100;
    score -= loadRatio(agent) * loadWeight;
    reasons.push(`load=${loadRatio(agent).toFixed(2)}`);

    if (agent.cpuLoad1m != null) {
      score -= Math.min(30, agent.cpuLoad1m * 8);
      reasons.push(`cpu=${agent.cpuLoad1m}`);
    }

    const ramPct = ramUsedPct(agent);
    if (ramPct != null) {
      score -= ramPct * 0.15;
      reasons.push(`ramUsed=${Math.round(ramPct)}%`);
    }

    const freeBrowsers = browserFreeCount(agent);
    score += Math.min(15, freeBrowsers * 5);
    if (freeBrowsers > 0) reasons.push(`browserFree=${freeBrowsers}`);

    if (agent.activity === 'idle') {
      score += 12;
      reasons.push('idle');
    } else if (agent.activity === 'busy' || agent.activity === 'scanning') {
      score -= 8;
    }

    for (const t of preferTags) {
      if (tags.includes(t)) {
        score += 8;
        reasons.push(`preferTag=${t}`);
      }
    }

    if (req.preferredAgentId) {
      if (
        agent.agentId === req.preferredAgentId ||
        agent.workerId === req.preferredAgentId
      ) {
        score += 50;
        reasons.push('preferred_id');
      }
    }
    if (
      req.preferredHostname &&
      agent.hostname.toLowerCase() === req.preferredHostname.toLowerCase()
    ) {
      score += 40;
      reasons.push('preferred_host');
    }

    if (agent.heartbeatAgeMs != null) {
      score -= Math.min(20, agent.heartbeatAgeMs / 5000);
    }

    scored.push({ agent, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score);
}

/** Pick best agent for a workload (fleet-aware). Returns null if none eligible. */
export function scheduleFleetAgent(
  agents: FleetAgent[],
  req: FleetScheduleRequest = {},
): FleetAgent | null {
  const ranked = scoreFleetAgents(agents, req);
  return ranked[0]?.agent ?? null;
}

/** Suggest targetAgentId for enqueue affinity (does not mutate queue). */
export function suggestTargetAgentId(
  agents: FleetAgent[],
  req: FleetScheduleRequest = {},
): string | null {
  const pick = scheduleFleetAgent(agents, req);
  return pick?.agentId ?? pick?.workerId ?? null;
}
