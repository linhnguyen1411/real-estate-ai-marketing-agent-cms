#!/usr/bin/env node
/**
 * Backfill lead findings for ScannedContent rows that have no AgentFinding yet.
 * Uses the new analysis pipeline (hybrid / ai_first — keyword no longer hard-gates AI).
 *
 * Usage:
 *   npx tsx scripts/backfill-lead-findings.ts
 *   npx tsx scripts/backfill-lead-findings.ts --limit=20
 *   npx tsx scripts/backfill-lead-findings.ts --sourceId=xxx
 *   npx tsx scripts/backfill-lead-findings.ts --dry-run
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';
import { getLeadAnalysisLimits } from '../server/agent/leadAnalyzer';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  await ensureDatabaseReady();
  const limit = Math.max(1, Math.min(500, Number(argValue('limit') || 50) || 50));
  const sourceId = argValue('sourceId');
  const dryRun = hasFlag('dry-run');

  const contents = await prisma.scannedContent.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
      findings: { none: {} },
    },
    orderBy: { collectedAt: 'desc' },
    take: limit,
    include: { source: true },
  });

  console.log(`\nBackfill lead findings`);
  console.log(`  candidates: ${contents.length} (limit=${limit})`);
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  analysis limits:`, getLeadAnalysisLimits());

  const budget = { used: 0, max: getLeadAnalysisLimits().maxPerJob * 5 };
  let created = 0;
  let ignored = 0;
  let analyzed = 0;

  for (const content of contents) {
    const title =
      content.authorName
        ? `${content.authorName}: ${content.contentText.slice(0, 80)}`
        : content.contentText.slice(0, 100);

    console.log(`\n— ${content.source.name} / ${content.id}`);
    console.log(`  text: ${content.contentText.slice(0, 100).replace(/\n/g, ' ')}`);

    if (dryRun) {
      console.log('  dry-run skip');
      continue;
    }

    const result = await processFindingForContent({
      content,
      source: content.source,
      mission: null,
      title,
      analysisBudget: budget,
    });

    if (result.findingCreated) created += 1;
    if (result.ignoredByRule) ignored += 1;
    if (result.analysisRan) analyzed += 1;

    console.log(
      `  stage=${result.filterStage} keyword=${result.keywordScore} ai=${result.aiScore ?? '—'} final=${result.finalScore} finding=${result.findingCreated} mode=${result.analysisMode}`,
    );
  }

  console.log(`\nDone. created=${created} ignored=${ignored} analyzed=${analyzed} budgetUsed=${budget.used}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
