/**
 * H0 — Force scheduler enqueue for due SocialPublishJobs (no feature change).
 */
import { enqueueDueSocialPublishJobs } from '../server/modules/social-publishing/jobService';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const result = await enqueueDueSocialPublishJobs(new Date());
  const jobId = 'cmrtzh1et0001x8tchl2v4jqp';
  const agents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      payload: { path: ['publishJobId'], equals: jobId },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, status: true, claimedBy: true, updatedAt: true, createdAt: true },
  });
  console.log(JSON.stringify({ enqueue: result, agents }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
