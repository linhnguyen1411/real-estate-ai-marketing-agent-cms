import { prisma } from '../../../prisma';
import type { WorkflowStepHandler } from './stepContract';
import { requireScannedContent } from './stepHelpers';

export const stopStep: WorkflowStepHandler = {
  type: 'stop',
  async execute(ctx) {
    return {
      status: 'completed',
      output: {
        stopped: true,
        reason: String(ctx.step.config?.reason || 'workflow_stop'),
      },
    };
  },
};

export const markIgnoredStep: WorkflowStepHandler = {
  type: 'mark_ignored',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    await prisma.scannedContent.update({
      where: { id: content.id },
      data: { status: 'ignored' },
    });
    return {
      status: 'skipped',
      output: {
        ignored: true,
        scannedContentId: content.id,
      },
    };
  },
};

export const dedupeStep: WorkflowStepHandler = {
  type: 'dedupe',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    if (content.status === 'duplicate') {
      return {
        status: 'skipped',
        output: { duplicate: true, reason: 'content_status_duplicate' },
        idempotent: true,
      };
    }

    if (content.normalizedContentHash) {
      const prior = await prisma.scannedContent.findFirst({
        where: {
          sourceId: content.sourceId,
          normalizedContentHash: content.normalizedContentHash,
          id: { not: content.id },
          collectedAt: { lt: content.collectedAt },
        },
        select: { id: true },
      });
      if (prior) {
        return {
          status: 'skipped',
          output: { duplicate: true, duplicateOfContentId: prior.id },
          idempotent: true,
        };
      }
    }

    return {
      status: 'completed',
      output: { duplicate: false },
    };
  },
};
