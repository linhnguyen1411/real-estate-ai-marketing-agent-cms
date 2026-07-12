/**
 * Investor lead call / follow-up status updates.
 *
 * Expected Lead schema fields (not yet in prisma):
 * - callCount, lastCalledAt, lastCalledBy, callbackAt, callNote
 * Until migrated, status + LeadEvent carry call history.
 */

import crypto from 'crypto';
import type { AuthUser } from '../src/types';
import { prisma } from './prisma';

export const INVESTOR_LEAD_CALL_STATUSES = [
  'called',
  'unreachable',
  'callback_scheduled',
  'qualified',
  'unqualified',
  'converted_to_customer',
] as const;

export type InvestorLeadCallStatus = (typeof INVESTOR_LEAD_CALL_STATUSES)[number];

export type UpdateInvestorLeadCallResult = {
  leadId: string;
  status: InvestorLeadCallStatus;
  callCount: number | null;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function updateInvestorLeadCallStatus(input: {
  leadId: string;
  user: AuthUser;
  status: InvestorLeadCallStatus | string;
  note?: string | null;
  callbackAt?: string | Date | null;
}): Promise<UpdateInvestorLeadCallResult> {
  const status = String(input.status) as InvestorLeadCallStatus;
  if (!INVESTOR_LEAD_CALL_STATUSES.includes(status)) {
    throw new Error(`Trạng thái gọi không hợp lệ: ${input.status}`);
  }
  if (status === 'converted_to_customer') {
    throw new Error(
      'Không thể đặt status converted_to_customer qua call service. Dùng convertInvestorLeadToCustomer.',
    );
  }

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error('Không tìm thấy lead.');

  const now = new Date();
  const isCallAttempt = status === 'called' || status === 'unreachable';
  const leadRow = lead as unknown as Record<string, unknown>;
  const prevCount = typeof leadRow.callCount === 'number' ? leadRow.callCount : 0;
  const nextCount = isCallAttempt ? prevCount + 1 : prevCount;

  const callbackAt =
    input.callbackAt != null
      ? input.callbackAt instanceof Date
        ? input.callbackAt
        : new Date(input.callbackAt)
      : null;

  const baseUpdate = {
    status,
    updatedAt: now,
  };

  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...baseUpdate,
        ...({
          ...(isCallAttempt
            ? {
                callCount: nextCount,
                lastCalledAt: now,
                lastCalledBy: input.user.id,
              }
            : {}),
          ...(status === 'callback_scheduled' && callbackAt ? { callbackAt } : {}),
          ...(input.note ? { callNote: input.note } : {}),
        } as object),
      } as Parameters<typeof prisma.lead.update>[0]['data'],
    });
  } catch {
    await prisma.lead.update({
      where: { id: lead.id },
      data: baseUpdate,
    });
  }

  await prisma.leadEvent.create({
    data: {
      id: newId('levent'),
      leadId: lead.id,
      eventType: 'call_status',
      eventData: {
        status,
        note: input.note ?? null,
        callbackAt: callbackAt?.toISOString() ?? null,
        callCount: isCallAttempt ? nextCount : prevCount,
        actorUserId: input.user.id,
        at: now.toISOString(),
      },
      createdAt: now,
    },
  });

  return {
    leadId: lead.id,
    status,
    callCount: isCallAttempt ? nextCount : typeof leadRow.callCount === 'number' ? leadRow.callCount : null,
  };
}
