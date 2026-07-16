/**
 * Dual-host preflight — prints non-secret sync/VPS config only.
 */
import { ensureDatabaseReady, getSettings } from '../server/dbHelper';
import { prisma } from '../server/prisma';
import { isLocalSyncEnabled } from '../server/agentSync/envelope';

function mask(v: string | null | undefined): string {
  const s = String(v || '').trim();
  if (!s) return '(empty)';
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

async function main() {
  await ensureDatabaseReady();
  const settings = getSettings() as unknown as Record<string, unknown>;

  const openRuns = await prisma.agentMissionRun.count({
    where: { status: { in: ['queued', 'running'] } },
  });
  const outbox = await prisma.agentSyncOutbox.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const sessions = await prisma.browserSession.findMany({
    where: { status: { in: ['ready', 'running'] } },
    select: { id: true, status: true, workerId: true, lastHeartbeatAt: true },
    take: 3,
  });

  const vpsUrl = String(
    settings.agent_sync_vps_url || process.env.AGENT_SYNC_VPS_URL || '',
  ).trim();
  const keyId = String(settings.agent_sync_key_id || process.env.AGENT_SYNC_KEY_ID || '').trim();
  const secretPresent = Boolean(
    String(settings.agent_sync_secret || process.env.AGENT_SYNC_SECRET || '').trim(),
  );
  const companyId = String(
    settings.agent_sync_company_id || process.env.AGENT_SYNC_COMPANY_ID || 'comp-da-nang',
  ).trim();

  console.log(
    JSON.stringify(
      {
        localSyncEnv: isLocalSyncEnabled(),
        AGENT_LOCAL_SYNC_ENABLED: process.env.AGENT_LOCAL_SYNC_ENABLED || null,
        AGENT_INGEST_ENABLED: process.env.AGENT_INGEST_ENABLED || null,
        settings: {
          agent_sync_enabled: settings.agent_sync_enabled,
          agent_sync_vps_url: vpsUrl || '(empty)',
          agent_sync_key_id: keyId ? mask(keyId) : '(empty)',
          agent_sync_secret_present: secretPresent,
          agent_sync_company_id: companyId,
          agent_sync_timeout_ms: settings.agent_sync_timeout_ms,
          agent_sync_verify_tls: settings.agent_sync_verify_tls,
          agent_sync_batch_size: settings.agent_sync_batch_size,
          agent_sync_worker_id: settings.agent_sync_worker_id || process.env.AGENT_SYNC_WORKER_ID || null,
        },
        openMissionRuns: openRuns,
        outbox,
        liveSessions: sessions,
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
