/**
 * Placement Engine (G2) — score job × agent for soft assignment.
 * Pure scoring; Assignment Planner decides claim order.
 */

import type { FleetAgent } from '../fleet/types';
import {
  agentHasCapabilities,
  deriveBrowserCapabilities,
  extractJobRequirements,
  jobTypePriorityBoost,
  matchBrowserRequirements,
} from './capabilityMatcher';
import {
  effectivePolicyMode,
  getMachinePolicy,
  isMachineDraining,
  isMachineInMaintenance,
} from './policies';
import { getReservation, isJobInCooldown, isReservedForOther } from './reservationStore';
import type {
  JobRequirements,
  PlacementCandidateScore,
  PlacementScoreBreakdown,
} from './types';

export type PlacementJobInput = {
  id: string;
  type: string;
  priority?: number | null;
  sourceId?: string | null;
  missionId?: string | null;
  attempts?: number | null;
  payload?: unknown;
};

function emptyBreakdown(): PlacementScoreBreakdown {
  return {
    capability: 0,
    browser: 0,
    load: 0,
    affinity: 0,
    priority: 0,
    policy: 0,
    total: 0,
  };
}

function loadPenalty(agent: FleetAgent): { score: number; reason: string } {
  const slots = Math.max(1, agent.executionSlots || 1);
  const ratio = agent.jobs.running / slots;
  let score = 40 - ratio * 35;
  if (agent.cpuLoad1m != null) score -= Math.min(20, agent.cpuLoad1m * 6);
  if (agent.memFreeMb != null && agent.memTotalMb != null && agent.memTotalMb > 0) {
    const usedPct = ((agent.memTotalMb - agent.memFreeMb) / agent.memTotalMb) * 100;
    score -= usedPct * 0.1;
  }
  if (agent.activity === 'idle') score += 10;
  return { score, reason: `load=${ratio.toFixed(2)}` };
}

/**
 * Score how well `agent` fits `job`. Higher = better.
 * Hard rejects set eligible=false.
 */
