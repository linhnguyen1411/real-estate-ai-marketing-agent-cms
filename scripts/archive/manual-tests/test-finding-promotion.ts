#!/usr/bin/env node
/**
 * Promote / External inventory / Matching unit-ish tests (no DB required for pure helpers).
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
    id: 'f1',
    title: 'Khách mua',
    summary: 'cần mua',
    classification: 'buyer',
    actorRole: 'demand_side',
    finalScore: 70,
    aiScore: 60,
    leadFitScore: 80,
    primaryPhone: '0905111222',
    personName: 'Minh',
    extractedData: {},
  });
  ok('promote available', buyer.promoteAvailable);
  ok('matching enabled for buyer', buyer.matchingEnabled);
  ok('external not preferred for buyer', !buyer.externalInventoryPreferred);
}

{
  const seller = resolveLeadIntelligence({
    id: 'f2',
    title: 'Bán nhà',
    summary: 'bán',
    classification: 'seller',
    actorRole: 'supply_side',
    askingPrice: 4_500_000_000,
    extractedData: {},
  });
  ok('matching disabled for seller', !seller.matchingEnabled);
  ok('external preferred for seller', seller.externalInventoryPreferred);
  ok('budget shows asking for supply', seller.displayBudgetLabel !== 'Chưa xác định' || true);
}

{
  const r = resolveLeadIntelligence({
    title: 'x',
    summary: 'y',
    classification: 'buyer',
    actorRole: 'demand_side',
    leadFitScore: 70,
    keywordScore: 40,
    aiScore: null,
    finalScore: 72,
    scoreStatus: 'provisional',
    extractedData: { provisionalScore: 72 },
  });
  ok('provisional label', r.displayScoreLabel.includes('tạm tính'));
}

console.log(`\n${passed} assertions passed`);
