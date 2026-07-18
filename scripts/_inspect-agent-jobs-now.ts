import { prisma } from '../server/prisma';

const g = await prisma.agentJob.groupBy({
  by: ['status'],
  where: { type: 'scan_source' },
  _count: true,
});
const active = await prisma.agentJob.findMany({
  where: {
    type: 'scan_source',
    status: { in: ['queued', 'claimed', 'running'] },
  },
  select: {
    id: true,
    status: true,
    sourceId: true,
    claimedBy: true,
    startedAt: true,
    errorMessage: true,
  },
  orderBy: { createdAt: 'asc' },
});
const sess = await prisma.browserSession.findFirst({
  orderBy: { lastHeartbeatAt: 'desc' },
  select: { workerId: true, status: true, lastHeartbeatAt: true },
});
console.log(JSON.stringify({ statuses: g, activeCount: active.length, active, sess }, null, 2));
await prisma.$disconnect();
