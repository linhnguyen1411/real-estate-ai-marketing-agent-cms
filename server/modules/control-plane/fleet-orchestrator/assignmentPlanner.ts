/**
 * Assignment Planner (G2) — pick best job for a polling agent (soft assignment).
 */

import type { FleetAgent } from '../fleet/types';
import { getDefaultFleetPolicy } from './policies';
import {
  scoreJobForAgent,
  type PlacementJobInput,
} from './placementEngine';
import { reserveJob } from './reservationStore';
import type { PlacementCandidateScore, PlacementDecision } from './types';

const recentDecisions: PlacementDecision[] = [];
const MAX_DECISIONS = 200;

let stats = {
  assignments: 0,
  rejections: 0,
};

export function getPlannerStats() {
  return { ...stats };
}

export function listPlacementDecisions(limit = 40): PlacementDecision[] {
  return recentDecisions.slice(0, Math.max(1, Math.min(limit, MAX_DECISIONS)));
}

function pushDecision(d: PlacementDecision): void {
  recentDecisions.unshift(d);
  if (recentDecisions.length > MAX_DECISIONS) recentDecisions.length = MAX_DECISIONS;
}

export type PlanClaimInput = {
  agent: FleetAgent | null;
  agentId: string;
  candidates: PlacementJobInput[];
  /** Anti-steal: skip job if another idle agent would score this much higher. */
  antiStealMargin?: number;
  fleet?: FleetAgent[];
  reserve?: boolean;
};

export type PlanClaimResult = {
  jobId: string | null;
  decision: PlacementDecision;
  scores: PlacementCandidateScore[];
};

/**
 * Soft assignment: among SKIP LOCKED candidates, pick the best job for this agent.
 * Does not push — caller still claims via queue UPDATE.
 */
export function planClaimForAgent(input: PlanClaimInput): PlanClaimResult {
  const antiSteal = input.antiStealMargin ?? 18;
  const scores: PlacementCandidateScore[] = [];
  const rejected: PlacementDecision['rejected'] = [];

  if (!input.agent) {
    // No fleet snapshot — fall back to first candidate (legacy behavior)
    const first = input.candidates[0] ?? null;
    const decision: PlacementDecision = {
      id: `pd_${Date.now()}`,
      at: new Date().toISOString(),
      agentId: input.agentId,
      jobId: first?.id ?? null,
      jobType: first?.type ?? null,
      chosen: Boolean(first),
      score: null,
      breakdown: null,
      reasons: ['no_fleet_snapshot_fallback'],
      rejected: [],
      policyMode: getDefaultFleetPolicy(),
    };
    if (first) {
      stats.assignments += 1;
      pushDecision(decision);
      return { jobId: first.id, decision, scores };
    }
    stats.rejections += 1;
    pushDecision(decision);
    return { jobId: null, decision, scores };
  }

  const fleetLoadMax = Math.max(0, ...(input.fleet || []).map(a => a.jobs.running));

  for (const job of input.candidates) {
    const s = scoreJobForAgent(job, input.agent, { fleetLoadMax });
    scores.push(s);
    if (!s.eligible) {
      rejected.push({ jobId: job.id, reason: s.rejectReason || 'ineligible', score: s.score });
      continue;
    }

    // Anti-hotspot / anti-steal: leave high-value jobs for clearly better idle agents
    if (input.fleet && input.fleet.length > 1) {
      let bestOther = -Infinity;
      for (const other of input.fleet) {
        if (other.agentId === input.agent.agentId) continue;
        if (other.status !== 'online' && other.status !== 'degraded') continue;
        const os = scoreJobForAgent(job, other, { fleetLoadMax });
        if (os.eligible && os.score > bestOther) bestOther = os.score;
      }
      if (bestOther - s.score > antiSteal && input.agent.jobs.running > 0) {
        rejected.push({
          jobId: job.id,
          reason: `anti_steal_better_agent(+${Math.round(bestOther - s.score)})`,
          score: s.score,
        });
        s.eligible = false;
        s.rejectReason = 'anti_steal';
        continue;
      }
    }
  }

  const eligible = scores.filter(s => s.eligible).sort((a, b) => b.score - a.score);
  const best = eligible[0] ?? null;

  const decision: PlacementDecision = {
    id: `pd_${Date.now()}_${input.agentId}`,
    at: new Date().toISOString(),
    agentId: input.agentId,
    jobId: best?.jobId ?? null,
    jobType: best?.jobType ?? null,
    chosen: Boolean(best),
    score: best?.score ?? null,
    breakdown: best?.breakdown ?? null,
    reasons: best?.reasons ?? ['no_eligible_job'],
    rejected,
    policyMode: getDefaultFleetPolicy(),
  };

  if (best) {
    stats.assignments += 1;
    if (input.reserve !== false) {
      reserveJob({
        jobId: best.jobId,
        agentId: input.agentId,
        reason: 'claim_plan',
      });
    }
  } else {
    stats.rejections += 1;
  }

  pushDecision(decision);
  return { jobId: best?.jobId ?? null, decision, scores };
}

export function resetPlannerForTests(): void {
  recentDecisions.length = 0;
  stats = { assignments: 0, rejections: 0 };
}
