/**
 * Backfill Lead Acquisition + Sales Layer for recent findings.
 * Run: npx tsx scripts/backfill-sales-layer.ts
 */
import { prisma } from '../server/prisma';
import { processLeadAcquisition } from '../server/modules/lead-acquisition';
import { processSalesLayer } from '../server/modules/sales-layer';

async function main() {
  const sinceHours = Number(process.env.BACKFILL_HOURS || 72);
  const limit = Number(process.env.BACKFILL_LIMIT || 300);
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const rows = await prisma.agentFinding.findMany({
    where: {
      createdAt: { gte: since },
      status: { notIn: ['duplicate', 'dismissed'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, title: true, extractedData: true },
  });

  let acqOk = 0;
  let buyers = 0;
  let salesOk = 0;
  let skipped = 0;
  for (const row of rows) {
    const ed = row.extractedData as Record<string, any> | null;
    if (ed?.salesLayer?.version === 'h35_v1' && ed?.leadAcquisition?.version === 'h3_v1') {
      skipped += 1;
      continue;
    }
    const acq = await processLeadAcquisition({ findingId: row.id, notifyTelegram: false });
    if (!acq) continue;
    acqOk += 1;
    if (!acq.isBuyer) continue;
    buyers += 1;
    const sales = await processSalesLayer({ findingId: row.id, notifyFollowUp: false });
    if (sales) salesOk += 1;
    console.log(
      `OK buyer ${row.id.slice(0, 10)} · ${acq.intent.intent} · ${sales?.pipelineStage || '—'} · ${row.title.slice(0, 40)}`,
    );
  }
  console.log(
    JSON.stringify({ scanned: rows.length, skipped, acqOk, buyers, salesOk, sinceHours, limit }, null, 2),
  );
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
