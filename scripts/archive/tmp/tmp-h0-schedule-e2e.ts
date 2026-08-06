/**
 * H0.3 — Schedule one approved draft for near-term E2E (VPS).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const draft = await p.socialPostDraft.findFirst({
    where: { status: 'approved' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!draft) {
    console.log(JSON.stringify({ ok: false, error: 'no_approved_draft' }));
    return;
  }

  const ch = await p.socialChannel.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!ch) {
    console.log(JSON.stringify({ ok: false, error: 'no_channel', draftId: draft.id }));
    return;
  }

  const scheduledAt = new Date(Date.now() + 90_000);
  const idempotencyKey = `h0-e2e-${draft.id}-${scheduledAt.getTime()}`;

  const existing = await p.socialPublishJob.findFirst({
    where: {
      draftId: draft.id,
      status: { in: ['queued', 'claimed', 'preparing', 'publishing'] },
    },
  });
  if (existing) {
    console.log(JSON.stringify({ ok: true, skipped: true, jobId: existing.id, draftId: draft.id }));
    return;
  }

  const job = await p.socialPublishJob.create({
    data: {
      companyId: draft.companyId,
      draftId: draft.id,
      channelId: ch.id,
      status: 'queued',
      scheduledAt,
      idempotencyKey,
    },
  });

  await p.socialPostDraft.update({
    where: { id: draft.id },
    data: { status: 'scheduled' },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        draftId: draft.id,
        channelId: ch.id,
        channelType: ch.type,
        channelName: ch.name,
        jobId: job.id,
        scheduledAt: scheduledAt.toISOString(),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
