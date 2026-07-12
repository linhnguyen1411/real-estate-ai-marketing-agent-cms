#!/usr/bin/env tsx
/**
 * Backfill structured Lead Intelligence fields (dry-run by default).
 * Usage:
 *   npm run agent:backfill-finding-structured-data
 *   npm run agent:backfill-finding-structured-data -- --apply --limit=50
 */
import { prisma } from '../server/prisma';
import { buildStructuredFindingPatch } from '../server/agent/findingStructuredData';
import type { Prisma } from '@prisma/client';

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  return 'true';
}

async function main() {
  const apply = arg('apply') === 'true';
  const limit = Number(arg('limit') || 100);
  const sourceId = arg('source-id');
  const findingId = arg('finding-id');

  const rows = await prisma.agentFinding.findMany({
    where: {
      ...(findingId ? { id: findingId } : {}),
      ...(sourceId ? { sourceId } : {}),
    },
    take: findingId ? 1 : Number.isFinite(limit) ? limit : 100,
    orderBy: { createdAt: 'desc' },
    include: {
      scannedContent: true,
      source: { select: { id: true, name: true, type: true } },
    },
  });

  console.log(`Found ${rows.length} · mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  let updated = 0;
  for (const row of rows) {
    const finding = {
      ...row,
      budgetMin: row.budgetMin?.toString() ?? null,
      budgetMax: row.budgetMax?.toString() ?? null,
      askingPrice: row.askingPrice?.toString() ?? null,
    };
    const before = {
      name: row.personName,
      primaryPhone: row.primaryPhone,
      classification: row.classification,
      actorRole: row.actorRole,
      intent: row.intent,
      askingPrice: row.askingPrice?.toString() ?? null,
      needSummary: row.needSummary,
      primaryLocation: row.primaryLocation,
      propertyType: row.propertyType,
    };
    const patch = buildStructuredFindingPatch(finding);
    const ed = (patch.extractedData || {}) as Record<string, unknown>;
    const property = (ed.property || {}) as Record<string, unknown>;
    const contact = (ed.contact || {}) as Record<string, unknown>;
    const phones = Array.isArray(contact.phones) ? contact.phones : [];

    console.log(
      JSON.stringify(
        {
          findingId: row.id,
          before,
          after: {
            name: patch.personName,
            primaryPhone: patch.primaryPhone,
            allPhones: phones.map((p: { normalized?: string; label?: string }) => ({
              phone: p.normalized,
              label: p.label,
            })),
            classification: patch.classification,
            actorRole: patch.actorRole,
            intent: patch.intent,
            askingPrice: patch.askingPrice?.toString() ?? null,
            area: property.areaMinM2 ?? null,
            roadWidth: property.roadWidthMeters ?? null,
            pavement: property.pavementWidthMeters ?? null,
            direction: property.direction ?? null,
            location: patch.primaryLocation,
            propertyType: patch.primaryPropertyType,
            summary: patch.needSummary,
            proposedAction: apply ? 'apply' : 'dry-run',
          },
        },
        null,
        2,
      ),
    );

    if (apply) {
      await prisma.agentFinding.update({
        where: { id: row.id },
        data: {
          personName: patch.personName,
          primaryPhone: patch.primaryPhone,
          needSummary: patch.needSummary,
          primaryLocation: patch.primaryLocation,
          propertyType: patch.primaryPropertyType,
          budgetMin: patch.budgetMin,
          budgetMax: patch.budgetMax,
          askingPrice: patch.askingPrice,
          keywordScore: patch.keywordScore,
          aiScore: patch.aiScore,
          leadFitScore: patch.leadFitScore,
          finalScore: patch.finalScore,
          scoreStatus: patch.scoreStatus,
          classification: patch.classification,
          intent: patch.intent,
          actorRole: patch.actorRole,
          extractedData: patch.extractedData as Prisma.InputJsonValue,
        },
      });
      updated += 1;
    }
  }

  console.log(`Done. updated=${updated}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
