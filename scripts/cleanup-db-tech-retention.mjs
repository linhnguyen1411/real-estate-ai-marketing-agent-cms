#!/usr/bin/env node
/**
 * cleanup:db-tech-retention — dry-run technical table retention cleanup.
 * Never deletes CRM / Lead / Finding / ScannedContent / Inventory business rows.
 *
 * Usage:
 *   npm run cleanup:db-tech-retention
 *   npm run cleanup:db-tech-retention -- --apply
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const POLICY = {
  agentJobCompletedDays: 30,
  browserSessionOfflineDays: 14,
  ingestNonceExpiredOnly: true,
  telegramDeliveryLogDays: 60,
  agentIngestionEventDays: 90,
  agentSyncOutboxSyncedDays: 30,
};

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

async function main() {
  try {
    require('dotenv').config({ path: path.join(ROOT, '.env') });
  } catch {
    /* optional */
  }

  const { apply } = parseArgs(process.argv.slice(2));
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const now = Date.now();
  const day = (d) => new Date(now - d * 24 * 60 * 60 * 1000);

  const plan = [];

  const completedJobs = await prisma.agentJob.count({
    where: {
      status: { in: ['completed', 'failed', 'cancelled'] },
      updatedAt: { lt: day(POLICY.agentJobCompletedDays) },
    },
  }).catch(() => -1);
  plan.push({
    table: 'AgentJob',
    action: 'delete completed/failed/cancelled older than policy',
    count: completedJobs,
    days: POLICY.agentJobCompletedDays,
  });

  const offlineSessions = await prisma.browserSession.count({
    where: { status: 'offline', updatedAt: { lt: day(POLICY.browserSessionOfflineDays) } },
  }).catch(() => -1);
  plan.push({
    table: 'BrowserSession',
    action: 'delete offline older than policy',
    count: offlineSessions,
    days: POLICY.browserSessionOfflineDays,
  });

  const expiredNonce = await prisma.agentIngestNonce.count({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => -1);
  plan.push({
    table: 'AgentIngestNonce',
    action: 'delete expired nonces only',
    count: expiredNonce,
    days: 0,
  });

  const telegramLogs = await prisma.telegramDeliveryLog.count({
    where: { createdAt: { lt: day(POLICY.telegramDeliveryLogDays) } },
  }).catch(() => -1);
  plan.push({
    table: 'TelegramDeliveryLog',
    action: 'delete older than policy',
    count: telegramLogs,
    days: POLICY.telegramDeliveryLogDays,
  });

  const ingestEvents = await prisma.agentIngestionEvent.count({
    where: { createdAt: { lt: day(POLICY.agentIngestionEventDays) } },
  }).catch(() => -1);
  plan.push({
    table: 'AgentIngestionEvent',
    action: 'delete older than policy',
    count: ingestEvents,
    days: POLICY.agentIngestionEventDays,
  });

  const syncedOutbox = await prisma.agentSyncOutbox.count({
    where: {
      status: 'synced',
      OR: [
        { syncedAt: { lt: day(POLICY.agentSyncOutboxSyncedDays) } },
        { syncedAt: null, createdAt: { lt: day(POLICY.agentSyncOutboxSyncedDays) } },
      ],
    },
  }).catch((e) => {
    console.warn('AgentSyncOutbox count error:', String(e.message || e).slice(0, 120));
    return -1;
  });
  plan.push({
    table: 'AgentSyncOutbox',
    action: 'delete status=synced older than policy (by syncedAt/createdAt)',
    count: syncedOutbox,
    days: POLICY.agentSyncOutboxSyncedDays,
  });

  console.log('=== cleanup:db-tech-retention ===');
  console.log(`mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('NEVER touches: ScannedContent, AgentFinding, Lead, CRM, ExternalInventory');
  console.log(JSON.stringify({ policy: POLICY, plan }, null, 2));

  if (!apply) {
    console.log('\nRe-run with --apply after reviewing counts.');
    await prisma.$disconnect();
    return;
  }

  // Conservative apply: only nonce + outbox synced + offline sessions + old jobs
  // Status enums verified at runtime — skip deletes when count is -1 (model mismatch).
  let deleted = {};
  if (expiredNonce >= 0) {
    deleted.AgentIngestNonce = (
      await prisma.agentIngestNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    ).count;
  }
  if (offlineSessions >= 0) {
    deleted.BrowserSession = (
      await prisma.browserSession.deleteMany({
        where: { status: 'offline', updatedAt: { lt: day(POLICY.browserSessionOfflineDays) } },
      })
    ).count;
  }
  if (completedJobs >= 0) {
    deleted.AgentJob = (
      await prisma.agentJob.deleteMany({
        where: {
          status: { in: ['completed', 'failed', 'cancelled'] },
          updatedAt: { lt: day(POLICY.agentJobCompletedDays) },
        },
      })
    ).count;
  }
  if (telegramLogs >= 0) {
    deleted.TelegramDeliveryLog = (
      await prisma.telegramDeliveryLog.deleteMany({
        where: { createdAt: { lt: day(POLICY.telegramDeliveryLogDays) } },
      })
    ).count;
  }
  if (ingestEvents >= 0) {
    deleted.AgentIngestionEvent = (
      await prisma.agentIngestionEvent.deleteMany({
        where: { createdAt: { lt: day(POLICY.agentIngestionEventDays) } },
      })
    ).count;
  }
  // Outbox: only delete clearly terminal rows if status column uses these values
  if (syncedOutbox >= 0) {
    deleted.AgentSyncOutbox = (
      await prisma.agentSyncOutbox.deleteMany({
        where: {
          status: 'synced',
          OR: [
            { syncedAt: { lt: day(POLICY.agentSyncOutboxSyncedDays) } },
            { syncedAt: null, createdAt: { lt: day(POLICY.agentSyncOutboxSyncedDays) } },
          ],
        },
      })
    ).count;
  }

  console.log('deleted:', deleted);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
