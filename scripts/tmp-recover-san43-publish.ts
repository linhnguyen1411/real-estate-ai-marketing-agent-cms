#!/usr/bin/env node
/** Cancel duplicate queued publish agent jobs for Sàn 43, keep one retry. */
import { PrismaClient } from '@prisma/client';
import { clearOwnershipFromPayload } from '../server/modules/control-plane/fleet-orchestrator/jobOwnership';
import { opsBrowserCommand } from '../server/modules/control-plane/operationsService';

const p = new PrismaClient();
const PUBLISH_JOB_ID = 'cmruapucc0071pxwrnr9q04c2';
const KEEP_AGENT_JOB = 'cmrub6g0d00b5pxwrad9dot8m';
const DRAFT_ID = 'cmru9temu000210k0rs6tiicq';

async function main() {
  await opsBrowserCommand('release', 'comp-da-nang', 'worker-LinhMSC-vps');

  const dupes = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'running', 'failed'] },
      id: { not: KEEP_AGENT_JOB },
      payload: { path: ['publishJobId'], equals: PUBLISH_JOB_ID },
    },
  });
  for (const j of dupes) {
    await p.agentJob.update({
      where: { id: j.id },
      data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'h0-dedupe-cancel' },
    });
  }

  // Also cancel stale running dupes with same mission/publish from scheduler retries
  const staleRunning = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: 'running',
      id: { not: KEEP_AGENT_JOB },
      OR: [
        { payload: { path: ['publishJobId'], equals: PUBLISH_JOB_ID } },
        { missionId: 'cmrsz3njc0313md6butocitfp' },
      ],
    },
  });
  for (const j of staleRunning) {
    await p.agentJob.update({
      where: { id: j.id },
      data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'h0-stale-running-cancel' },
    });
  }

  const aj = await p.agentJob.findUnique({ where: { id: KEEP_AGENT_JOB } });
  if (!aj) throw new Error('missing agent job');

  await p.agentJob.update({
    where: { id: KEEP_AGENT_JOB },
    data: {
      status: 'queued',
      claimedBy: null,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      attempts: 0,
      availableAt: new Date(Date.now() - 5_000),
      payload: clearOwnershipFromPayload(aj.payload),
    },
  });

  await p.socialPublishJob.update({
    where: { id: PUBLISH_JOB_ID },
    data: {
      status: 'queued',
      scheduledAt: new Date(Date.now() - 5_000),
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
    },
  });

  await p.socialPostDraft.update({ where: { id: DRAFT_ID }, data: { status: 'scheduled' } });

  console.log(JSON.stringify({ ok: true, cancelled: dupes.map(d => d.id) }, null, 2));
  await p.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
