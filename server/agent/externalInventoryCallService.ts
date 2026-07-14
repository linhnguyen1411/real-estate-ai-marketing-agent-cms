/**
 * Call / verification status updates for ExternalInventoryItem.
 *
 * Expected optional schema fields (not yet in prisma):
 * - callCount, lastCalledAt, lastCalledBy, lastVerifiedAt, lastVerifiedBy
 * Until migrated, verificationStatus + ExternalInventoryEvent carry history.
 */

import crypto from 'crypto';
import type { AuthUser } from '../../src/types';
import { prisma } from '../prisma';
import { canAccessAgentRecord } from './agentDb';

export const EXTERNAL_VERIFICATION_STATUSES = [
  'contacted',
  'verified',
  'unavailable',
  'invalid',
  'duplicate',
  'unverified',
] as const;

export type ExternalVerificationStatus = (typeof EXTERNAL_VERIFICATION_STATUSES)[number];

export type UpdateExternalInventoryCallResult = {
  itemId: string;
  verificationStatus: ExternalVerificationStatus;
  callCount: number | null;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function updateExternalInventoryCallStatus(input: {
  itemId: string;
  user: AuthUser;
  verificationStatus: ExternalVerificationStatus | string;
  note?: string | null;
  status?: string | null;
}): Promise<UpdateExternalInventoryCallResult> {
  const verificationStatus = String(input.verificationStatus) as ExternalVerificationStatus;
  if (!EXTERNAL_VERIFICATION_STATUSES.includes(verificationStatus)) {
    throw new Error(`Trạng thái xác minh không hợp lệ: ${input.verificationStatus}`);
  }

  const item = await prisma.externalInventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error('Không tìm thấy external inventory item.');
  if (!canAccessAgentRecord(input.user, item.companyId)) {
    throw new Error('Không có quyền.');
  }

  const now = new Date();
  const isContactAttempt =
    verificationStatus === 'contacted' ||
    verificationStatus === 'verified' ||
    verificationStatus === 'unavailable' ||
    verificationStatus === 'invalid';

  const row = item as unknown as Record<string, unknown>;
  const prevCount = typeof row.callCount === 'number' ? row.callCount : 0;
  const nextCount = isContactAttempt ? prevCount + 1 : prevCount;

  const baseUpdate: Record<string, unknown> = {
    verificationStatus,
    ...(input.status ? { status: input.status } : {}),
  };

  if (verificationStatus === 'duplicate' && input.status !== 'dismissed') {
    // keep status unless caller overrides; duplicate often stays listed
  }

  try {
    await prisma.externalInventoryItem.update({
      where: { id: item.id },
      data: {
        ...baseUpdate,
        ...({
          ...(isContactAttempt
            ? {
                callCount: nextCount,
                lastCalledAt: now,
                lastCalledBy: input.user.id,
              }
            : {}),
          ...(verificationStatus === 'verified'
            ? { lastVerifiedAt: now, lastVerifiedBy: input.user.id }
            : {}),
        } as object),
      } as Parameters<typeof prisma.externalInventoryItem.update>[0]['data'],
    });
  } catch {
    await prisma.externalInventoryItem.update({
      where: { id: item.id },
      data: {
        verificationStatus,
        ...(input.status ? { status: input.status } : {}),
      },
    });
  }

  await prisma.externalInventoryEvent.create({
    data: {
      id: newId('eie'),
      itemId: item.id,
      eventType: 'call_verification',
      note: input.note ?? null,
      userId: input.user.id,
      metadata: {
        verificationStatus,
        status: input.status ?? null,
        callCount: isContactAttempt ? nextCount : prevCount,
        at: now.toISOString(),
      },
    },
  });

  return {
    itemId: item.id,
    verificationStatus,
    callCount: isContactAttempt ? nextCount : typeof row.callCount === 'number' ? row.callCount : null,
  };
}
