#!/usr/bin/env node
/**
 * External inventory preference / schema shape tests
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
  const seller = resolveLeadIntelligence({
    title: 'Bán đất FPT',
    summary: 'bán đất',
    classification: 'seller',
    actorRole: 'supply_side',
    scannedContent: {
      contentText: 'Bán đất 500m2 gần FPT giá 4 tỷ. 0905222333',
      canonicalUrl: 'https://facebook.com/groups/x/posts/99',
      authorName: 'Chủ nhà',
    },
    extractedData: {},
  });
  ok('seller → external preferred', seller.externalInventoryPreferred);
  ok('has source url', Boolean(seller.source.canonicalUrl));
  ok('original content', Boolean(seller.content.fullOriginalContent));
}

{
  const buyer = resolveLeadIntelligence({
    title: 'Khách thuê',
    summary: 'thuê',
    classification: 'renter',
    actorRole: 'demand_side',
    extractedData: {},
  });
  ok('buyer needs warning path', !buyer.externalInventoryPreferred && buyer.isDemandSide);
}

console.log(`\n${passed} assertions passed`);
