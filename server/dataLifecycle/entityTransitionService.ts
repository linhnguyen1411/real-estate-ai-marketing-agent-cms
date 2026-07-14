/**
 * Finding consumption / status transitions for the sales pipeline.
 */

import type { Prisma } from '@prisma/client';

export const FINDING_CONSUMPTION_STATUSES = [
  'promoted_to_investor_lead',
  'saved_to_external_inventory',
  'dismissed',
  'duplicate',
  'archived',
  'reviewed',
  'new',
] as const;

export type FindingConsumptionStatus = (typeof FINDING_CONSUMPTION_STATUSES)[number];

/** Legacy alias still accepted when reading: 'promoted' ≡ promoted_to_investor_lead */
export const LEGACY_PROMOTED_STATUS = 'promoted';

export type MarkFindingConsumedInput = {
  findingId: string;
  status: FindingConsumptionStatus;
  consumptionType?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
  userId?: string | null;
};

export function isPromotedFindingStatus(status: string | null | undefined): boolean {
  return status === 'promoted_to_investor_lead' || status === LEGACY_PROMOTED_STATUS;
}

/**
 * Mark an AgentFinding as consumed / transitioned.
 *
 * Expected schema fields (not all present yet):
 * - consumptionType, consumedAt, consumedBy, consumedResourceId, consumedResourceType
 * Legacy compat: promotedLeadId / externalInventoryItemId (+ promotedAt/By, externalInventorySavedAt/By)
 */
export async function markFindingConsumed(
  tx: Prisma.TransactionClient | typeof import('../prisma').prisma,
  input: MarkFindingConsumedInput,
): Promise<void> {
  const now = new Date();
  const base: Record<string, unknown> = {
    status: input.status,
    updatedAt: now,
  };

  // Legacy compat fields
  if (input.status === 'promoted_to_investor_lead' && input.resourceId) {
    base.promotedLeadId = input.resourceId;
    base.promotedAt = now;
    if (input.userId) base.promotedBy = input.userId;
  }
  if (input.status === 'saved_to_external_inventory' && input.resourceId) {
    base.externalInventoryItemId = input.resourceId;
    base.externalInventorySavedAt = now;
    if (input.userId) base.externalInventorySavedBy = input.userId;
  }
  if (input.status === 'dismissed') {
    base.dismissedAt = now;
    if (input.userId) base.dismissedBy = input.userId;
  }
  if (input.status === 'reviewed') {
    base.reviewedAt = now;
    if (input.userId) base.reviewedBy = input.userId;
  }

  // Preferred consumption columns — try full update, then fall back to known fields only
  const withConsumption: Record<string, unknown> = {
    ...base,
    consumptionType: input.consumptionType ?? null,
    consumedAt: now,
    consumedBy: input.userId ?? null,
    consumedResourceId: input.resourceId ?? null,
    consumedResourceType: input.resourceType ?? null,
  };

  try {
    await (tx.agentFinding as { update: (args: unknown) => Promise<unknown> }).update({
      where: { id: input.findingId },
      data: withConsumption,
    });
  } catch {
    // Schema may not have consumption* columns yet — update known fields only
    await tx.agentFinding.update({
      where: { id: input.findingId },
      data: base as Prisma.AgentFindingUpdateInput,
    });
  }
}
