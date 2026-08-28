/**
 * Wipe Lead Intelligence + External Inventory (local or any DATABASE_URL).
 * Run: npx tsx scripts/local/wipe-lead-intelligence.ts [--dry-run]
 */
import { prisma } from '../../server/prisma';

async function count(label: string, fn: () => Promise<number>) {
  const n = await fn();
  console.log(`${label}: ${n}`);
  return n;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await count('scanned_contents (before)', () => prisma.scannedContent.count());
  await count('agent_findings (before)', () => prisma.agentFinding.count());
  await count('external_inventory_items (before)', () => prisma.externalInventoryItem.count());
  await count('finding notifications (before)', () =>
    prisma.agentNotification.count({ where: { findingId: { not: null } } }),
  );

  if (dryRun) {
    console.log('DRY RUN');
    return;
  }

  const txOpts = { timeout: 600_000, maxWait: 60_000 };

  await prisma.$transaction(async (tx) => {
    await tx.agentActionProposal.deleteMany();
    await tx.agentNotification.deleteMany({ where: { findingId: { not: null } } });
    await tx.agentFindingMatchEvent.deleteMany();
    await tx.telegramDeliveryLog.deleteMany();

    await tx.agentWorkflowStepRun.updateMany({
      where: { OR: [{ findingId: { not: null } }, { scannedContentId: { not: null } }] },
      data: { findingId: null, scannedContentId: null },
    });
    await tx.lead.updateMany({
      where: { OR: [{ findingId: { not: null } }, { scannedContentId: { not: null } }] },
      data: { findingId: null, scannedContentId: null },
    });

    await tx.agentFinding.updateMany({
      where: { duplicateOfFindingId: { not: null } },
      data: { duplicateOfFindingId: null },
    });
    await tx.agentFinding.updateMany({
      where: { externalInventoryItemId: { not: null } },
      data: { externalInventoryItemId: null },
    });
    await tx.externalInventoryItem.updateMany({
      where: { duplicateOfId: { not: null } },
      data: { duplicateOfId: null },
    });
    await tx.externalInventoryItem.updateMany({
      where: { findingId: { not: null } },
      data: { findingId: null },
    });

    await tx.externalInventorySource.deleteMany();
    await tx.externalInventoryEvent.deleteMany();
    await tx.externalInventoryItem.deleteMany();
    await tx.agentFinding.deleteMany();
    await tx.scannedContent.deleteMany();
    await tx.agentIngestionEvent.deleteMany();
    await tx.agentSyncOutbox.deleteMany({
      where: {
        eventType: { in: ['finding_upsert', 'content_upsert', 'scanned_content_upsert'] },
      },
    });
  }, txOpts);

  await count('scanned_contents (after)', () => prisma.scannedContent.count());
  await count('agent_findings (after)', () => prisma.agentFinding.count());
  await count('external_inventory_items (after)', () => prisma.externalInventoryItem.count());
  console.log('Local wipe done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
