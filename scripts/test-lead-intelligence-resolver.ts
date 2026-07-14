#!/usr/bin/env node
/**
 * resolveLeadIntelligence unit tests
 */
import assert from 'assert';
import {
  resolveLeadIntelligence,
  cleanLeadSummary,
  formatVietnamPhoneDisplay,
} from '../src/utils/resolveLeadIntelligence';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  const r = resolveLeadIntelligence({
    title: 'Bán đất mặt tiền',
    summary: 'listing',
    score: 100,
    finalScore: null,
    classification: null,
    actorRole: null,
    extractedData: {
      scoreBreakdown: { finalScore: 100, keywordScore: 100, aiScore: 75 },
      leadAnalysis: { classification: 'buyer' },
    },
  });
  ok('legacy score 100 → Cần xem lại', r.displayScoreLabel === 'Cần xem lại');
  ok('finalScore null', r.finalScore === null);
  ok('not show as confirmed', r.showAsConfirmedLead === false);
}

{
  const r = resolveLeadIntelligence({
    title: 'Khách tìm mua',
    summary: 'Tín hiệu phía cầu (buyer). Khách cần nhà 3 tỷ.',
    score: 50,
    classification: 'buyer',
    intent: 'buy',
    actorRole: 'demand_side',
    finalScore: 72,
    leadFitScore: 80,
    aiScore: 70,
    keywordScore: 40,
    primaryPhone: '0905111222',
    primaryLocation: 'Đà Nẵng',
    extractedData: {},
  });
  ok('buyer confirmed score', r.displayScoreLabel === '72' && r.showAsConfirmedLead);
  ok('summary cleaned prefix', !r.summary.toLowerCase().includes('tín hiệu phía cầu'));
  ok('phone formatted', formatVietnamPhoneDisplay(r.primaryPhone) === '0905 111 222');
}

{
  const r = resolveLeadIntelligence({
    title: 'Khách tìm mua khách sạn',
    summary: 'raw',
    score: 100,
    classification: null,
    finalScore: null,
    extractedData: {
      classification: 'unknown',
      leadAnalysis: { classification: 'buyer', summary: 'AI buyer' },
    },
  });
  ok('title buyer + unknown → inconsistent or needs_review', r.dataInconsistent || r.analysisStatus !== 'analyzed');
  ok('no buyer badge as confirmed', r.showAsConfirmedLead === false);
}

{
  const cleaned = cleanLeadSummary(
    'Tín hiệu phía cầu (buyer). Khách đang tìm mua khách sạn để vận hành. Có để lại SĐT.',
    'Khách tìm mua',
  );
  ok('no technical prefix', !/tín hiệu phía cầu/i.test(cleaned));
  ok('keeps content', /khách sạn/i.test(cleaned));
}

{
  // extractedData buyer with null columns — resolver reads ed
  const r = resolveLeadIntelligence({
    title: 'Lead',
    summary: 'x',
    score: 10,
    classification: null,
    finalScore: 55,
    leadFitScore: 60,
    actorRole: null,
    extractedData: {
      classification: 'buyer',
      actorRole: 'demand_side',
      finalScore: 55,
      intelligence: { summary: 'Khách cần mua nhà gần biển.' },
    },
  });
  ok('reads classification from extractedData', r.classification === 'buyer');
  ok('actor from extractedData', r.actorRole === 'demand_side');
}

console.log(`\n${passed} assertions passed`);
