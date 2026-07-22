/**
 * Prod snapshot: scheduled / in-flight social publish jobs + drafts.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const now = new Date();

  const scheduledDrafts = await p.socialPostDraft.findMany({
    where: { status: { in: ['scheduled', 'approved', 'publishing', 'queued'] } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      companyId: true,
      updatedAt: true,
      createdAt: true,
      body: true,
    },
  });

  const jobs = await p.socialPublishJob.findMany({
    where: {
      OR: [
        { status: { in: ['queued', 'claimed', 'preparing', 'publishing', 'failed'] } },
        { scheduledAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      ],
    },
    orderBy: { scheduledAt: 'desc' },
    take: 30,
    include: {
      channel: { select: { id: true, name: true, type: true } },
      draft: { select: { id: true, status: true } },
    },
  });

  const upcoming = await p.socialPublishJob.findMany({
    where: {
      status: 'queued',
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    include: {
      channel: { select: { name: true, type: true } },
      draft: { select: { id: true, status: true } },
    },
  });

  const dueQueued = await p.socialPublishJob.findMany({
    where: {
      status: 'queued',
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    include: {
      channel: { select: { name: true, type: true } },
      draft: { select: { id: true, status: true } },
    },
  });

  const recentPublished = await p.socialPublishJob.findMany({
    where: { status: 'published' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      channel: { select: { name: true, type: true } },
      draft: { select: { id: true, status: true } },
    },
  });

  const counts = await p.socialPublishJob.groupBy({
    by: ['status'],
    _count: true,
  });

  const draftCounts = await p.socialPostDraft.groupBy({
    by: ['status'],
    _count: true,
  });

  const activeAgents = await p.agentJob.findMany({
    where: {
      type: 'publish_social',
      status: { in: ['queued', 'claimed', 'running'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      status: true,
      attempts: true,
      claimedBy: true,
      errorMessage: true,
      payload: true,
      updatedAt: true,
      availableAt: true,
    },
  });

  const slim = (j: (typeof jobs)[0]) => ({
    id: j.id,
    status: j.status,
    scheduledAt: j.scheduledAt,
    channel: j.channel ? `${j.channel.type}:${j.channel.name}` : null,
    draftId: j.draftId,
    draftStatus: j.draft?.status,
    claimedBy: j.claimedBy,
    error: j.errorMessage,
    updatedAt: j.updatedAt,
  });

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        jobStatusCounts: counts,
        draftStatusCounts: draftCounts,
        upcomingScheduled: upcoming.map(slim),
        dueStillQueued: dueQueued.map(slim),
        recentPublished: recentPublished.map(j => ({
          ...slim(j),
          completedAt: j.completedAt,
        })),
        openDrafts: scheduledDrafts.map(d => ({
          id: d.id,
          status: d.status,
          updatedAt: d.updatedAt,
          preview: (d.body || '').slice(0, 80),
        })),
        activePublishAgentJobs: activeAgents,
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
