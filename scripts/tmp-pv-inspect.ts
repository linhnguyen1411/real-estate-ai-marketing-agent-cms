/**
 * Publish Validation — inspect drafts/channels/media + latest jobs (VPS).
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const drafts = await p.socialPostDraft.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 8,
    select: {
      id: true,
      status: true,
      companyId: true,
      body: true,
      _count: { select: { media: true } },
    },
  });
  const channels = await p.socialChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true, profileUrl: true, config: true },
  });
  const open = await p.socialPublishJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    select: { id: true, status: true, scheduledAt: true, draftId: true },
  });
  console.log(JSON.stringify({ drafts, channels, open }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
