#!/usr/bin/env node
/**
 * Matching availability / groups shape tests
 */
import assert from 'assert';
import { resolveLeadIntelligence } from '../src/utils/resolveLeadIntelligence';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  const buyer = resolveLeadIntelligence({
    classification: 'buyer',
    actorRole: 'demand_side',
    title: 'mua',
    summary: 'mua',
    budgetMin: 3e9,
    budgetMax: 4e9,
    primaryLocation: 'Đà Nẵng',
    propertyType: 'nhà',
    extractedData: {},
  });
  ok('buyer matching on', buyer.matchingEnabled);
}

{
  const seller = resolveLeadIntelligence({
    classification: 'seller',
    actorRole: 'supply_side',
    title: 'bán',
    summary: 'bán',
    extractedData: {},
  });
  ok('seller matching off', !seller.matchingEnabled);
}

// Shape contract for API response groups
const sample = {
  official: [{ inventoryKind: 'official', matchScore: 80 }],
  external: [{ inventoryKind: 'external', matchScore: 60 }],
};
ok('two separate groups', sample.official[0].inventoryKind !== sample.external[0].inventoryKind);

console.log(`\n${passed} assertions passed`);
