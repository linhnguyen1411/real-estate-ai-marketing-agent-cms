/**
 * H0 — Patch channel destination URL into config + reset publish agent job for live retry.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const channelId = 'cmrsykcjv02dgmd6byi2x0rug';
  const publishJobId = 'cmrtzh1et0001x8tchl2v4jqp';
  const agentJobId = 'cmru0nnke006e13x4957e3e0t';

  const ch = await p.socialChannel.findUnique({ where: { id: channelId } });
  if (!ch?.profileUrl) {
    console.log(JSON.stringify({ ok: false, error: 'channel_missing_profileUrl' }));
    return;
  }

  const prev =
    ch.config && typeof ch.config === 'object' ? (ch.config as Record<string, unknown>) : {};
  const nextConfig = {
    ...prev,
    groupUrl: typeof prev.groupUrl === 'string' ? prev.groupUrl : ch.profileUrl,
    profileUrl: typeof prev.profileUrl === 'string' ? prev.profileUrl : ch.profileUrl,
  };

  const updated = await p.socialChannel.update({
    where: { id: channelId },
    data: { config: nextConfig },
  });

  await p.socialPublishJob.update({
    where: { id: publishJobId },
    data: {
      status: 'queued',
      scheduledAt: new Date(Date.now() - 5_000),
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    },
  });

  await p.agentJob.update({
    where: { id: agentJobId },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      attempts: 0,
    },
  });

  await p.socialPostDraft.update({
    where: { id: 'cmrsypi1x02iamd6b83qzqik9' },
    data: { status: 'scheduled' },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        channelId: updated.id,
        config: updated.config,
        profileUrl: updated.profileUrl,
        agentJobId,
        publishJobId,
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
