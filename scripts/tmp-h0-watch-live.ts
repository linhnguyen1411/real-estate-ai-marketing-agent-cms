import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const agentId = process.env.H0_AGENT_JOB_ID || 'cmru0nnke006e13x4957e3e0t';
  const publishJobId = process.env.H0_PUBLISH_JOB_ID || 'cmrtzh1et0001x8tchl2v4jqp';
  const a = await p.agentJob.findUnique({ where: { id: agentId } });
  const s = await p.socialPublishJob.findUnique({ where: { id: publishJobId } });
  const draft = s
    ? await p.socialPostDraft.findUnique({
        where: { id: s.draftId },
        select: { id: true, status: true },
      })
    : null;
  console.log(
    JSON.stringify(
      {
        agent: a
          ? {
              id: a.id,
              status: a.status,
              claimedBy: a.claimedBy,
              error: a.errorMessage,
              result: a.result,
              updatedAt: a.updatedAt,
            }
          : null,
        social: s
          ? {
              id: s.id,
              status: s.status,
              claimedBy: s.claimedBy,
              error: s.errorMessage,
              result: s.result,
              updatedAt: s.updatedAt,
            }
          : null,
        draft,
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
