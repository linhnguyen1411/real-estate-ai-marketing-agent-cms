import assert from 'node:assert/strict';
import { prisma } from '../server/prisma';
import { buildExecutiveSnapshot } from '../server/modules/executive-dashboard/executiveService';
import { evaluateSourceQuality } from '../server/modules/executive-dashboard/sourceQualityService';
import { scanSnapshotFakeMarkers } from '../server/modules/executive-dashboard/executiveIntegrityService';

async function main() {
  const summary: Record<string, 'PASS' | 'FAIL'> = {};
  const cleanupJobIds: string[] = [];
  const mark = (k: string, ok: boolean) => {
    summary[k] = ok ? 'PASS' : 'FAIL';
    if (!ok) throw new Error(`FAIL ${k}`);
  };
  try {
    const snap = await buildExecutiveSnapshot();
    mark('snapshot', snap.version === 'executive_command_center_v2');
    mark('integrity_contract', !!snap.integrity && Array.isArray(snap.integrity.checks));
    mark('integrity_status', ['OK', 'MISMATCH'].includes(snap.integrity.status));
    mark('kpi_non_negative', snap.sales.buyersToday >= 0 && snap.sales.qualifiedToday >= 0);
    mark('pipeline_non_negative', snap.sales.pipelineValue >= 0 && snap.sales.expectedRevenue >= 0);
    mark('source_schedule', snap.sources.running === snap.scanSchedule.filter(s => s.status === 'running').length);

    const markerHits = scanSnapshotFakeMarkers(snap);
    mark('fake_marker_guard', markerHits.length === 0);

    const boundaryCases = [0, 1, 39, 40, 59, 60, 79, 80, 100];
    for (const n of boundaryCases) {
      const result = evaluateSourceQuality({
        leads: 100,
        buyers: n,
        qualified: n,
        investor: Math.floor(n / 2),
        tenant: Math.floor(n / 3),
        duplicateRate: 0,
        dismissedRate: 0,
        scanSuccessRate: 100,
        scanFailureRate: 0,
        freshnessHours: 1,
      });
      const again = evaluateSourceQuality({
        leads: 100,
        buyers: n,
        qualified: n,
        investor: Math.floor(n / 2),
        tenant: Math.floor(n / 3),
        duplicateRate: 0,
        dismissedRate: 0,
        scanSuccessRate: 100,
        scanFailureRate: 0,
        freshnessHours: 1,
      });
      assert.deepEqual(result, again, `quality deterministic failed at ${n}`);
    }
    mark('source_quality_deterministic', true);

    const badSourceRows = snap.sourcePerformance.filter(s =>
      /\b(?:prodv100|prodv\d+|h244|h2\.4\.|product-v|fixture|test-source|demo|mock|fake)\b/i.test(
        `${s.sourceName} ${s.sourceType} ${s.sourceUrl || ''}`,
      ),
    );
    mark('provenance_guard', badSourceRows.length === 0);

    const actionSource = await prisma.agentSource.findFirst({
      where: { status: { in: ['active', 'paused'] } },
      select: { id: true, status: true },
    });
    mark('source_action_target_exists', Boolean(actionSource));

    if (actionSource) {
      const actionStartedAt = new Date();
      const beforeJobs = await prisma.agentJob.count({
        where: { sourceId: actionSource.id, type: { in: ['scan_source', 'source_scan'] }, status: 'queued' },
      });
      const { enqueueSourceScan } = await import('../server/agent/agentJobService');
      await enqueueSourceScan({
        sourceId: actionSource.id,
        companyId: 'comp-da-nang',
        triggeredByUserId: 'executive-v21-test',
      });
      const afterJobs = await prisma.agentJob.count({
        where: { sourceId: actionSource.id, type: { in: ['scan_source', 'source_scan'] }, status: 'queued' },
      });
      mark('scan_now_creates_job', afterJobs >= beforeJobs + 1);
      const created = await prisma.agentJob.findMany({
        where: {
          sourceId: actionSource.id,
          type: { in: ['scan_source', 'source_scan'] },
          status: 'queued',
          createdAt: { gte: actionStartedAt },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      for (const row of created) cleanupJobIds.push(row.id);
    }
    console.log(JSON.stringify({ result: 'PASS', summary }, null, 2));
  } finally {
    if (cleanupJobIds.length) {
      await prisma.agentJob.deleteMany({
        where: { id: { in: cleanupJobIds }, status: 'queued' },
      });
    }
  }
}

main().catch(err => {
  console.error(JSON.stringify({ result: 'FAIL', error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
});
