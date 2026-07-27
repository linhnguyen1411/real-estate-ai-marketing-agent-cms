/**
 * Smoke — H3.5 Buyer Journey + Sales recommendation (no DB).
 * Run: npx tsx scripts/smoke-sales-layer.ts
 */

import { detectJourneyStage, journeyToPipeline } from '../server/modules/sales-layer/journeyEngine';
import { buildSignal, mergeSignals, scoreBuyerFromSignals } from '../server/modules/sales-layer/signalGraph';
import { evaluateFollowUp } from '../server/modules/sales-layer/followUpEngine';
import { recommendSalesAction } from '../server/modules/sales-layer/salesRecommendation';
import { aggregatePipelineValue, estimateDealTy } from '../server/modules/sales-layer/pipelineValue';
import { formatSalesBuyerCard, formatSalesDailyBriefing } from '../server/modules/sales-layer';
import { computeBuyerKey } from '../server/modules/sales-layer/leadMemory';
import type { SalesLayerProfile } from '../server/modules/sales-layer/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const journeyCases: Array<{ text: string; stage: string }> = [
  { text: 'Hỏi giá lô Mai Đăng Chơn', stage: 'researching' },
  { text: 'Comment nhiều lần quan tâm dự án', stage: 'interested' },
  { text: 'Inbox hỏi thêm thông tin', stage: 'contacted' },
  { text: 'Xin xem sổ đỏ tuần này', stage: 'appointment' },
  { text: 'Hẹn gặp đàm phán giá', stage: 'negotiating' },
];

for (const c of journeyCases) {
  const r = detectJourneyStage({ text: c.text });
  assert(r.stage === c.stage, `journey expected ${c.stage} got ${r.stage} for ${c.text}`);
  console.log('OK journey', c.stage, '→ pipeline', journeyToPipeline(r.stage));
}

const key1 = computeBuyerKey({
  companyId: 'c1',
  primaryPhone: '0901234567',
  findingId: 'f1',
});
const key2 = computeBuyerKey({
  companyId: 'c1',
  primaryPhone: '+84 901 234 567',
  findingId: 'f2',
});
assert(key1 === key2, 'same phone → same buyer key');

const s1 = buildSignal({ findingId: 'f1', text: 'comment hỏi giá', at: '2026-07-21T10:00:00Z' });
const s2 = buildSignal({ findingId: 'f1', text: 'inbox messenger', at: '2026-07-23T10:00:00Z' });
const signals = mergeSignals([], [s1, s2]);
const scored = scoreBuyerFromSignals(signals);
assert(scored.kinds.length >= 1, 'signal kinds');

const follow = evaluateFollowUp({
  signals,
  pipelineStage: 'contacted',
  lastActivityAt: new Date(Date.now() - 80 * 3600_000).toISOString(),
});
assert(follow.needsFollowUp, '72h cooling should need follow-up');

const recUrgent = recommendSalesAction({
  confidencePct: 97,
  journeyStage: 'negotiating',
  pipelineStage: 'negotiating',
  followUp: follow,
  hasPhone: true,
  hasBudget: true,
});
assert(recUrgent.code === 'call_now', `expected call_now got ${recUrgent.code}`);

const recQuote = recommendSalesAction({
  confidencePct: 55,
  journeyStage: 'researching',
  pipelineStage: 'qualified',
  followUp: { needsFollowUp: false, coolingHours: 1, reason: null, suggestion: null },
  hasBudget: true,
  hasLocation: true,
});
assert(recQuote.code === 'send_quote', `expected send_quote got ${recQuote.code}`);

const profile: SalesLayerProfile = {
  version: 'h35_v1',
  findingId: 'f1',
  buyerKey: key1,
  canonicalFindingId: 'f1',
  mergedFindingIds: ['f1'],
  journeyStage: 'negotiating',
  pipelineStage: 'negotiating',
  signals,
  timeline: [
    { at: '2026-07-21T10:00:00Z', kind: 'comment', label: 'Question' },
    { at: '2026-07-23T10:00:00Z', kind: 'inbox', label: 'Inbox' },
  ],
  stageHistory: [],
  owner: 'sales-a',
  expectedCloseAt: null,
  probability: 0.65,
  expectedDealTy: 11,
  recommendation: recUrgent,
  followUp: follow,
  updatedAt: new Date().toISOString(),
};

const card = formatSalesBuyerCard({
  profile,
  confidencePct: 97,
  campaignName: 'Mai Đăng Chơn',
  title: 'Buyer MDC',
});
assert(card.includes('🎯 BUYER LEAD') || card.includes('👤 Buyer'), 'buyer card');
assert(card.includes('Mai Đăng Chơn'), 'campaign');
assert(card.includes('BUYER CONFIDENCE') || card.includes('Gọi ngay'), 'suggestion/confidence');
assert(card.includes('🔥 HOT') || card.includes('97'), 'hot/score');

const metrics = aggregatePipelineValue([
  {
    profile,
    budgetMin: 10,
    budgetMax: 12,
    campaignId: 'c1',
    campaignName: 'Mai Đăng Chơn',
    sourceId: 's1',
    sourceName: 'FB Group',
  },
  {
    profile: { ...profile, pipelineStage: 'won', journeyStage: 'closed_won', probability: 1 },
    budgetMin: 15,
    campaignId: 'c1',
    campaignName: 'Mai Đăng Chơn',
    sourceId: 's1',
    sourceName: 'FB Group',
  },
]);
assert(metrics.negotiating >= 1, 'negotiating count');
assert(metrics.pipelineValueTy > 0, 'pipeline value');
assert(estimateDealTy({ budgetMin: 12, budgetMax: 15 }) === 13.5, 'deal mid');

const briefing = formatSalesDailyBriefing(metrics);
assert(briefing.includes('📈 Sales Pipeline'), 'briefing header');
assert(briefing.includes('Pipeline Value'), 'briefing pv');

console.log('\n--- Buyer Card ---\n' + card);
console.log('\n--- Daily Briefing ---\n' + briefing);
console.log('\nSmoke OK — sales layer');
