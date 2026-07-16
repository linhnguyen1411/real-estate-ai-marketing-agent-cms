/**
 * Probe whether remote VPS understands mission provenance (HMAC events).
 * Uses a dry probe: health + tiny content envelope with mission fields.
 * Does NOT create production-looking data without [VERIFY] label.
 */
import crypto from 'crypto';
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { postEnvelopeToVps, testVpsConnection } from '../server/agentSync/vpsClient';
import { AGENT_INGEST_API_VERSION } from '../server/agentSync/envelope';
import type { AppSettings } from '../src/types';
import { prisma } from '../server/prisma';

async function main() {
  await ensureDatabaseReady();
  const settings = getSettings() as AppSettings;
  const health = await testVpsConnection(settings);

  const tag = `dualhost_probe_${Date.now()}`;
  const idem = `verify-probe-${tag}`;
  const ghostMissionId = `verify_probe_mission_${tag}`;
  const ghostRunId = `verify_probe_run_${tag}`;

  const envelope = {
    apiVersion: AGENT_INGEST_API_VERSION,
    ingestionId: idem,
    idempotencyKey: idem,
    eventType: 'scanned_content_upsert',
    companyId: 'comp-da-nang',
    localWorkerId: 'dual-host-probe',
    sourceKey: `url:https://example.invalid/verify-probe/${tag}`,
    capturedAt: new Date().toISOString(),
    parserVersion: 'dual-host-probe-v1',
    payload: {
      missionId: ghostMissionId,
      missionRunId: ghostRunId,
      pipelineVersion: 1,
      pipelineHash: `probe-${tag}`,
      missionVersion: 1,
      completedLocalSteps: [
        {
          stepId: 'collect',
          stepType: 'collect_source',
          status: 'completed',
          executionTarget: 'local_worker',
          output: { probe: true },
          completedAt: new Date().toISOString(),
        },
      ],
      missionWorkflow: {
        missionId: ghostMissionId,
        missionRunId: ghostRunId,
        pipelineVersion: 1,
        pipelineHash: `probe-${tag}`,
        completedLocalSteps: [],
        pipelineSnapshot: {
          version: 1,
          steps: [
            { id: 'spam', type: 'spam_filter', enabled: true, executionTarget: 'either' },
            {
              id: 'summary',
              type: 'summarize',
              enabled: true,
              dependsOn: ['spam'],
              executionTarget: 'vps',
            },
          ],
        },
      },
      verification: true,
      verificationSessionId: tag,
      source: {
        name: `[VERIFY] Dual-host probe ${tag}`,
        type: 'website',
        url: `https://example.invalid/verify-probe/${tag}`,
        externalSourceKey: `url:https://example.invalid/verify-probe/${tag}`,
        status: 'paused',
      },
      scannedContent: {
        externalId: `verify_probe_${tag}`,
        contentText: `[VERIFY] Dual-host provenance probe ${tag} — ignore`,
        contentHash: crypto.createHash('sha256').update(tag).digest('hex'),
        status: 'collected',
        collectedAt: new Date().toISOString(),
        rawData: { verification: true, verificationSessionId: tag },
      },
    },
  };

  const post = await postEnvelopeToVps(envelope, settings);

  console.log(
    JSON.stringify(
      {
        healthOk: health.ok,
        healthTenant: health.data?.tenant ?? null,
        healthIngestEnabled: health.data?.ingestEnabled ?? null,
        healthHasMissionCapability: Boolean(
          health.data?.missionProvenance ||
            health.data?.missionWorkflow ||
            health.data?.capabilities,
        ),
        healthKeys: health.data ? Object.keys(health.data) : [],
        probe: {
          ok: post.ok,
          status: post.status,
          error: post.error || null,
          warnings: post.warnings || [],
          scannedContentId: post.scannedContentId || null,
          sourceId: post.sourceId || null,
          findingId: post.findingId || null,
          // Heuristic: if VPS has Mission 2.0, warnings often include mission_workflow_*
          missionAware:
            (post.warnings || []).some(w => w.includes('mission_workflow')) ||
            (post.error || '').includes('mission_provenance'),
        },
        interpretation: !post.ok
          ? 'VPS rejected probe — check ingest/credential'
          : (post.warnings || []).some(w => w.includes('mission_workflow'))
            ? 'VPS appears Mission-2.0-aware (workflow continue path hit)'
            : post.findingId
              ? 'BLOCKER: VPS created Finding from content-only mission payload (legacy default)'
              : 'VPS accepted content but no mission_workflow warning — likely pre-Mission-2.0 ingest (content upsert only)',
      },
      null,
      2,
    ),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
