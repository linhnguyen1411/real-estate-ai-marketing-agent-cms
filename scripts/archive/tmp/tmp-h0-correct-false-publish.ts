/**
 * Correct H0 false-positive: mark job failed — notification URL was not a real post.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const id = 'cmrtzh1et0001x8tchl2v4jqp';
  const job = await p.socialPublishJob.findUnique({ where: { id } });
  if (!job) {
    console.log(JSON.stringify({ ok: false, error: 'missing' }));
    return;
  }

  const prev =
    job.result && typeof job.result === 'object' ? (job.result as Record<string, unknown>) : {};

  const updated = await p.socialPublishJob.update({
    where: { id },
    data: {
      status: 'failed',
      errorCode: 'false_positive_unverified',
      errorMessage:
        'H0 audit: marked published via soft_feed_url + notification permalink (notif_t=feedback_reaction_generic). No real Timeline post confirmed — corrected to failed.',
      result: {
        ...prev,
        h0Corrected: true,
        h0CorrectionReason: 'notification_permalink_false_positive',
        previousStatus: job.status,
      },
    },
  });

  if (job.draftId) {
    await p.socialPostDraft.update({
      where: { id: job.draftId },
      data: { status: 'approved' },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        jobId: updated.id,
        status: updated.status,
        draftId: job.draftId,
        draftStatus: 'approved',
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
