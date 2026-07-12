/**
 * Lightweight audit writer for pipeline entity transitions.
 * Routes to LeadEvent / ExternalInventoryEvent / AgentNotification by entity type.
 */

import crypto from 'crypto';
import { prisma } from '../prisma';

export type AuditEntityType = 'lead' | 'external_inventory' | 'finding' | 'customer' | 'property' | string;

export type WriteAuditEventInput = {
  entityType: AuditEntityType;
  entityId: string;
  eventType: string;
  actorUserId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown> | null;
  note?: string | null;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export type AuditWriteResult = {
  channel: 'lead_event' | 'external_inventory_event' | 'agent_notification';
  id: string;
};

/**
 * Writes an audit trail row for the given entity.
 * - lead → LeadEvent
 * - external / external_inventory → ExternalInventoryEvent
 * - everything else → AgentNotification (data payload)
 */
export async function writeAuditEvent(input: WriteAuditEventInput): Promise<AuditWriteResult> {
  const now = new Date();
  const meta = {
    ...(input.metadata || {}),
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId ?? null,
    companyId: input.companyId ?? null,
  };

  const kind = String(input.entityType || '').toLowerCase();

  if (kind === 'lead' || kind === 'investor_lead') {
    const id = newId('levent');
    await prisma.leadEvent.create({
      data: {
        id,
        leadId: input.entityId,
        eventType: input.eventType,
        eventData: meta,
        createdAt: now,
      },
    });
    return { channel: 'lead_event', id };
  }

  if (
    kind === 'external' ||
    kind === 'external_inventory' ||
    kind === 'external_inventory_item'
  ) {
    const id = newId('eie');
    await prisma.externalInventoryEvent.create({
      data: {
        id,
        itemId: input.entityId,
        eventType: input.eventType,
        note: input.note ?? null,
        userId: input.actorUserId ?? null,
        metadata: meta,
      },
    });
    return { channel: 'external_inventory_event', id };
  }

  // Fallback for findings / customers / properties / unknown — AgentNotification data
  const id = newId('anotif');
  const eventKey = `audit:${input.entityType}:${input.entityId}:${input.eventType}:${Date.now()}`;
  await prisma.agentNotification.create({
    data: {
      id,
      companyId: input.companyId ?? null,
      userId: input.actorUserId ?? null,
      findingId: kind === 'finding' || kind === 'agent_finding' ? input.entityId : null,
      type: 'entity_audit',
      eventKey,
      title: input.eventType,
      message: input.note || `${input.entityType}:${input.entityId}`,
      severity: 'info',
      status: 'unread',
      data: meta,
    },
  });
  return { channel: 'agent_notification', id };
}
