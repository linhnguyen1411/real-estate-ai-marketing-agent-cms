/**
 * Clear H0 / publish E2E test artifacts on production (keep real channels).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const TEST_DRAFT_IDS = [
  'cmrsypi1x02iamd6b83qzqik9',
  'cmrsyqpa202jjmd6btnnpph4y',
];

const TEST_PUBLISH_JOB_IDS = [
  'cmrtzh1et0001x8tchl2v4jqp',
  'cmru2qpkm0006131d2p4a0lh9',
];

async function main() {
  const publishJobs = await p.socialPublishJob.findMany({
    where: {
      OR: [
        { id: { in: TEST_PUBLISH_JOB_IDS } },
        { draftId: { in: TEST_DRAFT_IDS } },
        { idempotencyKey: { startsWith: 'h0-' } },
      ],
    },
    select: { id: true, draftId: true, status: true, idempotencyKey: true },
  });
  const publishIds = publishJobs.map(j => j.id);
  const draftIds = [...new Set([...TEST_DRAFT_IDS, ...publishJobs.map(j => j.draftId)])];

  const agentJobs = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      OR: [
        ...publishIds.map(id => ({ payload: { path: ['publishJobId'], equals: id } })),
        { errorMessage: { contains: 'h0_' } },
      ],
    },
    select: { id: true, status: true },
  });

  // Cancel/fail active agents first
  for (const a of agentJobs) {
    if (['queued', 'claimed', 'running'].includes(a.status)) {
      await p.agentJob.update({
        where: { id: a.id },
        data: {
          status: 'cancelled',
          errorMessage: 'test_cleanup',
          finishedAt: new Date(),
        },
      });
    }
  }

  const deletedAttempts = publishIds.length
    ? await p.socialPublishAttempt.deleteMany({ where: { jobId: { in: publishIds } } })
    : { count: 0 };
  const deletedJobs = publishIds.length
    ? await p.socialPublishJob.deleteMany({ where: { id: { in: publishIds } } })
    : { count: 0 };

  // Soft-clean drafts: cancel rather than delete if they have other relations
  let draftsUpdated = 0;
  for (const id of draftIds) {
    const d = await p.socialPostDraft.findUnique({ where: { id } });
    if (!d) continue;
    await p.socialPostDraft.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    draftsUpdated += 1;
  }

  // Also cancel any leftover h0 agent jobs by message
  const h0Agents = await p.agentJob.updateMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
      OR: [
        { errorMessage: { contains: 'h0_' } },
        { errorMessage: { contains: 'h0' } },
      ],
    },
    data: { status: 'cancelled', errorMessage: 'test_cleanup', finishedAt: new Date() },
  });

  const remainingOpen = await p.socialPublishJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    select: { id: true, status: true, scheduledAt: true },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedPublishJobs: deletedJobs.count,
        deletedAttempts: deletedAttempts.count,
        cancelledAgentJobs: agentJobs.length,
        draftsCancelled: draftsUpdated,
        h0AgentsForceCancel: h0Agents.count,
        remainingOpenPublishJobs: remainingOpen,
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
