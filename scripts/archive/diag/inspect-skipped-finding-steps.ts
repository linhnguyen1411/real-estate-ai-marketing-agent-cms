import { prisma } from '../server/prisma';

async function main() {
  const skipped = await prisma.agentWorkflowStepRun.findMany({
    where: { stepType: 'create_lead_intelligence', status: 'skipped' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, output: true, scannedContentId: true, missionRunId: true },
  });
  console.log(JSON.stringify(skipped, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
