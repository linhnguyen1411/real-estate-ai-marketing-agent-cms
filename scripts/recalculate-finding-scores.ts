#!/usr/bin/env tsx
/**
 * Recalculate AgentFinding scores (dry-run by default).
 * Usage: npm run agent:recalculate-finding-scores [-- --apply] [--limit=N]
 */
import { prisma } from '../server/prisma';
import { recalculateFindingScores } from '../server/agent/findingStructuredData';

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  return 'true';
}

async function main() {
  const apply = arg('apply') === 'true';
  const limit = Number(arg('limit') || 200);
  const sourceId = arg('source-id');

  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
      status: { not: 'dismissed' },
    },
    take: Number.isFinite(limit) ? limit : 200,
    orderBy: { createdAt: 'desc' },
    include: {
      scannedContent: true,
      source: { select: { id: true, name: true, type: true } },
    },
  });

  console.log(`Found ${rows.length} findings · mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  let updated = 0;
  for (const row of rows) {
    const finding = {
      ...row,
      budgetMin: row.budgetMin?.toString() ?? null,
      budgetMax: row.budgetMax?.toString() ?? null,
      askingPrice: row.askingPrice?.toString() ?? null,
    };
    const next = recalculateFindingScores(finding);
    const changed =
      next.finalScore !== row.finalScore ||
      next.scoreStatus !== row.scoreStatus ||
      next.leadFitScore !== row.leadFitScore ||
      next.aiScore !== row.aiScore;

    console.log(
      [
        row.id.slice(0, 8),
        row.classification || 'null',
        `legacyScore=${row.score}`,
        `final ${row.finalScore ?? 'null'}→${next.finalScore ?? 'null'}`,
        `status ${row.scoreStatus ?? 'null'}→${next.scoreStatus}`,
        changed ? 'CHANGED' : 'same',
      ].join(' | '),
    );

    if (apply && changed) {
      await prisma.agentFinding.update({
        where: { id: row.id },
        data: {
          keywordScore: next.keywordScore,
          aiScore: next.aiScore,
          leadFitScore: next.leadFitScore,
          finalScore: next.finalScore,
          scoreStatus: next.scoreStatus,
        },
      });
      updated += 1;
    }
  }

  console.log(`Done. updated=${updated}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
