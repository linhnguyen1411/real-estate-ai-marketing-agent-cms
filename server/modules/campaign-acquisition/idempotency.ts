/**
 * Idempotency helpers for Campaign Acquisition Requests (ADR-007).
 */

import { createHash } from 'node:crypto';

export function buildAcquisitionIdempotencyKey(input: {
  campaignId: string;
  missionProposalId?: string | null;
  goal: string;
  targetProperty?: string | null;
}): string {
  const raw = [
    input.campaignId,
    input.missionProposalId || 'mission:default',
    String(input.goal || '').trim().toLowerCase(),
    String(input.targetProperty || '').trim().toLowerCase(),
  ].join('|');
  return `acq:${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}
