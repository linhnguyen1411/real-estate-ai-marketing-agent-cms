import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const findingId = 'cmrmuc80x003mle0hig5nygka';
  const f = await p.agentFinding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      missionId: true,
      missionRunId: true,
      classification: true,
      title: true,
      companyId: true,
    },
  });
  const buyerSteps = await p.agentWorkflowStepRun.findMany({
    where: { missionRunId: 'cmrmuavym0004hhytpedqy9fh' },
    orderBy: { createdAt: 'asc' },
    select: { stepId: true, stepType: true, status: true, findingId: true },
  });
  const brandSteps = await p.agentWorkflowStepRun.findMany({
    where: { missionRunId: 'cmrmuavyr0008hhytxv2l32op' },
    orderBy: { createdAt: 'asc' },
    select: { stepId: true, stepType: true, status: true },
  });
  const brandFindings = await p.agentFinding.count({
    where: { missionRunId: 'cmrmuavyr0008hhytxv2l32op' },
  });
  const supplyInv = await p.externalInventoryItem.findUnique({
    where: { id: 'cmrmucbpi004fle0hrcsajr20' },
    select: { id: true, scannedContentId: true, status: true, title: true },
  });

  let telegram: unknown = null;
  try {
    telegram = await p.$queryRawUnsafe(
      `SELECT id, status, created_at FROM agent_telegram_deliveries WHERE finding_id = $1 LIMIT 5`,
      findingId,
    );
  } catch (e) {
    telegram = { error: e instanceof Error ? e.message.slice(0, 160) : 'query_failed' };
  }

  console.log(
    JSON.stringify(
      { f, buyerSteps, brandSteps, brandFindings, supplyInv, telegram },
      null,
      2,
    ),
  );
}

main().finally(() => p.$disconnect());
