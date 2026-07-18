/**
 * Runtime Event Bus — append-only control-plane events.
 * Emit is best-effort; never throws into business paths.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import type { RuntimeEventRecord, RuntimeEventType } from './types';
import { RUNTIME_EVENT_TYPES } from './types';

export type EmitRuntimeEventInput = {
  type: RuntimeEventType;
  companyId?: string | null;
  agentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export async function emitRuntimeEvent(input: EmitRuntimeEventInput): Promise<void> {
  try {
    await prisma.agentRuntimeEvent.create({
      data: {
        type: input.type,
        companyId: input.companyId ?? null,
        agentId: input.agentId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.warn(
      '[runtime-event-bus] emit failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/** Fire-and-forget — safe from hot worker paths. */
export function emitRuntimeEventAsync(input: EmitRuntimeEventInput): void {
  void emitRuntimeEvent(input);
}

export async function listRuntimeEvents(input?: {
  companyId?: string | null;
  types?: RuntimeEventType[];
  agentId?: string | null;
  limit?: number;
  since?: Date;
}): Promise<RuntimeEventRecord[]> {
  const limit = Math.min(200, Math.max(1, input?.limit ?? 50));
  const rows = await prisma.agentRuntimeEvent.findMany({
    where: {
      ...(input?.companyId ? { companyId: input.companyId } : {}),
      ...(input?.agentId ? { agentId: input.agentId } : {}),
      ...(input?.types?.length ? { type: { in: input.types } } : {}),
      ...(input?.since ? { createdAt: { gte: input.since } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    agentId: r.agentId,
    entityType: r.entityType,
    entityId: r.entityId,
    payload:
      r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {},
    createdAt: r.createdAt.toISOString(),
  }));
}

export function isRuntimeEventType(value: string): value is RuntimeEventType {
  return (RUNTIME_EVENT_TYPES as readonly string[]).includes(value);
}
