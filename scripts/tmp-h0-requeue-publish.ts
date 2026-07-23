import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const id = 'cmrtzh1et0001x8tchl2v4jqp';
  const job = await p.socialPublishJob.findUnique({ where: { id } });
  if (!job) {
    console.log(JSON.stringify({ ok: false, error: 'missing' }));
    return;
  }
  if (job.status === 'published') {
    console.log(JSON.stringify({ ok: true, already: 'published' }));
    return;
  }

  // Re-queue for immediate due (H0 retest after evidence fix)
  const updated = await p.socialPublishJob.update({
    where: { id },
    data: {
      status: 'queued',
      scheduledAt: new Date(Date.now() - 5_000),
      claimedBy: null,
      startedAt: null,
      errorCode: null,
      errorMessage: null,
      result: {},
    },
  });
  await p.socialPostDraft.update({
    where: { id: job.draftId },
    data: { status: 'scheduled' },
  });
  console.log(JSON.stringify({ ok: true, jobId: updated.id, status: updated.status, scheduledAt: updated.scheduledAt }, null, 2));
}

main().finally(() => p.$disconnect());
