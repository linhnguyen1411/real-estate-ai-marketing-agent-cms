/**
 * Purge AgentFinding + ScannedContent on THIS database (run on VPS for production).
 * Keeps sources, missions, spam rules, CRM, inventory.
 *
 *   npx tsx scripts/purge-agent-findings-contents.ts --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const before = {
    findings: await prisma.agentFinding.count(),
    contents: await prisma.scannedContent.count(),
    notifications: await prisma.agentNotification.count(),
    sources: await prisma.agentSource.count(),
  };
  console.log('BEFORE', before);
  if (!apply) {
    console.log('Dry-run. Re-run with --apply to delete.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(
    async tx => {
      await tx.agentFinding.updateMany({
        data: { externalInventoryItemId: null, duplicateOfFindingId: null },
      });
      await tx.externalInventoryItem.updateMany({
        where: { OR: [{ findingId: { not: null } }, { scannedContentId: { not: null } }] },
        data: { findingId: null, scannedContentId: null },
      });

      const audits = await tx.agentActionAuditLog.deleteMany({});
      const proposals = await tx.agentActionProposal.deleteMany({});
      const matchEvents = await tx.agentFindingMatchEvent.deleteMany({});
      const notifications = await tx.agentNotification.deleteMany({});
      const telegramLogs = await tx.telegramDeliveryLog.deleteMany({});
      const outbox = await tx.agentSyncOutbox.deleteMany({
        where: {
          eventType: {
            in: [
              'scanned_content_upsert',
              'finding_upsert',
              'notification_event',
              'scan_completed',
              'scan_failed',
            ],
          },
        },
      });
      const ingest = await tx.agentIngestionEvent.deleteMany({
        where: {
          OR: [{ scannedContentId: { not: null } }, { findingId: { not: null } }],
        },
      });
      const findings = await tx.agentFinding.deleteMany({});
      const contents = await tx.scannedContent.deleteMany({});
      return {
        audits: audits.count,
        proposals: proposals.count,
        matchEvents: matchEvents.count,
        notifications: notifications.count,
        telegramLogs: telegramLogs.count,
        outbox: outbox.count,
        ingest: ingest.count,
        findings: findings.count,
        contents: contents.count,
      };
    },
    { timeout: 180_000 },
  );

  console.log('DELETED', result);
  console.log('AFTER', {
    findings: await prisma.agentFinding.count(),
    contents: await prisma.scannedContent.count(),
    sources: await prisma.agentSource.count(),
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
