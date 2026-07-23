/**
 * Smoke test — H3 Lead Acquisition Engine (no Gemini, no DB required for core engines).
 * Run: npx tsx scripts/smoke-lead-acquisition.ts
 */

import { detectBuyerIntent, isBuyerIntent } from '../server/modules/lead-acquisition/intentEngine';
import { classifyBuyerPersona } from '../server/modules/lead-acquisition/personaEngine';
import { predictBuyingTimeline } from '../server/modules/lead-acquisition/buyerTimeline';
import { computeLeadPriority } from '../server/modules/lead-acquisition/priorityEngine';
import { suggestLeadAction } from '../server/modules/lead-acquisition/actionEngine';
import { formatBuyerAlertText } from '../server/modules/lead-acquisition/telegramBuyerAlert';
import type { LeadAcquisitionProfile } from '../server/modules/lead-acquisition/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const cases: Array<{ text: string; intent: string }> = [
  { text: 'Cần mua nhà gần FPT, ngân sách 12 tỷ', intent: 'buyer' },
  { text: 'Tìm nhà Mai Đăng Chơn gấp tuần này', intent: 'buyer' },
  { text: 'Ai biết lô nào đẹp quanh đây không?', intent: 'potential_buyer' },
  { text: 'Có nên mua đất nền lúc này không?', intent: 'warm_lead' },
  { text: 'Hỏi pháp lý sổ đỏ khu này', intent: 'research_phase' },
  { text: 'Hỏi vay ngân hàng để chốt nhanh hôm nay', intent: 'ready_buyer' },
  { text: 'Chính chủ cần bán nhà mặt tiền', intent: 'non_buyer' },
];

let passed = 0;
for (const c of cases) {
  const intent = detectBuyerIntent(c.text);
  assert(intent.intent === c.intent, `intent expected ${c.intent} got ${intent.intent} for: ${c.text}`);
  const persona = classifyBuyerPersona(c.text);
  const timeline = predictBuyingTimeline({ text: c.text, intent: intent.intent });
  const campaignMatch = {
    campaignId: null,
    campaignName: null,
    propertyHint: null,
    matchScore: 0,
    reasons: [],
  };
  const priority = computeLeadPriority({
    intent,
    timeline,
    campaignMatch,
    keywordScore: 60,
    text: c.text,
  });
  const action = suggestLeadAction({ intent, timeline, priority });
  assert(typeof priority.finalScore === 'number', 'finalScore');
  assert(typeof action.action === 'string', 'action');
  if (isBuyerIntent(intent.intent)) {
    assert(priority.finalScore >= 45, `buyer floor score for ${c.intent}`);
  }
  console.log('OK', c.intent, '→', timeline, action.action, priority.finalScore, persona.persona);
  passed += 1;
}

const profile: LeadAcquisitionProfile = {
  version: 'h3_v1',
  findingId: 'test',
  pipelineStage: 'qualified',
  intent: detectBuyerIntent('Cần mua Mai Đăng Chơn, hỏi vay, xem hôm nay'),
  persona: classifyBuyerPersona('Cần mua Mai Đăng Chơn'),
  timeline: 'within_7_days',
  campaignMatch: {
    campaignId: 'c1',
    campaignName: 'Mai Đăng Chơn',
    propertyHint: 'Mai Đăng Chơn',
    matchScore: 80,
    reasons: ['phrase_match'],
  },
  priority: {
    urgency: 90,
    budget: 70,
    areaMatch: 80,
    campaignMatch: 80,
    activity: 50,
    buyingTimeline: 85,
    engagement: 60,
    aiConfidence: 70,
    finalScore: 88,
  },
  action: { action: 'call', label: 'Gọi ngay', reason: 'Ready' },
  isBuyer: true,
  isVip: true,
  updatedAt: new Date().toISOString(),
};

const card = formatBuyerAlertText({
  profile,
  title: 'Buyer cần Mai Đăng Chơn',
  budgetMin: 12,
  budgetMax: 15,
});
assert(card.includes('🔥 Buyer Alert'), 'buyer alert header');
assert(card.includes('Mai Đăng Chơn'), 'campaign in alert');
assert(card.includes('Gọi ngay'), 'suggestion in alert');
console.log('\n--- Buyer Alert sample ---\n' + card);
console.log(`\nSmoke OK — ${passed}/${cases.length} intent cases + alert format`);
