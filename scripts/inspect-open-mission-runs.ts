import { prisma } from '../server/prisma';

async function main() {
  const open = await prisma.agentMissionRun.findMany({
    where: { status: { in: ['queued', 'running'] } },
    select: { id: true, status: true, missionId: true, startedAt: true, createdAt: true },
  });
  const activeMissionJobs = await prisma.agentJob.findMany({
    where: {
      missionRunId: { not: null },
      status: { in: ['queued', 'claimed', 'running'] },
    },
    select: { id: true, missionRunId: true, status: true, sourceId: true },
  });
  console.log(JSON.stringify({ openMissionRuns: open, activeMissionJobs }, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
