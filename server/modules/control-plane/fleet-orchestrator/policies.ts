/**
 * Fleet Policies store (G2) — drain / maintenance / pin / mode.
 * In-memory Control Plane state (survives via process; not a new queue).
 */

import type { FleetPolicyMode, MachinePolicyState } from './types';

const machines = new Map<string, MachinePolicyState>();
let defaultMode: FleetPolicyMode = 'spread';

function keyFor(input: { machineId?: string | null; agentId?: string | null; hostname?: string | null }) {
  return (
    input.machineId?.trim() ||
    input.agentId?.trim() ||
    input.hostname?.trim()?.toLowerCase() ||
    ''
  );
}

export function getDefaultFleetPolicy(): FleetPolicyMode {
  return defaultMode;
}

export function setDefaultFleetPolicy(mode: FleetPolicyMode): void {
  defaultMode = mode;
}

export function upsertMachinePolicy(
  input: Partial<MachinePolicyState> & { machineId: string },
): MachinePolicyState {
  const prev = machines.get(input.machineId);
  const next: MachinePolicyState = {
    machineId: input.machineId,
    agentId: input.agentId ?? prev?.agentId ?? null,
    hostname: input.hostname ?? prev?.hostname ?? null,
    mode: input.mode ?? prev?.mode ?? 'normal',
    pinnedMissionIds: input.pinnedMissionIds ?? prev?.pinnedMissionIds ?? [],
    pinnedSourceIds: input.pinnedSourceIds ?? prev?.pinnedSourceIds ?? [],
    pinnedBrowserProfiles: input.pinnedBrowserProfiles ?? prev?.pinnedBrowserProfiles ?? [],
    updatedAt: new Date().toISOString(),
  };
  machines.set(input.machineId, next);
  if (next.agentId) machines.set(next.agentId, next);
  if (next.hostname) machines.set(next.hostname.toLowerCase(), next);
  return next;
}

export function getMachinePolicy(input: {
  machineId?: string | null;
  agentId?: string | null;
  hostname?: string | null;
}): MachinePolicyState | null {
  const k = keyFor(input);
  if (!k) return null;
  return machines.get(k) || machines.get(k.toLowerCase()) || null;
}

export function listMachinePolicies(): MachinePolicyState[] {
  const seen = new Set<string>();
  const out: MachinePolicyState[] = [];
  for (const p of machines.values()) {
    if (seen.has(p.machineId)) continue;
    seen.add(p.machineId);
    out.push(p);
  }
  return out;
}

export function isMachineDraining(input: {
  machineId?: string | null;
  agentId?: string | null;
  hostname?: string | null;
}): boolean {
  const p = getMachinePolicy(input);
  return p?.mode === 'drain';
}

export function isMachineInMaintenance(input: {
  machineId?: string | null;
  agentId?: string | null;
  hostname?: string | null;
}): boolean {
  const p = getMachinePolicy(input);
  return p?.mode === 'maintenance';
}

export function effectivePolicyMode(input: {
  machineId?: string | null;
  agentId?: string | null;
  hostname?: string | null;
}): FleetPolicyMode {
  const p = getMachinePolicy(input);
  if (!p || p.mode === 'normal') return defaultMode;
  return p.mode as FleetPolicyMode;
}

export function pinToMachine(input: {
  machineId: string;
  agentId?: string | null;
  hostname?: string | null;
  missionId?: string | null;
  sourceId?: string | null;
  browserProfile?: string | null;
}): MachinePolicyState {
  const prev = getMachinePolicy(input) || {
    machineId: input.machineId,
    agentId: input.agentId ?? null,
    hostname: input.hostname ?? null,
    mode: 'manual_pin' as const,
    pinnedMissionIds: [],
    pinnedSourceIds: [],
    pinnedBrowserProfiles: [],
    updatedAt: new Date().toISOString(),
  };
  return upsertMachinePolicy({
    ...prev,
    mode: 'manual_pin',
    agentId: input.agentId ?? prev.agentId,
    hostname: input.hostname ?? prev.hostname,
    pinnedMissionIds: input.missionId
      ? Array.from(new Set([...prev.pinnedMissionIds, input.missionId]))
      : prev.pinnedMissionIds,
    pinnedSourceIds: input.sourceId
      ? Array.from(new Set([...prev.pinnedSourceIds, input.sourceId]))
      : prev.pinnedSourceIds,
    pinnedBrowserProfiles: input.browserProfile
      ? Array.from(new Set([...prev.pinnedBrowserProfiles, input.browserProfile]))
      : prev.pinnedBrowserProfiles,
  });
}

export function resetFleetPoliciesForTests(): void {
  machines.clear();
  defaultMode = 'spread';
}
