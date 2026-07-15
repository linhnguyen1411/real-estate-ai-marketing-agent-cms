import { getSettings } from '../dbHelper';
import { prisma } from '../prisma';
import { postEnvelopeToVps } from './vpsClient';
import { enqueueFindingUpsertSync } from './enqueue';
import type { AgentIngestionEnvelopeV1 } from './envelope';

export type OutboxEnqueueInput = {
  companyId?: string | null;
  findingId: string;
  ingestionId?: string;
  payload?: Record<string, unknown>;
};

export const OUTBOX_STATUSES = [
  'pending',
  'sending',
  'synced',
  'failed',
  'dead_letter',
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export function backoffMs(attempts: number): number {
  const base = 30_000;
  const capped = Math.min(6, Math.max(0, attempts));
  return base * 2 ** capped;
}

/** @deprecated Prefer enqueueFindingUpsertSync — kept for callers/tests */
export async function enqueueFindingSync(input: OutboxEnqueueInput): Promise<{
  enqueued: boolean;
  outboxId?: string;
  reason?: string;
}> {
  return enqueueFindingUpsertSync({ findingId: input.findingId });
}

async function markEntitySynced(input: {
  eventType: string;
  entityId: string | null;
  remoteFindingId?: string | null;
  remoteContentId?: string | null;
  remoteSourceId?: string | null;
  error?: string | null;
  ok: boolean;
}): Promise<void> {
  const now = new Date();
  if (!input.entityId) return;
  try {
    if (input.eventType === 'finding_upsert') {
      await prisma.agentFinding.update({
        where: { id: input.entityId },
        data: input.ok
          ? {
              syncStatus: 'synced',
              remoteId: input.remoteFindingId || undefined,
              lastSyncAt: now,
              syncError: null,
            }
          : {
              syncStatus: 'failed',
              syncError: input.error || 'sync_failed',
            },
      });
      if (input.ok && input.remoteContentId) {
        await prisma.scannedContent.updateMany({
          where: { findings: { some: { id: input.entityId } } },
          data: {
            syncStatus: 'synced',
            remoteId: input.remoteContentId,
            lastSyncAt: now,
            syncError: null,
          },
        });
      }
    } else if (input.eventType === 'scanned_content_upsert') {
      await prisma.scannedContent.update({
        where: { id: input.entityId },
        data: input.ok
          ? {
              syncStatus: 'synced',
              remoteId: input.remoteContentId || undefined,
              lastSyncAt: now,
              syncError: null,
            }
          : {
              syncStatus: 'failed',
              syncError: input.error || 'sync_failed',
            },
      });
      if (input.ok && input.remoteSourceId) {
        const content = await prisma.scannedContent.findUnique({
          where: { id: input.entityId },
          select: { sourceId: true },
        });
        if (content) {
          await prisma.agentSource.update({
            where: { id: content.sourceId },
            data: {
              syncStatus: 'synced',
              remoteId: input.remoteSourceId,
              lastSyncAt: now,
              syncError: null,
            },
          });
        }
      }
    }
  } catch {
    // non-fatal mapping update
  }
}

export async function processOutboxBatch(options?: {
  limit?: number;
}): Promise<{ processed: number; synced: number; failed: number }> {
  const settings = getSettings();
  // Hard-on: process outbox regardless of settings.agent_sync_enabled.

  const limit = Math.min(
    options?.limit ?? Number(settings.agent_sync_batch_size || 10),
    50,
  );
  const now = new Date();

  // Prefer dependency order: source/content before finding
  const rows = await prisma.agentSyncOutbox.findMany({
    where: {
      status: { in: ['pending', 'failed'] },
      nextAttemptAt: { lte: now },
      attempts: { lt: 12 },
    },
    orderBy: [{ createdAt: 'asc' }],
    take: limit * 3,
  });

  const eventRank = (t: string) =>
    t === 'source_upsert' ? 0 : t === 'scanned_content_upsert' ? 1 : t === 'finding_upsert' ? 2 : 3;
  rows.sort((a, b) => eventRank(a.eventType) - eventRank(b.eventType));
  const batch = rows.slice(0, limit);

  let synced = 0;
  let failed = 0;

  for (const row of batch) {
    await prisma.agentSyncOutbox.update({
      where: { id: row.id },
      data: { status: 'sending', attempts: { increment: 1 } },
    });

    const payload = row.payload as Record<string, unknown>;
    const result = await postEnvelopeToVps(
      payload as unknown as AgentIngestionEnvelopeV1,
      settings,
    );

    if (result.ok) {
      await prisma.agentSyncOutbox.update({
        where: { id: row.id },
        data: {
          status: 'synced',
          syncedAt: new Date(),
          lastError: null,
          remoteFindingId: result.findingId || null,
          remoteContentId: result.scannedContentId || null,
          remoteSourceId: result.sourceId || null,
        },
      });
      await markEntitySynced({
        eventType: row.eventType,
        entityId: row.entityId,
        remoteFindingId: result.findingId,
        remoteContentId: result.scannedContentId,
        remoteSourceId: result.sourceId,
        ok: true,
      });
      synced += 1;
    } else {
      const attempts = row.attempts + 1;
      const dead = attempts >= 12;
      await prisma.agentSyncOutbox.update({
        where: { id: row.id },
        data: {
          status: dead ? 'dead_letter' : 'failed',
          lastError: result.error || 'sync_failed',
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
        },
      });
      await markEntitySynced({
        eventType: row.eventType,
        entityId: row.entityId,
        ok: false,
        error: result.error || 'sync_failed',
      });
      failed += 1;
    }
  }

  return { processed: batch.length, synced, failed };
}

export async function getSyncOutboxStats(): Promise<{
  pending: number;
  failed: number;
  synced: number;
  deadLetter: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}> {
  const [pending, failed, synced, deadLetter, lastSynced, lastFail] = await Promise.all([
    prisma.agentSyncOutbox.count({ where: { status: 'pending' } }),
    prisma.agentSyncOutbox.count({ where: { status: 'failed' } }),
    prisma.agentSyncOutbox.count({ where: { status: 'synced' } }),
    prisma.agentSyncOutbox.count({ where: { status: 'dead_letter' } }),
    prisma.agentSyncOutbox.findFirst({
      where: { status: 'synced' },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    }),
    prisma.agentSyncOutbox.findFirst({
      where: { status: { in: ['failed', 'dead_letter'] }, lastError: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { lastError: true },
    }),
  ]);
  return {
    pending,
    failed,
    synced,
    deadLetter,
    lastSyncedAt: lastSynced?.syncedAt?.toISOString() ?? null,
    lastError: lastFail?.lastError ?? null,
  };
}
