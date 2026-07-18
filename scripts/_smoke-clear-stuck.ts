import { prisma } from '../server/prisma';

/** Cancel active scan + publish jobs so smoke can claim cleanly. */
async function main() {
  const scans = await prisma.agentJob.updateMany({
    where: {
      type: 'scan_source',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
      errorMessage: 'cancelled_for_automation_smoke',
      claimedBy: null,
    },
  });
  const agents = await prisma.agentJob.updateMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
      errorMessage: 'cancelled before smoke rerun',
      claimedBy: null,
    },
  });
  const pubs = await prisma.socialPublishJob.updateMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      errorMessage: 'cancelled before smoke rerun',
      claimedBy: null,
    },
  });
  console.log(JSON.stringify({ scans: scans.count, agents: agents.count, pubs: pubs.count }));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
