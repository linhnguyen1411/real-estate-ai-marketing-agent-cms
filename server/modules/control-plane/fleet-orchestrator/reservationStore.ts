/**
 * Soft job reservations + cooldowns (G2) — in-memory, TTL-based.
 * Not a Prisma table; NAT-friendly pull model.
 */

import type { JobCooldown, JobReservation } from './types';

const RESERVATION_TTL_MS = 15_000;
const COOLDOWN_BASE_MS = 60_000;
const COOLDOWN_MAX_MS = 15 * 60_000;

const reservations = new Map<string, JobReservation>();
const cooldowns = new Map<string, JobCooldown>();

let stats = {
  reservationsExpired: 0,
  reassigns: 0,
  failovers: 0,
};

export function getOrchestratorStoreStats() {
  return { ...stats };
}

function sweep(now = Date.now()): void {
  for (const [id, r] of reservations) {
    if (r.expiresAt <= now) {
      reservations.delete(id);
      stats.reservationsExpired += 1;
      stats.reassigns += 1;
    }
  }
  for (const [id, c] of cooldowns) {
    if (c.until <= now) cooldowns.delete(id);
  }
}

export function reserveJob(input: {
  jobId: string;
  agentId: string;
  ttlMs?: number;
  reason?: string;
}): JobReservation {
  sweep();
  const now = Date.now();
  const row: JobReservation = {
    jobId: input.jobId,
    agentId: input.agentId,
    reservedAt: now,
    expiresAt: now + (input.ttlMs ?? RESERVATION_TTL_MS),
    reason: input.reason || 'placement',
  };
  reservations.set(input.jobId, row);
  return row;
}

export function releaseReservation(jobId: string): boolean {
  return reservations.delete(jobId);
}

export function getReservation(jobId: string): JobReservation | null {
  sweep();
  return reservations.get(jobId) ?? null;
}

/** true if another agent still holds a live reservation. */
export function isReservedForOther(jobId: string, agentId: string): boolean {
  const r = getReservation(jobId);
  if (!r) return false;
  return r.agentId !== agentId;
}

export function listReservations(): JobReservation[] {
  sweep();
  return [...reservations.values()];
}

export function recordJobFailureCooldown(jobId: string, reason?: string): JobCooldown {
  sweep();
  const prev = cooldowns.get(jobId);
  const failures = (prev?.failures ?? 0) + 1;
  const ttl = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** Math.max(0, failures - 1));
  const row: JobCooldown = {
    jobId,
    until: Date.now() + ttl,
    failures,
    reason: reason || 'repeated_failure',
  };
  cooldowns.set(jobId, row);
  return row;
}

export function clearJobCooldown(jobId: string): void {
  cooldowns.delete(jobId);
}

export function isJobInCooldown(jobId: string): boolean {
  sweep();
  const c = cooldowns.get(jobId);
  return Boolean(c && c.until > Date.now());
}

export function listCooldowns(): JobCooldown[] {
  sweep();
  return [...cooldowns.values()];
}

export function markFailover(): void {
  stats.failovers += 1;
  stats.reassigns += 1;
}

export function resetReservationStoreForTests(): void {
  reservations.clear();
  cooldowns.clear();
  stats = { reservationsExpired: 0, reassigns: 0, failovers: 0 };
}

export { RESERVATION_TTL_MS };
