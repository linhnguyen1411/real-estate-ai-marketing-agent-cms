/**
 * Backfill unsynced local agent data into AgentSyncOutbox.
 *
 * Usage:
 *   npx tsx scripts/enqueue-unsynced-data.ts              # dry-run
 *   npx tsx scripts/enqueue-unsynced-data.ts --apply --limit 20
 *   npx tsx scripts/enqueue-unsynced-data.ts --apply --contents-only
 *   npx tsx scripts/enqueue-unsynced-data.ts --apply --findings-only --include-ignored
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import {
  enqueueFindingUpsertSync,
  enqueueScannedContentSync,
  shouldEnqueueSync,
} from '../server/agentSync/enqueue';

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  process.env.AGENT_LOCAL_SYNC_ENABLED = process.env.AGENT_LOCAL_SYNC_ENABLED || 'true';
  await ensureDatabaseReady();

  const apply = hasFlag('--apply');
  const contentsOnly = hasFlag('--contents-only');
  const findingsOnly = hasFlag('--findings-only');
  const includeIgnored = hasFlag('--include-ignored');
  const limit = Math.max(1, Number(arg('--limit') || 50));
  const sourceId = arg('--source-id');
  const sinceRaw = arg('--since');
  const since = sinceRaw ? new Date(sinceRaw) : null;

  if (!shouldEnqueueSync() && apply) {
    console.warn(
      'WARNING: sync flags off (AGENT_LOCAL_SYNC_ENABLED / agent_sync_enabled). Enabling env for this run; ensure Settings.agent_sync_enabled=true.',
    );
    process.env.AGENT_LOCAL_SYNC_ENABLED = 'true';
  }

  const contentWhere: Record<string, unknown> = {
    syncStatus: { in: ['local_only', 'pending', 'failed'] },
    ...(sourceId ? { sourceId } : {}),
    ...(since ? { collectedAt: { gte: since } } : {}),
    ...(!includeIgnored ? { status: { notIn: ['archived'] } } : {}),
  };

  const findingWhere: Record<string, unknown> = {
    syncStatus: { in: ['local_only', 'pending', 'failed'] },
    ...(sourceId ? { sourceId } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  const [contentCount, findingCount, contents, findings] = await Promise.all([
    prisma.scannedContent.count({ where: contentWhere as never }),
    prisma.agentFinding.count({ where: findingWhere as never }),
    !findingsOnly
      ? prisma.scannedContent.findMany({
          where: contentWhere as never,
          orderBy: { collectedAt: 'desc' },
          take: limit,
          select: { id: true, status: true, syncStatus: true, contentText: true, collectedAt: true },
        })
      : Promise.resolve([]),
    !contentsOnly
      ? prisma.agentFinding.findMany({
          where: findingWhere as never,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: { id: true, title: true, syncStatus: true, finalScore: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const estBytes =
    contents.reduce((n, c) => n + (c.contentText?.length || 0), 0) + findings.length * 800;

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        syncFlagsOk: shouldEnqueueSync(),
        totals: { contentsUnsynced: contentCount, findingsUnsynced: findingCount },
        willEnqueue: { contents: contents.length, findings: findings.length },
        estimatedPayloadChars: estBytes,
        sampleContents: contents.slice(0, 5).map((c) => ({
          id: c.id,
          status: c.status,
          syncStatus: c.syncStatus,
          collectedAt: c.collectedAt,
        })),
        sampleFindings: findings.slice(0, 5).map((f) => ({
          id: f.id,
          title: f.title.slice(0, 80),
          syncStatus: f.syncStatus,
          finalScore: f.finalScore,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to enqueue.');
    await prisma.$disconnect();
    return;
  }

  let contentEnqueued = 0;
  let findingEnqueued = 0;
  for (const c of contents) {
    const r = await enqueueScannedContentSync({ scannedContentId: c.id, kickFlush: false });
    if (r.enqueued) contentEnqueued += 1;
  }
  for (const f of findings) {
    const r = await enqueueFindingUpsertSync({ findingId: f.id, kickFlush: false });
    if (r.enqueued) findingEnqueued += 1;
  }

  console.log(
    JSON.stringify(
      { applied: true, contentEnqueued, findingEnqueued, note: 'Outbox worker will flush shortly' },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
