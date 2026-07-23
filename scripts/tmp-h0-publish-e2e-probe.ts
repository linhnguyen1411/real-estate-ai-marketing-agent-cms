/**
 * H0.3 — VPS publish schedule readiness probe (read-only).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const now = new Date();
  const [drafts, jobs, agentJobs] = await Promise.all([
    p.socialPostDraft.groupBy({ by: ['status'], _count: true }),
    p.socialPublishJob.groupBy({ by: ['status'], _count: true }),
    p.agentJob.groupBy({
      by: ['status', 'type'],
      _count: true,
      where: { type: 'publish_social' },
    }),
  ]);

  const due = await p.socialPublishJob.findMany({
    where: { status: 'queued', scheduledAt: { lte: now } },
    take: 10,
    select: { id: true, scheduledAt: true, draftId: true, channelId: true },
  });

  const recentPublish = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: { id: true, status: true, claimedBy: true, payload: true, updatedAt: true },
  });

  let health: unknown = null;
  try {
    health = await fetch('http://127.0.0.1:3025/api/health').then(r => r.json());
  } catch (e) {
    health = { error: e instanceof Error ? e.message : String(e) };
  }

  console.log(
    JSON.stringify(
      {
        drafts,
        publishJobs: jobs,
        publishAgentJobs: agentJobs,
        duePublishJobs: due,
        recentPublishJobs: recentPublish.map(j => {
          const payload = (j.payload || {}) as Record<string, unknown>;
          return {
            id: j.id,
            status: j.status,
            claimedBy: j.claimedBy,
            ownerAgent: payload.ownerAgent ?? null,
            ownerMachine: payload.ownerMachine ?? null,
            leaseUntil: payload.leaseUntil ?? null,
            hasPlannerDecision: Boolean(payload.plannerDecision),
            updatedAt: j.updatedAt,
          };
        }),
        health,
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
