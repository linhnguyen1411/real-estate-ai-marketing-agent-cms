import { prisma } from '../server/prisma';

async function main() {
  const run = await prisma.agentMissionRun.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      mission: { select: { id: true, name: true, templateKey: true } },
      jobs: { select: { id: true, status: true, missionRunId: true, sourceId: true }, take: 8 },
    },
  });
  if (!run) {
    console.log(JSON.stringify({ run: null }));
    return;
  }
  const steps = await prisma.agentWorkflowStepRun.groupBy({
    by: ['stepType', 'status'],
    where: { missionRunId: run.id },
    _count: { _all: true },
  });
  const sampleSteps = await prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId: run.id },
    orderBy: { createdAt: 'asc' },
    take: 12,
    select: {
      stepId: true,
      stepType: true,
      status: true,
      scannedContentId: true,
      findingId: true,
      durationMs: true,
    },
  });
  const findings = await prisma.agentFinding.count({ where: { missionRunId: run.id } });
  console.log(
    JSON.stringify(
      {
        run: {
          id: run.id,
          status: run.status,
          mission: run.mission,
          startedAt: run.startedAt,
          metrics: run.metrics,
          jobSample: run.jobs,
        },
        steps,
        sampleSteps,
        findings,
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
  .finally(async () => {
    await prisma.$disconnect();
  });
