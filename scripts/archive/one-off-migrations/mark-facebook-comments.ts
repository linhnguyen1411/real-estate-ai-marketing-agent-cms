#!/usr/bin/env node
/**
 * Dry-run: find previously mis-saved Facebook comments in ScannedContent and
 * (with --apply) mark them ignored. NEVER hard-deletes.
 *
 * Heuristic for a misclassified comment (from the old page-level parser):
 *   - source is a facebook_group source, AND
 *   - the row has no post permalink identity — canonicalUrl lacks /posts/,
 *     /permalink or story_fbid AND externalId is null.
 * Real posts always carry a permalink/story id under the new parser.
 *
 * Usage:
 *   npx tsx scripts/mark-facebook-comments.ts                 # dry-run (report only)
 *   npx tsx scripts/mark-facebook-comments.ts --sourceId=xxx  # scope to one source
 *   npx tsx scripts/mark-facebook-comments.ts --limit=200
 *   npx tsx scripts/mark-facebook-comments.ts --apply         # actually update
 *
 * On --apply each candidate is updated to:
 *   status = 'ignored'
 *   rawData.analysis.ignoreReason = 'facebook_comment_misclassified'
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const POST_IDENTITY = /\/posts\/|\/permalink|story_fbid/i;

function looksLikeComment(row: {
  externalId: string | null;
  canonicalUrl: string;
}): boolean {
  if (row.externalId && row.externalId.trim()) return false;
  return !POST_IDENTITY.test(row.canonicalUrl || '');
}

async function main() {
  await ensureDatabaseReady();
  const apply = hasFlag('apply');
  const sourceId = argValue('sourceId');
  const limit = Math.max(1, Math.min(5000, Number(argValue('limit') || 1000) || 1000));

  // Restrict to facebook_group sources.
  const fbSources = await prisma.agentSource.findMany({
    where: { type: 'facebook_group', ...(sourceId ? { id: sourceId } : {}) },
    select: { id: true, name: true },
  });
  const sourceIds = fbSources.map(s => s.id);
  if (sourceIds.length === 0) {
    console.log('No facebook_group sources found.');
    await prisma.$disconnect();
    return;
  }

  const rows = await prisma.scannedContent.findMany({
    where: {
      sourceId: { in: sourceIds },
      status: { not: 'ignored' },
    },
    select: {
      id: true,
      sourceId: true,
      externalId: true,
      canonicalUrl: true,
      contentText: true,
      rawData: true,
    },
    orderBy: { collectedAt: 'desc' },
    take: limit,
  });

  const candidates = rows.filter(looksLikeComment);

  console.log('\n=== Facebook comment misclassification sweep ===');
  console.log(`Mode:          ${apply ? 'APPLY (will update)' : 'DRY-RUN (report only)'}`);
  console.log(`FB sources:    ${sourceIds.length}`);
  console.log(`Rows scanned:  ${rows.length} (limit ${limit})`);
  console.log(`Candidates:    ${candidates.length}\n`);

  const preview = candidates.slice(0, 15);
  for (const c of preview) {
    const excerpt = (c.contentText || '').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`  - ${c.id}  url=${c.canonicalUrl.slice(0, 60)}  "${excerpt}"`);
  }
  if (candidates.length > preview.length) {
    console.log(`  ... and ${candidates.length - preview.length} more`);
  }

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to mark these as ignored.\n');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const c of candidates) {
    const raw = (c.rawData && typeof c.rawData === 'object' ? c.rawData : {}) as Record<
      string,
      unknown
    >;
    const analysis = (raw.analysis && typeof raw.analysis === 'object'
      ? raw.analysis
      : {}) as Record<string, unknown>;
    const nextRaw = {
      ...raw,
      analysis: { ...analysis, ignoreReason: 'facebook_comment_misclassified' },
    };
    await prisma.scannedContent.update({
      where: { id: c.id },
      data: { status: 'ignored', rawData: nextRaw as never },
    });
    updated += 1;
  }

  console.log(`\nUpdated ${updated} row(s) → status=ignored (facebook_comment_misclassified).\n`);
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
