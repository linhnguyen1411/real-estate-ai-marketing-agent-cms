/**
 * H0.4 — Job ownership fields on soft assignment (payload only, no schema change).
 */

export const JOB_OWNERSHIP_LEASE_MS = 45_000;

export type PlannerDecisionSnapshot = {
  score: number | null;
  reasons: string[];
  policyMode?: string;
  rejectedCount?: number;
  breakdown?: Record<string, number> | null;
  at: string;
};

export type JobOwnershipPayload = {
  ownerMachine: string | null;
  ownerAgent: string;
  leaseUntil: string;
  plannerDecision: PlannerDecisionSnapshot;
  targetAgentId: string;
};

export function buildJobOwnership(input: {
  agentId: string;
  machineId?: string | null;
  hostname?: string | null;
  decision: {
    score: number | null;
    reasons: string[];
    policyMode?: string;
    rejected?: unknown[];
    breakdown?: Record<string, number> | null;
  };
  leaseMs?: number;
  now?: number;
}): JobOwnershipPayload {
  const now = input.now ?? Date.now();
  return {
    ownerMachine: input.machineId || input.hostname || null,
    ownerAgent: input.agentId,
    leaseUntil: new Date(now + (input.leaseMs ?? JOB_OWNERSHIP_LEASE_MS)).toISOString(),
    plannerDecision: {
      score: input.decision.score,
      reasons: (input.decision.reasons || []).slice(0, 16),
      policyMode: input.decision.policyMode,
      rejectedCount: Array.isArray(input.decision.rejected)
        ? input.decision.rejected.length
        : undefined,
      breakdown: input.decision.breakdown ?? null,
      at: new Date(now).toISOString(),
    },
    targetAgentId: input.agentId,
  };
}

export function mergeOwnershipIntoPayload(
  existing: unknown,
  ownership: JobOwnershipPayload,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return {
    ...base,
    ownerMachine: ownership.ownerMachine,
    ownerAgent: ownership.ownerAgent,
    leaseUntil: ownership.leaseUntil,
    plannerDecision: ownership.plannerDecision,
    targetAgentId: ownership.targetAgentId,
  };
}

export function clearOwnershipFromPayload(existing: unknown): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  delete base.ownerMachine;
  delete base.ownerAgent;
  delete base.leaseUntil;
  delete base.plannerDecision;
  delete base.targetAgentId;
  return base;
}

/** True if another agent still holds an unexpired ownership lease. */
export function isOwnedByOther(payload: unknown, agentId: string, now = Date.now()): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  const owner = typeof p.ownerAgent === 'string' ? p.ownerAgent.trim() : '';
  if (!owner || owner === agentId) return false;
  const until = typeof p.leaseUntil === 'string' ? Date.parse(p.leaseUntil) : NaN;
  if (!Number.isFinite(until)) return true; // owned without expiry → treat as held
  return until > now;
}
