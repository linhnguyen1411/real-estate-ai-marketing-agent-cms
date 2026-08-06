#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const jobId = 'cmrvt32lh03wjccmgu4yp9o59';
  const agentJobId = 'cmrvt32ml03woccmgsjatcan2';

  const job = await p.socialPublishJob.findUnique({
    where: { id: jobId },
    include: {
      draft: { select: { id: true, title: true, status: true, body: true } },
      channel: true,
      publishAttempts: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  const agent = await p.agentJob.findUnique({ where: { id: agentJobId } });

  const stepRuns = agent?.missionRunId
    ? await p.agentWorkflowStepRun.findMany({
        where: { missionRunId: agent.missionRunId },
        orderBy: { createdAt: 'asc' },
        select: {
          stepType: true,
          status: true,
          output: true,
          errorMessage: true,
          createdAt: true,
        },
      })
    : [];

  console.log(
    JSON.stringify(
      {
        job: job
          ? {
              id: job.id,
              status: job.status,
              scheduledAt: job.scheduledAt,
              completedAt: job.completedAt,
              result: job.result,
              errorCode: job.errorCode,
              errorMessage: job.errorMessage,
              channel: {
                id: job.channel?.id,
                name: job.channel?.name,
                type: job.channel?.type,
                profileUrl: job.channel?.profileUrl,
              },
              draftTitle: job.draft?.title,
              bodyPreview: (job.draft?.body || '').slice(0, 120),
            }
          : null,
        agent: agent
          ? {
              id: agent.id,
              status: agent.status,
              result: agent.result,
              payload: agent.payload,
              missionRunId: agent.missionRunId,
              errorMessage: agent.errorMessage,
            }
          : null,
        steps: stepRuns,
      },
      null,
      2,
    ),
  );
  await p.$disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
