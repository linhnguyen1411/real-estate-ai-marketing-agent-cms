#!/usr/bin/env node
/**
 * Re-analyze ScannedContent through Scanner 2.0 finding pipeline (dry-run by default).
 * Usage:
 *   npm run agent:reanalyze-scanner-v2
 *   npm run agent:reanalyze-scanner-v2 -- --apply --limit 20 --include-findings
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || null : null;
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const apply = has('--apply');
  const limit = Math.max(1, Number(arg('--limit') || 20));
  const sourceId = arg('--source-id');
  const since = arg('--since');
  const includeFindings = has('--include-findings');

  console.log(`[reanalyze-scanner-v2] dryRun=${!apply} limit=${limit}`);

  const where: Record<string, unknown> = {};
  if (sourceId) where.sourceId = sourceId;
  if (since) where.collectedAt = { gte: new Date(since) };
  if (!includeFindings) {
    where.status = { in: ['collected', 'ignored', 'blocked', 'needs_review', 'analyzed'] };
  }

  const contents = await prisma.scannedContent.findMany({
    where,
    orderBy: { collectedAt: 'desc' },
    take: limit,
    include: {
      source: true,
      findings: { select: { id: true, status: true }, take: 5 },
    },
  });

  let wouldRun = 0;
  let applied = 0;
  let created = 0;
  let blocked = 0;

  for (const content of contents) {
    wouldRun += 1;
    const title =
      content.authorName ||
      content.canonicalUrl?.slice(0, 80) ||
      'Scanned content';

    if (!apply) {
      console.log(`- would reanalyze ${content.id} status=${content.status} findings=${content.findings.length}`);
      continue;
    }

    const result = await processFindingForContent({
      content,
      source: content.source,
      mission: null,
      title,
      analysisBudget: { used: 0, max: 3 },
    });

    applied += 1;
    if (result.findingCreated) created += 1;
    if (result.filterStage === 'blocked' || result.filterStage === 'spam_ignored') blocked += 1;
    console.log(
      `- ${content.id} → stage=${result.filterStage} finding=${result.findingCreated} score=${result.finalScore ?? result.score}`,
    );
  }

  console.log(
    `\nImpact: candidates=${contents.length} wouldRun=${wouldRun} applied=${applied} findingsCreated=${created} blocked=${blocked}`,
  );
  console.log('Lifecycle consumed/dismissed findings are not hard-deleted by this script.');
  if (!apply) console.log('Re-run with --apply to execute.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
