/**
 * Enqueue all local AgentSource rows as source_upsert → VPS, then flush outbox.
 *
 *   npx tsx scripts/sync-sources-to-vps.ts
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { ensureDatabaseReady } from '../server/dbHelper';
import { enqueueSourceUpsertSync } from '../server/agentSync/enqueue';
import { flushAgentSyncOutbox } from '../server/agentSync/outboxWorker';

async function main() {
  process.env.AGENT_LOCAL_SYNC_ENABLED = 'true';
  await ensureDatabaseReady();

  const sources = await prisma.agentSource.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, status: true, url: true },
  });
  console.log(`Sources to sync: ${sources.length}`);

  let ok = 0;
  let fail = 0;
  for (const s of sources) {
    const r = await enqueueSourceUpsertSync({ sourceId: s.id, kickFlush: false });
    console.log(`- ${s.name} [${s.status}] →`, r.enqueued ? 'enqueued' : r.reason);
    if (r.enqueued) ok += 1;
    else fail += 1;
  }

  const flush = await flushAgentSyncOutbox(50);
  console.log('ENQUEUED', { ok, fail });
  console.log('FLUSH', flush);

  // Extra flushes if batch limited
  for (let i = 0; i < 5; i++) {
    const again = await flushAgentSyncOutbox(50);
    if (!again.processed) break;
    console.log('FLUSH+', again);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
