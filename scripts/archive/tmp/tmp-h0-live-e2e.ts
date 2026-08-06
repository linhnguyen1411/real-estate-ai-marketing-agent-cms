/**
 * H0.3 — Requeue / create near-due publish job for LIVE E2E (BROWSER_PUBLISH_LIVE=1).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const draftId = process.env.H0_DRAFT_ID || 'cmrsypi1x02iamd6b83qzqik9';
  const publishJobId = process.env.H0_PUBLISH_JOB_ID || 'cmrtzh1et0001x8tchl2v4jqp';

  const draft = await p.socialPostDraft.findUnique({
    where: { id: draftId },
    select: { id: true, status: true, companyId: true, body: true },
  });

  let job = await p.socialPublishJob.findUnique({ where: { id: publishJobId } });

  const recent = await p.socialPublishJob.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      draftId: true,
      channelId: true,
      updatedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        phase: 'inspect',
        draft,
        targetJob: job
          ? {
              id: job.id,
              status: job.status,
              scheduledAt: job.scheduledAt,
              claimedBy: job.claimedBy,
              errorMessage: job.errorMessage,
            }
          : null,
        recent,
      },
      null,
      2,
    ),
  );

  if (!draft) {
    console.log(JSON.stringify({ ok: false, error: 'draft_missing' }));
    return;
  }

  if (job?.status === 'published') {
    console.log(JSON.stringify({ ok: true, already: 'published', jobId: job.id }));
    return;
  }

  // Prefer reusing existing job; else create new for approved/scheduled draft
  if (job && ['queued', 'failed', 'claimed', 'preparing', 'publishing'].includes(job.status)) {
    job = await p.socialPublishJob.update({
      where: { id: job.id },
      data: {
        status: 'queued',
        scheduledAt: new Date(Date.now() - 10_000),
        claimedBy: null,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  } else if (!job) {
    const channel =
      (await p.socialChannel.findFirst({
        where: { isActive: true, type: 'facebook_group' },
        orderBy: { updatedAt: 'desc' },
      })) ||
      (await p.socialChannel.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!channel) {
      console.log(JSON.stringify({ ok: false, error: 'no_channel' }));
      return;
    }
    const scheduledAt = new Date(Date.now() - 10_000);
    job = await p.socialPublishJob.create({
      data: {
        companyId: draft.companyId,
        draftId: draft.id,
        channelId: channel.id,
        status: 'queued',
        scheduledAt,
        idempotencyKey: `h0-live-${draft.id}-${Date.now()}`,
      },
    });
  } else {
    // published/cancelled — create fresh job
    const scheduledAt = new Date(Date.now() - 10_000);
    job = await p.socialPublishJob.create({
      data: {
        companyId: draft.companyId,
        draftId: draft.id,
        channelId: job.channelId,
        status: 'queued',
        scheduledAt,
        idempotencyKey: `h0-live-${draft.id}-${Date.now()}`,
      },
    });
  }

  await p.socialPostDraft.update({
    where: { id: draft.id },
    data: { status: 'scheduled' },
  });

  // Cancel stale active agent jobs so bridge can spawn a fresh one after live env
  const activeAgents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
      payload: { path: ['publishJobId'], equals: job.id },
    },
  });
  for (const a of activeAgents) {
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'failed',
        errorMessage: 'h0_superseded_for_live_publish',
        finishedAt: new Date(),
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'requeued_for_live',
        draftId: draft.id,
        jobId: job.id,
        status: job.status,
        scheduledAt: job.scheduledAt,
        cancelledActiveAgents: activeAgents.map(a => a.id),
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
