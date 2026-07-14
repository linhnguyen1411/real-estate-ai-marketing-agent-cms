#!/usr/bin/env node
/**
 * Repository contract tests — tenant scope + lookup helpers.
 */
import assert from 'node:assert/strict';
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  findFindingByIdForCompany,
  bulkUpdateFindingStatusScoped,
} from '../server/repositories/agent/agentFindingRepository';
import { findScannedContentByCanonicalUrl } from '../server/repositories/agent/scannedContentRepository';
import { findExternalInventoryByIdForCompany } from '../server/repositories/inventory/externalInventoryRepository';

const prisma = new PrismaClient();
let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

async function main() {
  const suffix = `r2repo_${Date.now()}`;
  const coA = await prisma.company.create({
    data: { id: `coa-${suffix}`, data: { name: `A ${suffix}` } },
  });
  const coB = await prisma.company.create({
    data: { id: `cob-${suffix}`, data: { name: `B ${suffix}` } },
  });
  const srcB = await prisma.agentSource.create({
    data: {
      companyId: coB.id,
      name: `src-${suffix}`,
      type: 'website',
      url: `https://example.com/${suffix}`,
      status: 'active',
    },
  });
  const text = `repo fixture ${suffix}`;
  const contentB = await prisma.scannedContent.create({
    data: {
      companyId: coB.id,
      sourceId: srcB.id,
      canonicalUrl: `https://example.com/p/${suffix}`,
      contentText: text,
      contentHash: createHash('sha256').update(text).digest('hex'),
      status: 'collected',
    },
  });
  const findingB = await prisma.agentFinding.create({
    data: {
      companyId: coB.id,
      sourceId: srcB.id,
      scannedContentId: contentB.id,
      type: 'lead',
      title: `f-${suffix}`,
      summary: 'x',
      status: 'new',
      score: 40,
    },
  });
  const invB = await prisma.externalInventoryItem.create({
    data: {
      companyId: coB.id,
      title: `inv-${suffix}`,
      originalContent: text,
      status: 'active',
      verificationStatus: 'unverified',
    },
  });

  const miss = await findFindingByIdForCompany(findingB.id, { companyId: coA.id });
  ok('finding scoped miss for company A', miss == null);

  const hit = await findFindingByIdForCompany(findingB.id, { companyId: coB.id });
  ok('finding scoped hit for company B', hit?.id === findingB.id);

  const contentMiss = await findScannedContentByCanonicalUrl(contentB.canonicalUrl, {
    companyId: coA.id,
  });
  ok('content scoped miss', contentMiss == null);

  const contentHit = await findScannedContentByCanonicalUrl(contentB.canonicalUrl, {
    companyId: coB.id,
  });
  ok('content scoped hit', contentHit?.id === contentB.id);

  const invMiss = await findExternalInventoryByIdForCompany(invB.id, { companyId: coA.id });
  ok('inventory scoped miss', invMiss == null);

  const bulk = await bulkUpdateFindingStatusScoped(
    { companyId: coA.id },
    [findingB.id],
    { status: 'dismissed' },
  );
  ok('bulk dismiss wrong tenant updates 0', bulk.count === 0);
  const still = await prisma.agentFinding.findUnique({ where: { id: findingB.id } });
  ok('finding B unchanged after cross-tenant bulk', still?.status === 'new');

  // cleanup
  await prisma.agentFinding.deleteMany({ where: { id: findingB.id } });
  await prisma.scannedContent.deleteMany({ where: { id: contentB.id } });
  await prisma.externalInventoryItem.deleteMany({ where: { id: invB.id } });
  await prisma.agentSource.deleteMany({ where: { id: srcB.id } });
  await prisma.company.deleteMany({ where: { id: { in: [coA.id, coB.id] } } });

  console.log(`\n${passed} repository assertions passed`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
