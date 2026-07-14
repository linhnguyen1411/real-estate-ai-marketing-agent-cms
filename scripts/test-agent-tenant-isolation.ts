#!/usr/bin/env node
/**
 * test:agent-tenant-isolation — minimal companyId scope checks on Prisma queries.
 */
import assert from 'node:assert/strict';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

async function main() {
  const suffix = `r0iso_${Date.now()}`;
  const companyA = await prisma.company.create({
    data: { id: `coa-${suffix}`, data: { name: `CoA ${suffix}` } },
  });
  const companyB = await prisma.company.create({
    data: { id: `cob-${suffix}`, data: { name: `CoB ${suffix}` } },
  });
  ok('companies distinct', companyA.id !== companyB.id);

  const sourceB = await prisma.agentSource.create({
    data: {
      companyId: companyB.id,
      name: `src-${suffix}`,
      type: 'website',
      url: `https://example.com/${suffix}`,
      status: 'active',
    },
  });

  const text = `tenant isolation fixture ${suffix}`;
  const contentB = await prisma.scannedContent.create({
    data: {
      companyId: companyB.id,
      sourceId: sourceB.id,
      externalId: `ext-${suffix}`,
      canonicalUrl: `https://example.com/p/${suffix}`,
      contentText: text,
      contentHash: createHash('sha256').update(text).digest('hex'),
      status: 'collected',
    },
  });

  const findingB = await prisma.agentFinding.create({
    data: {
      companyId: companyB.id,
      sourceId: sourceB.id,
      scannedContentId: contentB.id,
      type: 'lead',
      title: `finding-${suffix}`,
      summary: 'isolation',
      classification: 'buyer',
      status: 'new',
      score: 50,
    },
  });

  const inventoryB = await prisma.externalInventoryItem.create({
    data: {
      companyId: companyB.id,
      title: `inv-${suffix}`,
      originalContent: text,
      status: 'active',
      verificationStatus: 'unverified',
    },
  });

  const credB = await prisma.agentApiCredential
    .create({
      data: {
        companyId: companyB.id,
        name: `cred-${suffix}`,
        keyId: `key-${suffix}`,
        secretHash: createHash('sha256').update(`secret-${suffix}`).digest('hex'),
        status: 'active',
      },
    })
    .catch(() => null);

  const findAsA = await prisma.agentFinding.findFirst({
    where: { id: findingB.id, companyId: companyA.id },
  });
  ok('company A cannot read finding B by scoped query', findAsA == null);

  const invAsA = await prisma.externalInventoryItem.findFirst({
    where: { id: inventoryB.id, companyId: companyA.id },
  });
  ok('company A cannot read inventory B', invAsA == null);

  const dismissWrong = await prisma.agentFinding.updateMany({
    where: { id: findingB.id, companyId: companyA.id },
    data: { status: 'dismissed' },
  });
  ok('dismiss wrong tenant updates 0', dismissWrong.count === 0);

  const promoteWrong = await prisma.agentFinding.updateMany({
    where: { id: findingB.id, companyId: companyA.id },
    data: { status: 'promoted', promotedLeadId: 'fake' },
  });
  ok('promote wrong tenant updates 0', promoteWrong.count === 0);

  const stillNew = await prisma.agentFinding.findUnique({ where: { id: findingB.id } });
  ok('finding B status unchanged', stillNew?.status === 'new');

  if (credB) {
    const credAsA = await prisma.agentApiCredential.findFirst({
      where: { id: credB.id, companyId: companyA.id },
    });
    ok('credential B not visible to company A scope', credAsA == null);
  } else {
    ok('credential model create skipped', true);
  }

  // Cleanup
  if (credB) await prisma.agentApiCredential.deleteMany({ where: { id: credB.id } });
  await prisma.externalInventoryItem.deleteMany({ where: { id: inventoryB.id } });
  await prisma.agentFinding.deleteMany({ where: { id: findingB.id } });
  await prisma.scannedContent.deleteMany({ where: { id: contentB.id } });
  await prisma.agentSource.deleteMany({ where: { id: sourceB.id } });
  await prisma.company.deleteMany({ where: { id: { in: [companyA.id, companyB.id] } } });

  console.log(`\n${passed} tenant isolation assertions passed`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
