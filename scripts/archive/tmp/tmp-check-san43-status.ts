#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const PUBLISH_JOB = 'cmruapucc0071pxwrnr9q04c2';
const AGENT_JOB = 'cmrub6g0d00b5pxwrad9dot8m';

async function main() {
  const pj = await p.socialPublishJob.findUnique({
    where: { id: PUBLISH_JOB },
    include: { channel: true, draft: { select: { id: true, title: true, status: true } } },
  });
  const aj = await p.agentJob.findUnique({ where: { id: AGENT_JOB } });
  const queued = await p.agentJob.findMany({
    where: { type: 'publish_social', status: { in: ['queued', 'running', 'failed'] } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, status: true, attempts: true, errorMessage: true, updatedAt: true },
  });
  console.log(JSON.stringify({ publishJob: pj, agentJob: aj, recentPublishJobs: queued }, null, 2));
  await p.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
