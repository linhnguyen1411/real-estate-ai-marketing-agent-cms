#!/usr/bin/env node
/** Stop duplicate Sàn 43 retries — post already live on group. */
import { PrismaClient } from '@prisma/client';
import { opsBrowserCommand } from '../server/modules/control-plane/operationsService';

const p = new PrismaClient();
const PUBLISH_JOB_ID = 'cmruapucc0071pxwrnr9q04c2';
const DRAFT_ID = 'cmru9temu000210k0rs6tiicq';
const KEEP_AGENT_JOB = 'cmrub6g0d00b5pxwrad9dot8m';

async function main() {
  await opsBrowserCommand('release', 'comp-da-nang', 'worker-LinhMSC-vps');

  const running = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'running'] },
      payload: { path: ['publishJobId'], equals: PUBLISH_JOB_ID },
    },
  });
  for (const j of running) {
    await p.agentJob.update({
      where: { id: j.id },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: 'h0-already-published-on-group',
      },
    });
  }

  // Cancel stale dupes for same channel
  const dupes = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'running'] },
      id: { notIn: running.map(r => r.id) },
      OR: [
        { payload: { path: ['publishJobId'], equals: PUBLISH_JOB_ID } },
        { missionId: 'cmrsz3njc0313md6butocitfp' },
      ],
    },
  });
  for (const j of dupes) {
    await p.agentJob.update({
      where: { id: j.id },
      data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'h0-dedupe-cancel' },
    });
  }

  await p.socialPublishJob.update({
    where: { id: PUBLISH_JOB_ID },
    data: {
      status: 'published',
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      result: {
        missionId: 'cmrsz3njc0313md6butocitfp',
        destinationKey: 'facebook_group',
        publishedUrl: 'https://www.facebook.com/groups/963273993759414',
        note: 'operator-confirmed-live',
      },
    },
  });

  await p.socialPostDraft.update({
    where: { id: DRAFT_ID },
    data: { status: 'published' },
  });

  console.log(JSON.stringify({
    ok: true,
    cancelled: [...running, ...dupes].map(j => j.id),
    publishJob: PUBLISH_JOB_ID,
  }, null, 2));
  await p.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
