/**
 * One-shot: fleet/session/job status diagnosis
 */
import { prisma } from '../server/prisma';

async function main() {
  const sessions = await prisma.browserSession.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      workerId: true,
      lastHeartbeatAt: true,
      currentUrl: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  console.log('=== BrowserSessions count=', sessions.length);

  const byStatus: Record<string, number> = {};
  const byWorker: Record<string, number> = {};
  for (const s of sessions) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const w = s.workerId || `(no-worker:${s.id.slice(0, 8)})`;
    byWorker[w] = (byWorker[w] || 0) + 1;
  }
  console.log('byStatus', byStatus);
  console.log('unique workerId keys=', Object.keys(byWorker).length);
  console.log(
    'top workerIds',
    Object.entries(byWorker)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );

  const now = Date.now();
  const onlineish = sessions.filter(
    s => s.lastHeartbeatAt && now - s.lastHeartbeatAt.getTime() < 60_000,
  );
  console.log('heartbeat <60s =', onlineish.length);
  for (const s of onlineish.slice(0, 10)) {
    console.log(
      JSON.stringify({
        id: s.id.slice(0, 10),
        name: s.name,
        status: s.status,
        workerId: s.workerId,
        hbAgeSec: Math.round((now - (s.lastHeartbeatAt?.getTime() || 0)) / 1000),
        url: s.currentUrl?.slice(0, 48) || null,
      }),
    );
  }

  console.log('\n=== Recent 15 sessions (any)');
  for (const s of sessions.slice(0, 15)) {
    const age = s.lastHeartbeatAt
      ? Math.round((now - s.lastHeartbeatAt.getTime()) / 1000)
      : null;
    console.log(
      JSON.stringify({
        id: s.id.slice(0, 10),
        name: s.name,
        status: s.status,
        workerId: s.workerId,
        hbAgeSec: age,
      }),
    );
  }

  const jobs = await prisma.agentJob.groupBy({ by: ['status'], _count: true });
  console.log('\n=== Jobs by status', jobs);

  const active = await prisma.agentJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'running'] } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      status: true,
      claimedBy: true,
      startedAt: true,
      attempts: true,
      missionId: true,
      updatedAt: true,
    },
  });
  console.log('Active jobs=', active.length);
  for (const j of active) {
    console.log(
      JSON.stringify({
        id: j.id.slice(0, 10),
        type: j.type,
        status: j.status,
        claimedBy: j.claimedBy,
        attempts: j.attempts,
        startedAt: j.startedAt,
      }),
    );
  }

  const missions = await prisma.agentMissionRun.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('\n=== MissionRuns', missions);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
