/**
 * Persist local agent entities + sync outbox in one DB transaction when sync enabled.
 * Never sends VPS/network inside the transaction.
 */
import type { Prisma } from '@prisma/client';
import { isLocalSyncEnabled } from './envelope';
import {
  enqueueFindingUpsertSync,
  enqueueScannedContentSync,
} from './enqueue';
import { runInTransaction, type DbClient } from '../repositories/shared/repositoryTypes';
import * as contentRepo from '../repositories/agent/scannedContentRepository';

export async function persistScannedContentWithOutbox(input: {
  data: Prisma.ScannedContentUncheckedCreateInput;
  enqueue?: boolean;
  kickFlush?: boolean;
}): Promise<{ content: { id: string }; outboxCreated: boolean }> {
  const syncOn = isLocalSyncEnabled() && input.enqueue !== false;
  const result = await runInTransaction(async tx => {
    const content = await contentRepo.createScannedContent(input.data, tx);
    let outboxCreated = false;
    if (syncOn) {
      const enq = await enqueueScannedContentSync({
        scannedContentId: content.id,
        tx,
        kickFlush: false,
      });
      outboxCreated = Boolean(enq.enqueued);
    }
    return { content, outboxCreated };
  });
  if (result.outboxCreated && input.kickFlush !== false) {
    await enqueueScannedContentSync({
      scannedContentId: result.content.id,
      kickFlush: true,
    }).catch(() => undefined);
  }
  return result;
}

export async function persistFindingWithOutbox(input: {
  data: Prisma.AgentFindingUncheckedCreateInput;
  enqueue?: boolean;
  kickFlush?: boolean;
  db?: DbClient;
}): Promise<{ finding: { id: string }; outboxCreated: boolean }> {
  const syncOn = isLocalSyncEnabled() && input.enqueue !== false;
  const run = async (tx: DbClient) => {
    const finding = await tx.agentFinding.create({ data: input.data });
    let outboxCreated = false;
    if (syncOn) {
      const enq = await enqueueFindingUpsertSync({
        findingId: finding.id,
        tx: tx as Prisma.TransactionClient,
        kickFlush: false,
      });
      outboxCreated = Boolean(enq.enqueued);
    }
    return { finding, outboxCreated };
  };

  const result = input.db ? await run(input.db) : await runInTransaction(tx => run(tx));
  if (result.outboxCreated && input.kickFlush !== false) {
    await enqueueFindingUpsertSync({
      findingId: result.finding.id,
      kickFlush: true,
    }).catch(() => undefined);
  }
  return result;
}

export function isSyncEnabledForPersist(): boolean {
  return isLocalSyncEnabled();
}
