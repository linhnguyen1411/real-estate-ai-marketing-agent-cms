import { prisma } from '../server/prisma';

async function main() {
  const missionRunId = process.argv[2] || 'cmrppvhh7000d12ttzyu9w0p6';
  const steps = await prisma.agentWorkflowStepRun.findMany({
    where: { missionRunId },
    orderBy: { createdAt: 'asc' },
  });
  console.log(
    JSON.stringify(
      steps.map(s => ({
        stepId: s.stepId,
        stepType: s.stepType,
        status: s.status,
        attempts: s.attempts,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        output: s.output,
        durationMs: s.durationMs,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
