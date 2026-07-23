/**
 * Fleet Orchestrator facade (G2) — claim-time soft placement entrypoint.
 */

import { listFleetAgents, getFleetAgent } from '../fleet/registry';
import {
  listPlacementDecisions,
  planClaimForAgent,
  getPlannerStats,
  resetPlannerForTests,
  type PlanClaimResult,
} from './assignmentPlanner';
import type { PlacementJobInput } from './placementEngine';
import {
  getDefaultFleetPolicy,
  listMachinePolicies,
  resetFleetPoliciesForTests,
  setDefaultFleetPolicy,
  upsertMachinePolicy,
  pinToMachine,
  isMachineDraining,
  isMachineInMaintenance,
} from './policies';
import {
  clearJobCooldown,
  getOrchestratorStoreStats,
  listCooldowns,
  listReservations,
  markFailover,
  recordJobFailureCooldown,
  releaseReservation,
  resetReservationStoreForTests,
} from './reservationStore';
import type { FleetPolicyMode, OrchestratorSnapshot, PlacementDecision } from './types';
import { emitRuntimeEventAsync } from '../runtimeEventBus';

export async function resolveClaimingAgent(agentId: string) {
  const direct = await getFleetAgent(agentId);
  if (direct) return direct;
  const all = await listFleetAgents({});
  return (
    all.find(a => a.agentId === agentId || a.workerId === agentId || a.hostname === agentId) ||
    null
  );
}

/**
 * Select best job id for this polling agent among SKIP LOCKED candidates.
 * Returns null → claimer claims nothing this tick.
 */
export async function selectJobForClaim(input: {
  agentId: string;
  candidates: PlacementJobInput[];
  companyId?: string | null;
}): Promise<PlanClaimResult> {
  if (input.candidates.length === 0) {
    return {
      jobId: null,
      decision: {
        id: `pd_empty_${Date.now()}`,
        at: new Date().toISOString(),
        agentId: input.agentId,
        jobId: null,
        jobType: null,
        chosen: false,
        score: null,
        breakdown: null,
        reasons: ['empty_candidates'],
        rejected: [],
        policyMode: getDefaultFleetPolicy(),
      },
      scores: [],
    };
  }

  // Fast path: drain/maintenance before scoring
  if (
    isMachineDraining({ agentId: input.agentId }) ||
    isMachineInMaintenance({ agentId: input.agentId })
  ) {
    const decision: PlacementDecision = {
      id: `pd_blocked_${Date.now()}`,
      at: new Date().toISOString(),
      agentId: input.agentId,
      jobId: null,
      jobType: null,
      chosen: false,
      score: null,
      breakdown: null,
      reasons: [
        isMachineDraining({ agentId: input.agentId }) ? 'drain' : 'maintenance',
      ],
      rejected: input.candidates.map(c => ({
        jobId: c.id,
        reason: isMachineDraining({ agentId: input.agentId }) ? 'drain' : 'maintenance',
      })),
      policyMode: getDefaultFleetPolicy(),
    };
    return { jobId: null, decision, scores: [] };
  }

  let agent = null;
  let fleet: Awaited<ReturnType<typeof listFleetAgents>> = [];
  try {
    fleet = await listFleetAgents({ companyId: input.companyId ?? undefined });
    agent =
      fleet.find(a => a.agentId === input.agentId || a.workerId === input.agentId) ||
      (await resolveClaimingAgent(input.agentId));
  } catch {
    agent = null;
    fleet = [];
  }

  const result = planClaimForAgent({
    agent,
    agentId: input.agentId,
    candidates: input.candidates,
    fleet,
    reserve: true,
  });

  return result;
}

export function onClaimSuccess(jobId: string): void {
  releaseReservation(jobId);
  clearJobCooldown(jobId);
}

export function onClaimRejection(input: {
  jobId: string;
  agentId: string;
  reason: string;
}): void {
  releaseReservation(input.jobId);
  emitRuntimeEventAsync({
    type: 'OPS_REQUEST',
    agentId: input.agentId,
    entityType: 'placement',
    entityId: input.jobId,
    payload: {
      action: 'placement_rejected',
      reason: input.reason,
      at: new Date().toISOString(),
    },
  });
}

export function onJobFailedForCooldown(jobId: string, errorMessage?: string): void {
  recordJobFailureCooldown(jobId, errorMessage?.slice(0, 120));
}

export function onAgentOfflineFailover(agentId: string): void {
  markFailover();
  for (const r of listReservations()) {
    if (r.agentId === agentId) releaseReservation(r.jobId);
  }
}

export function getOrchestratorSnapshot(): OrchestratorSnapshot {
  const store = getOrchestratorStoreStats();
  const planner = getPlannerStats();
  return {
    generatedAt: new Date().toISOString(),
    policyDefault: getDefaultFleetPolicy(),
    machines: listMachinePolicies(),
    reservations: listReservations(),
    cooldowns: listCooldowns(),
    recentDecisions: listPlacementDecisions(30),
    stats: {
      assignments: planner.assignments,
      rejections: planner.rejections,
      reassigns: store.reassigns,
      failovers: store.failovers,
      reservationsExpired: store.reservationsExpired,
    },
  };
}

export function setFleetPolicyMode(mode: FleetPolicyMode): void {
  setDefaultFleetPolicy(mode);
}

export function setAgentDrain(input: {
  machineId: string;
  agentId?: string | null;
  hostname?: string | null;
  drain: boolean;
}) {
  return upsertMachinePolicy({
    machineId: input.machineId,
    agentId: input.agentId,
    hostname: input.hostname,
    mode: input.drain ? 'drain' : 'normal',
  });
}

export function setAgentMaintenance(input: {
  machineId: string;
  agentId?: string | null;
  hostname?: string | null;
  maintenance: boolean;
}) {
  return upsertMachinePolicy({
    machineId: input.machineId,
    agentId: input.agentId,
    hostname: input.hostname,
    mode: input.maintenance ? 'maintenance' : 'normal',
  });
}

export { pinToMachine };

export function resetOrchestratorForTests(): void {
  resetPlannerForTests();
  resetReservationStoreForTests();
  resetFleetPoliciesForTests();
}
