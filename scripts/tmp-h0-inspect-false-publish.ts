/**
 * Inspect published job evidence / result for false-positive analysis.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const id = 'cmrtzh1et0001x8tchl2v4jqp';
  const job = await p.socialPublishJob.findUnique({
    where: { id },
    include: {
      channel: true,
      draft: { select: { id: true, status: true, body: true } },
      publishAttempts: { orderBy: { attemptNumber: 'desc' }, take: 5 },
    },
  });
  const agent = await p.agentJob.findFirst({
    where: { type: 'publish_social', payload: { path: ['publishJobId'], equals: id } },
    orderBy: { updatedAt: 'desc' },
  });

  const result = job?.result as Record<string, unknown> | null;
  const raw = result?.raw as Record<string, unknown> | undefined;
  const data = (raw?.data || result) as Record<string, unknown> | undefined;

  console.log(
    JSON.stringify(
      {
        jobStatus: job?.status,
        completedAt: job?.completedAt,
        channel: job?.channel
          ? { id: job.channel.id, type: job.channel.type, name: job.channel.name, profileUrl: job.channel.profileUrl }
          : null,
        draftPreview: job?.draft?.body?.slice(0, 120),
        externalPostId: result?.externalPostId ?? result?.facebookPostId,
        externalUrl: result?.externalUrl,
        publishedUrl: data?.publishedUrl,
        reason: data?.reason,
        permalinkResolved: data?.permalinkResolved,
        clicked: data?.clicked,
        agentStatus: agent?.status,
        agentResultKeys: agent?.result && typeof agent.result === 'object' ? Object.keys(agent.result as object) : null,
        attempts: job?.publishAttempts?.map(a => ({
          n: a.attemptNumber,
          status: a.status,
          error: a.errorMessage,
          finishedAt: a.finishedAt,
        })),
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
  .finally(() => p.$disconnect());
