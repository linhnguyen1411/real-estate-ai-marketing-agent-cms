/**
 * Enqueue scan jobs cho tất cả active sources rồi chạy worker.
 * Usage: npx tsx scripts/enqueue-and-run-worker.ts
 */
import 'dotenv/config';

// Force local mode (NOT stateless)
process.env.EXECUTION_AGENT_STATELESS = '0';

import { prisma } from '../server/prisma.ts';
import { enqueueSourceScan } from '../server/agent/agentJobService.ts';

async function enqueueAll() {
  console.log('=== ENQUEUE SCAN JOBS ===');
  const sources = await prisma.agentSource.findMany({ where: { status: 'active' } });
  console.log(`Active sources: ${sources.length}`);

  let enqueued = 0;
  for (const s of sources) {
    try {
      const res = await enqueueSourceScan({
        sourceId: s.id,
        companyId: s.companyId || 'comp-da-nang',
        triggeredByUserId: 'cli-admin',
      });
      console.log(` ✅ ${s.name} → Job ${res.jobId}`);
      enqueued++;
    } catch (err: any) {
      console.log(` ⏭️  ${s.name}: ${err.message}`);
    }
  }

  const queued = await prisma.agentJob.count({ where: { status: 'queued' } });
  console.log(`\nEnqueued: ${enqueued} | Total queued: ${queued}`);
  await prisma.$disconnect();
}

enqueueAll().catch(console.error);
