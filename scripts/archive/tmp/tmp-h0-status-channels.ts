import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const publishJobId = 'cmrtzh1et0001x8tchl2v4jqp';
  const social = await p.socialPublishJob.findUnique({ where: { id: publishJobId } });
  const agent = await p.agentJob.findFirst({
    where: { type: 'publish_social', payload: { path: ['publishJobId'], equals: publishJobId } },
    orderBy: { updatedAt: 'desc' },
  });
  const draft = social
    ? await p.socialPostDraft.findUnique({
        where: { id: social.draftId },
        include: { media: true },
      })
    : null;
  const timelineChannels = await p.socialChannel.findMany({
    where: {
      isActive: true,
      OR: [{ type: 'facebook_profile' }, { type: 'facebook_timeline' }, { type: { contains: 'timeline' } }],
    },
    select: { id: true, name: true, type: true, profileUrl: true, config: true, executionMode: true },
  });
  const allTypes = await p.socialChannel.groupBy({
    by: ['type'],
    where: { isActive: true },
    _count: true,
  });
  console.log(
    JSON.stringify(
      {
        social: social
          ? { id: social.id, status: social.status, error: social.errorMessage, result: social.result }
          : null,
        agent: agent
          ? {
              id: agent.id,
              status: agent.status,
              attempts: agent.attempts,
              error: agent.errorMessage,
              result: agent.result,
            }
          : null,
        draft: draft
          ? {
              id: draft.id,
              status: draft.status,
              mediaCount: draft.media.length,
              media: draft.media.map(m => ({ type: m.type, fileUrl: m.fileUrl })),
            }
          : null,
        timelineChannels,
        allTypes,
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
