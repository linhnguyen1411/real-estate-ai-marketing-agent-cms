import { prisma } from '../server/prisma';

async function main() {
  const markerText = 'executive-v21-test';

  const [jobsRaw] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count
     FROM agent_jobs
     WHERE (error_message ILIKE $1 OR payload::text ILIKE $1 OR result::text ILIKE $1)`,
    `%${markerText}%`,
  );
  const jobs = Number(jobsRaw?.count || 0n);

  const [findings, contents, logs, campaigns] = await Promise.all([
    prisma.agentFinding.count({
      where: {
        OR: [
          { title: { contains: markerText, mode: 'insensitive' } },
          { summary: { contains: markerText, mode: 'insensitive' } },
        ],
      },
    }),
    prisma.scannedContent.count({
      where: {
        OR: [
          { contentText: { contains: markerText, mode: 'insensitive' } },
          { canonicalUrl: { contains: markerText, mode: 'insensitive' } },
        ],
      },
    }),
    prisma.telegramDeliveryLog.count({
      where: {
        OR: [
          { findingId: { contains: markerText, mode: 'insensitive' } },
          { lastError: { contains: markerText, mode: 'insensitive' } },
        ],
      },
    }),
    prisma.socialCampaign.count({
      where: {
        name: { contains: markerText, mode: 'insensitive' },
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        result: jobs + findings + contents + logs + campaigns === 0 ? 'PASS' : 'FAIL',
        sideEffects: {
          jobs,
          findings,
          contents,
          deliveryLogs: logs,
          campaigns,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
