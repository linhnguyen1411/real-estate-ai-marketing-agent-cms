#!/usr/bin/env node
/**
 * Backfill deterministic extraction (phone / money / location / property) over
 * previously-saved Facebook ScannedContent — WITHOUT re-scanning Facebook.
 * Optionally re-runs analysis to create Findings for rows that still have none.
 *
 * Dry-run by default. Never hard-deletes. Never creates duplicate Findings
 * (processFindingForContent upserts by scannedContentId).
 *
 * Usage:
 *   npm run agent:backfill-facebook-content                       # dry-run report
 *   npm run agent:backfill-facebook-content -- --source-id=xxx
 *   npm run agent:backfill-facebook-content -- --limit=200
 *   npm run agent:backfill-facebook-content -- --apply            # write rawData.extracted
 *   npm run agent:backfill-facebook-content -- --apply --reanalyze # + analyze pending
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import { extractLeadData, toRawExtracted } from '../server/agent/extractors';
import { processFindingForContent } from '../server/agent-worker/services/findingRuleEngine';

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
  const apply = hasFlag('apply');
  const reanalyze = hasFlag('reanalyze');
  const sourceId = argValue('source-id') || argValue('sourceId');
  const limit = Math.max(1, Math.min(5000, Number(argValue('limit') || 500) || 500));

  const fbSources = await prisma.agentSource.findMany({
    where: { type: 'facebook_group', ...(sourceId ? { id: sourceId } : {}) },
    select: { id: true, name: true, type: true, config: true, companyId: true },
  });
  if (fbSources.length === 0) {
    console.log('No facebook_group sources found.');
    await prisma.$disconnect();
    return;
  }
  const sourceById = new Map(fbSources.map(s => [s.id, s]));

  const rows = await prisma.scannedContent.findMany({
    where: { sourceId: { in: [...sourceById.keys()] }, status: { not: 'ignored' } },
    orderBy: { collectedAt: 'desc' },
    take: limit,
  });

  console.log('\n=== Facebook content backfill ===');
  console.log(`Mode:         ${apply ? 'APPLY' : 'DRY-RUN'}${reanalyze ? ' + REANALYZE' : ''}`);
  console.log(`FB sources:   ${fbSources.length}`);
  console.log(`Rows:         ${rows.length} (limit ${limit})\n`);

  let extractedCount = 0;
  let withPhone = 0;
  let withMoney = 0;
  let withLocation = 0;
  let analyzed = 0;
  let findingsCreated = 0;

  for (const row of rows) {
    const d = extractLeadData(row.contentText || '');
    const raw = toRawExtracted(d);
    if (raw.primaryPhone) withPhone += 1;
    if (raw.money.length > 0) withMoney += 1;
    if (raw.location.primary) withLocation += 1;

    const hasFinding = await prisma.agentFinding.count({ where: { scannedContentId: row.id } });

    if (rows.indexOf(row) < 15) {
      const excerpt = (row.contentText || '').replace(/\s+/g, ' ').slice(0, 70);
      console.log(
        `  - ${row.id} phone=${raw.primaryPhone ?? '-'} ` +
          `money=${raw.money.length} loc=${raw.location.primary ?? '-'} ` +
          `class=${raw.classification} finding=${hasFinding > 0 ? 'Y' : 'N'} "${excerpt}"`,
      );
    }

    if (!apply) continue;

    const prevRaw = (row.rawData && typeof row.rawData === 'object' ? row.rawData : {}) as Record<string, unknown>;
    await prisma.scannedContent.update({
      where: { id: row.id },
      data: { rawData: { ...prevRaw, extracted: raw } as never },
    });
    extractedCount += 1;

    if (reanalyze && hasFinding === 0) {
      const source = sourceById.get(row.sourceId)!;
      const title = (prevRaw.title as string) || (row.contentText || '').slice(0, 120);
      try {
        const result = await processFindingForContent({
          content: { ...row, rawData: { ...prevRaw, extracted: raw } } as never,
          source: source as never,
          mission: null,
          title,
        });
        analyzed += 1;
        if (result.findingCreated) findingsCreated += 1;
      } catch (err) {
        console.warn(`    reanalyze failed for ${row.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`with phone:      ${withPhone}`);
  console.log(`with money:      ${withMoney}`);
  console.log(`with location:   ${withLocation}`);
  if (apply) {
    console.log(`rawData updated: ${extractedCount}`);
    if (reanalyze) {
      console.log(`analyzed:        ${analyzed}`);
      console.log(`findings created:${findingsCreated}`);
    }
  } else {
    console.log('\nDry-run only. Re-run with --apply (and optionally --reanalyze).');
  }
  console.log('');
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
