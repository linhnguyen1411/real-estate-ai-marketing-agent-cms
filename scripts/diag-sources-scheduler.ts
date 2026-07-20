import { prisma } from '../server/prisma';

async function main() {
  const sources = await prisma.agentSource.findMany({
    where: { status: 'active' },
    orderBy: { nextScanAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      nextScanAt: true,
      lastScannedAt: true,
      scanIntervalMinutes: true,
      lastError: true,
    },
  });
  const now = Date.now();
  console.log('active sources', sources.length);
  let due = 0;
  for (const s of sources) {
    const dueFlag = !s.nextScanAt || s.nextScanAt.getTime() <= now;
    if (dueFlag) due++;
    console.log(
      JSON.stringify({
        name: s.name.slice(0, 50),
        intervalMin: s.scanIntervalMinutes,
        nextScanAt: s.nextScanAt,
        due: dueFlag,
        lastScannedAt: s.lastScannedAt,
        lastError: s.lastError?.slice(0, 80) || null,
      }),
    );
  }
  console.log('due now', due);
  console.log('AGENT_ENABLED=', process.env.AGENT_ENABLED);
  console.log('AGENT_SCHEDULER_ENABLED=', process.env.AGENT_SCHEDULER_ENABLED);

  try {
    const r = await fetch('http://localhost:3000/api/health');
    const j = (await r.json()) as {
      scheduler?: unknown;
      agent?: unknown;
    };
    console.log('health.scheduler=', JSON.stringify(j.scheduler ?? j.agent ?? j, null, 2).slice(0, 800));
  } catch (e) {
    console.log('health fetch failed', e instanceof Error ? e.message : e);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
