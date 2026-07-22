/**
 * H0.3 — Retarget publish job to Facebook Timeline (profile) for reliable E2E burn-in.
 */
import { PrismaClient } from '@prisma/client';
import { enqueueAgentJobForPublishJob } from '../server/modules/social-publishing/jobService';

const p = new PrismaClient();

async function main() {
  const publishJobId = 'cmrtzh1et0001x8tchl2v4jqp';
  const timelineChannelId = 'cmrsyjigv02d1md6bv0bbubvq';

  // Cancel active agent jobs for this publish
  const active = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
      payload: { path: ['publishJobId'], equals: publishJobId },
    },
  });
  for (const a of active) {
    await p.agentJob.update({
      where: { id: a.id },
      data: {
        status: 'failed',
        errorMessage: 'h0_retarget_timeline',
        finishedAt: new Date(),
      },
    });
  }

  const ch = await p.socialChannel.findUnique({ where: { id: timelineChannelId } });
  if (!ch) {
    console.log(JSON.stringify({ ok: false, error: 'timeline_channel_missing' }));
    return;
  }

  const prev =
    ch.config && typeof ch.config === 'object' ? (ch.config as Record<string, unknown>) : {};
  await p.socialChannel.update({
    where: { id: ch.id },
    data: {
      config: {
        ...prev,
        profileUrl: typeof prev.profileUrl === 'string' ? prev.profileUrl : ch.profileUrl || 'https://www.facebook.com/',
      },
    },
  });

  await p.socialPublishJob.update({
    where: { id: publishJobId },
    data: {
      channelId: timelineChannelId,
      status: 'queued',
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      scheduledAt: new Date(Date.now() - 5_000),
      result: {
        missionId: null,
        missionRunId: null,
        destinationKey: 'facebook_timeline',
        h0Retarget: 'timeline',
      },
    },
  });

  await p.socialPostDraft.update({
    where: { id: 'cmrsypi1x02iamd6b83qzqik9' },
    data: { status: 'scheduled' },
  });

  const created = await enqueueAgentJobForPublishJob({
    id: publishJobId,
    companyId: 'comp-da-nang',
  });

  const agent = await p.agentJob.findFirst({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
      payload: { path: ['publishJobId'], equals: publishJobId },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        channelId: timelineChannelId,
        channelType: ch.type,
        agentJobId: agent?.id,
        agentStatus: agent?.status,
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
