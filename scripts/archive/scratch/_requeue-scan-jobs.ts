import { prisma } from '../server/prisma';

const r = await prisma.agentJob.updateMany({
  where: {
    type: 'scan_source',
    status: { in: ['queued', 'claimed', 'running'] },
  },
  data: {
    status: 'queued',
    claimedBy: null,
    claimedAt: null,
    startedAt: null,
    availableAt: new Date(),
    errorMessage: null,
  },
});
const n = await prisma.agentJob.count({
  where: { type: 'scan_source', status: 'queued' },
});
console.log(JSON.stringify({ reset: r.count, queuedScans: n }));
await prisma.$disconnect();
