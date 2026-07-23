import { prisma } from '../server/prisma';

async function main() {
  const fails = await prisma.agentJob.findMany({
    where: {
      type: 'scan_source',
      status: 'failed',
    },
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: {
      id: true,
      status: true,
      claimedBy: true,
      errorMessage: true,
      attempts: true,
      startedAt: true,
      finishedAt: true,
      updatedAt: true,
      source: { select: { name: true } },
    },
  });
  console.log('=== Recent scan failures ===');
  for (const j of fails) {
    console.log(
      JSON.stringify({
        id: j.id.slice(0, 10),
        source: j.source?.name?.slice(0, 40),
        claimedBy: j.claimedBy,
        attempts: j.attempts,
        err: j.errorMessage?.slice(0, 160),
        updatedAt: j.updatedAt,
      }),
    );
  }

  const active = await prisma.agentJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'running'] } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      status: true,
      claimedBy: true,
      errorMessage: true,
      updatedAt: true,
    },
  });
  console.log('=== Active jobs ===', active.length);
  for (const j of active) {
    console.log(JSON.stringify(j));
  }

  const session = await prisma.browserSession.findFirst({
    where: { status: { not: 'offline' } },
    orderBy: { lastHeartbeatAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      workerId: true,
      lastHeartbeatAt: true,
      currentUrl: true,
      lastError: true,
      profilePath: true,
    },
  });
  console.log('=== Live session ===', JSON.stringify(session, null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