export function scoreJobForAgent(
  job: PlacementJobInput,
  agent: FleetAgent,
  opts?: { fleetLoadMax?: number },
): PlacementCandidateScore {
  const reasons: string[] = [];
  const breakdown = emptyBreakdown();
  const req = extractJobRequirements(job);

  if (isMachineInMaintenance({
    machineId: agent.machineId,
    agentId: agent.agentId,
    hostname: agent.hostname,
  })) {
    return reject(job, agent, 'maintenance');
  }
  if (isMachineDraining({
    machineId: agent.machineId,
    agentId: agent.agentId,
    hostname: agent.hostname,
  })) {
    return reject(job, agent, 'drain');
  }
  if (isJobInCooldown(job.id)) {
    return reject(job, agent, 'cooldown');
  }
  if (isReservedForOther(job.id, agent.agentId)) {
    const r = getReservation(job.id);
    return reject(job, agent, `reserved_for_${r?.agentId || 'other'}`);
  }

  // Pin: job pinned to another machine
  if (req.pinMachineId) {
    const pinOk =
      agent.machineId === req.pinMachineId ||
      agent.agentId === req.pinMachineId ||
      agent.hostname.toLowerCase() === req.pinMachineId.toLowerCase();
    if (!pinOk) return reject(job, agent, 'pin_mismatch');
    breakdown.affinity += 40;
    reasons.push('pin_match');
  }

  const policy = getMachinePolicy({
    machineId: agent.machineId,
    agentId: agent.agentId,
    hostname: agent.hostname,
  });
  if (policy?.mode === 'manual_pin') {
    if (job.missionId && policy.pinnedMissionIds.includes(job.missionId)) {
      breakdown.affinity += 25;
      reasons.push('pinned_mission');
    }
    if (job.sourceId && policy.pinnedSourceIds.includes(job.sourceId)) {
      breakdown.affinity += 25;
      reasons.push('pinned_source');
    }
  }

  const cap = agentHasCapabilities(agent.capabilities, req.requiredCapabilities);
  if (!cap.ok) {
    return reject(job, agent, `missing_caps:${cap.missing.join(',')}`);
  }
  breakdown.capability = 30;
  reasons.push('caps_ok');
  for (const pref of req.preferredCapabilities) {
    if (agent.capabilities.map(c => c.toLowerCase()).includes(pref.toLowerCase())) {
      breakdown.capability += 5;
      reasons.push(`prefer_cap=${pref}`);
    }
  }

  const browsers = deriveBrowserCapabilities(agent);
  const browserMatch = matchBrowserRequirements(browsers, req);
  if (!browserMatch.ok) {
    return reject(job, agent, browserMatch.reason);
  }
  breakdown.browser = browserMatch.score;
  reasons.push(browserMatch.reason);

  const load = loadPenalty(agent);
  breakdown.load = load.score;
  reasons.push(load.reason);

  // Affinity: sticky source / last agent
  if (
    req.affinityAgentId &&
    (agent.agentId === req.affinityAgentId || agent.workerId === req.affinityAgentId)
  ) {
    breakdown.affinity += 35;
    reasons.push('affinity_agent');
  }
  if (
    req.affinityHostname &&
    agent.hostname.toLowerCase() === req.affinityHostname.toLowerCase()
  ) {
    breakdown.affinity += 25;
    reasons.push('affinity_host');
  }

  // Priority: job.priority lower number = more urgent in queue; boost publish
  const urgency = Math.max(0, 20 - (req.priority || 5) * 2);
  breakdown.priority = urgency + jobTypePriorityBoost(job.type);
  if ((job.attempts ?? 0) > 0) {
    breakdown.priority += 8; // retries get a bump once off cooldown
    reasons.push('retry');
  }
  reasons.push(`priority=${breakdown.priority}`);

  // Policy mode adjustments
  const mode = effectivePolicyMode({
    machineId: agent.machineId,
    agentId: agent.agentId,
    hostname: agent.hostname,
  });
  if (mode === 'spread') {
    breakdown.policy = (opts?.fleetLoadMax ?? 1) > 0 && agent.jobs.running === 0 ? 12 : 0;
    reasons.push('policy=spread');
  } else if (mode === 'pack') {
    breakdown.policy = agent.jobs.running > 0 ? 10 : -5;
    reasons.push('policy=pack');
  } else if (mode === 'affinity') {
    breakdown.policy = breakdown.affinity > 0 ? 15 : -5;
    reasons.push('policy=affinity');
  } else if (mode === 'energy_saving') {
    breakdown.policy = agent.jobs.running > 0 ? 8 : -15;
    reasons.push('policy=energy');
  } else {
    reasons.push(`policy=${mode}`);
  }

  // Soft reservation for self
  const mine = getReservation(job.id);
  if (mine && mine.agentId === agent.agentId) {
    breakdown.affinity += 20;
    reasons.push('reservation_self');
  }

  breakdown.total =
    breakdown.capability +
    breakdown.browser +
    breakdown.load +
    breakdown.affinity +
    breakdown.priority +
    breakdown.policy;

  return {
    jobId: job.id,
    jobType: job.type,
    agentId: agent.agentId,
    score: breakdown.total,
    breakdown,
    eligible: true,
    rejectReason: null,
    reasons,
  };
}

function reject(
  job: PlacementJobInput,
  agent: FleetAgent,
  reason: string,
): PlacementCandidateScore {
  return {
    jobId: job.id,
    jobType: job.type,
    agentId: agent.agentId,
    score: -Infinity,
    breakdown: emptyBreakdown(),
    eligible: false,
    rejectReason: reason,
    reasons: [reason],
  };
}

export function requirementsSummary(job: PlacementJobInput): JobRequirements {
  return extractJobRequirements(job);
}
