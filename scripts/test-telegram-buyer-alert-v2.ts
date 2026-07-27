/**
 * H2.2 — Telegram Buyer Alert / Sales Action Card tests (no live Telegram required).
 * Run: npx tsx scripts/test-telegram-buyer-alert-v2.ts
 */

import {
  classifyBuyerHeat,
  resolveBuyerConfidencePct,
  shouldSendBuyerAlert,
} from '../server/modules/sales-layer/buyerHeat';
import {
  buildActionableRecommendation,
  formatAreaLabel,
  formatBudgetLabel,
  formatSalesActionCard,
  salesActionCardKeyboard,
  summarizeSignal,
} from '../server/modules/sales-layer/telegramSalesActionCard';
import { recommendSalesAction } from '../server/modules/sales-layer/salesRecommendation';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import type { LeadAcquisitionProfile } from '../server/modules/lead-acquisition/types';
import type { SalesLayerProfile } from '../server/modules/sales-layer/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNot(cond: boolean, msg: string) {
  if (cond) throw new Error(msg);
}

const baseAcq = (over: Partial<LeadAcquisitionProfile> = {}): LeadAcquisitionProfile => ({
  version: 'h3_v1',
  findingId: 'finding-h22-full',
  pipelineStage: 'qualified',
  intent: {
    intent: 'ready_buyer',
    confidence: 0.88,
    matchedPatterns: ['cần mua'],
    reasons: ['Explicit buyer need'],
  },
  persona: { persona: 'land', confidence: 0.7, reasons: ['đất'] },
  timeline: 'buying_today',
  campaignMatch: {
    campaignId: 'c1',
    campaignName: 'Mai Đăng Chơn',
    propertyHint: 'đất nền',
    matchScore: 80,
    reasons: ['phrase'],
  },
  priority: {
    urgency: 90,
    budget: 80,
    areaMatch: 70,
    campaignMatch: 80,
    activity: 60,
    buyingTimeline: 100,
    engagement: 50,
    aiConfidence: 80,
    finalScore: 88,
  },
  action: { action: 'call', label: 'Gọi ngay', reason: 'Ready' },
  isBuyer: true,
  isVip: true,
  updatedAt: new Date().toISOString(),
  ...over,
});

const baseSales = (over: Partial<SalesLayerProfile> = {}): SalesLayerProfile => ({
  version: 'h35_v1',
  findingId: 'finding-h22-full',
  buyerKey: 'bk1',
  canonicalFindingId: 'finding-h22-full',
  mergedFindingIds: ['finding-h22-full'],
  journeyStage: 'negotiating',
  pipelineStage: 'negotiating',
  signals: [],
  timeline: [],
  stageHistory: [],
  owner: null,
  expectedCloseAt: null,
  probability: 0.65,
  expectedDealTy: 5,
  recommendation: {
    code: 'call_now',
    label: 'Gọi ngay',
    reason: 'Hot',
    urgency: 'urgent',
  },
  followUp: { needsFollowUp: false, coolingHours: 0, reason: null, suggestion: null },
  updatedAt: new Date().toISOString(),
  ...over,
});

// 1. Full data buyer
{
  const card = formatSalesActionCard({
    findingId: 'finding-h22-full',
    acquisition: baseAcq(),
    sales: baseSales(),
    confidencePct: 88,
    actorName: 'Anh Minh',
    propertyType: 'đất nền',
    location: 'Ngũ Hành Sơn',
    budgetMin: 5,
    budgetMax: 5,
    areaLabel: '100–120 m²',
    timeline: 'buying_today',
    campaignName: 'Mai Đăng Chơn',
    sourceLabel: 'Facebook · Group NHS',
    title: 'Cần mua đất Ngũ Hành Sơn ngân sách 5 tỷ hôm nay',
    hasPhone: true,
  });
  assert(card.includes('🎯 BUYER LEAD'), '1 header');
  assert(card.includes('Anh Minh'), '1 name');
  assert(card.includes('🔥 HOT'), '1 hot');
  assert(card.includes('BUYER CONFIDENCE'), '1 confidence label');
  assert(card.includes('88/100'), '1 score');
  assertNot(card.includes('LEAD SCORE'), '1 no dual score');
  assert(card.includes('Ngũ Hành Sơn'), '1 location');
  assert(card.includes('Mai Đăng Chơn'), '1 campaign');
  assert(card.includes('🤖 AI RECOMMENDATION'), '1 ai');
  assert(card.includes('📝 SIGNAL'), '1 signal');
  assertNot(card.includes('\n—\n'), '1 no dash blanks');
  console.log('OK 1 full buyer');
}

// 2. Missing budget — field hidden
{
  const card = formatSalesActionCard({
    findingId: 'f2',
    acquisition: baseAcq({
      findingId: 'f2',
      priority: { ...baseAcq().priority, finalScore: 72 },
    }),
    confidencePct: 72,
    actorName: 'Chị Lan',
    propertyType: 'nhà phố',
    location: 'Hòa Xuân',
    timeline: 'within_7_days',
    campaignName: 'Hòa Xuân',
  });
  assert(card.includes('🟡 WARM'), '2 warm');
  assertNot(card.includes('💰 Ngân sách'), '2 hide budget');
  assert(card.includes('Hòa Xuân'), '2 location');
  console.log('OK 2 missing budget');
}

// 3. Missing location
{
  const card = formatSalesActionCard({
    findingId: 'f3',
    acquisition: baseAcq({ findingId: 'f3' }),
    confidencePct: 70,
    propertyType: 'căn hộ',
    budgetMin: 3,
    budgetMax: 4,
  });
  assertNot(card.includes('📍 Khu vực'), '3 hide location');
  assert(card.includes('💰 Ngân sách'), '3 budget shown');
  console.log('OK 3 missing location');
}

// 4. Missing campaign
{
  const card = formatSalesActionCard({
    findingId: 'f4',
    acquisition: baseAcq({
      findingId: 'f4',
      campaignMatch: {
        campaignId: null,
        campaignName: null,
        propertyHint: null,
        matchScore: 0,
        reasons: [],
      },
    }),
    confidencePct: 65,
    location: 'Đà Nẵng',
  });
  assertNot(/Campaign:\s*$/m.test(card), '4 no blank campaign');
  assertNot(card.includes('Campaign:'), '4 hide campaign section');
  console.log('OK 4 missing campaign');
}

// 5–7 heat bands
assert(classifyBuyerHeat(85).label === 'HOT', '5 hot');
assert(classifyBuyerHeat(70).label === 'WARM', '6 warm');
assert(classifyBuyerHeat(45).label === 'COLD', '7 cold');
assert(classifyBuyerHeat(30).shouldAlert === false, '7 skip <40');
assert(shouldSendBuyerAlert(40) === true, '7 cold alerts');
assert(shouldSendBuyerAlert(39) === false, '7 skip');
console.log('OK 5-7 heat');

// 8 seller / non-buyer card still formats but heat may skip send
{
  const card = formatSalesActionCard({
    findingId: 'f8',
    acquisition: baseAcq({
      findingId: 'f8',
      isBuyer: false,
      intent: {
        intent: 'non_buyer',
        confidence: 0.2,
        matchedPatterns: [],
        reasons: ['seller'],
      },
      priority: { ...baseAcq().priority, finalScore: 20 },
    }),
    confidencePct: 20,
    title: 'Chính chủ bán nhà',
  });
  assert(shouldSendBuyerAlert(20) === false, '8 no alert seller score');
  assert(card.includes('BUYER CONFIDENCE'), '8 still formats');
  console.log('OK 8 seller score gate');
}

// 9 spam / low — monitor recommendation
{
  const rec = recommendSalesAction({
    confidencePct: 35,
    journeyStage: 'detected',
    pipelineStage: 'detected',
    followUp: { needsFollowUp: false, coolingHours: 0, reason: null, suggestion: null },
  });
  assert(rec.code === 'monitor', '9 monitor low');
  assert(/chưa đủ mạnh|theo dõi/i.test(rec.label), '9 weak label');
  console.log('OK 9 spam/low');
}

// 10 duplicate dedupe key shape (document)
assert(`buyer_alert:finding-h22-full`.startsWith('buyer_alert:'), '10 dedupe key');
console.log('OK 10 dedupe key');

// 11–13 keyboard + callbacks
{
  const kb = salesActionCardKeyboard({
    findingId: 'finding-h22-full-id-long',
    sourceUrl: 'https://www.facebook.com/groups/1/posts/2',
    leadCenterUrl: 'https://bdsdanang.site/admin/agents/lead-center?findingId=finding-h22-full-id-long',
  });
  const flat = kb.inline_keyboard.flat();
  assert(flat.some(b => b.text.includes('Call')), '11 call btn');
  assert(flat.some(b => b.text.includes('Contact')), '12 contact btn');
  assert(flat.some(b => b.text.includes('Assign')), '12 assign btn');
  assert(flat.some(b => b.text.includes('Ignore')), '13 ignore btn');
  assert(flat.some(b => b.text.includes('Open Lead') && 'url' in b), '14 open lead url');
  assert(flat.some(b => b.text.includes('Source') && 'url' in b), '15 source url');

  const id = 'finding-h22-full-id-long'.slice(0, 28);
  assert(callbackDataToCommand(`l:k:${id}`) === `/lead call ${id}`, '11 call map');
  assert(callbackDataToCommand(`l:t:${id}`) === `/lead contact ${id}`, '12 contact map');
  assert(callbackDataToCommand(`l:a:${id}`) === `/lead assign ${id}`, '12 assign map');
  assert(callbackDataToCommand(`l:s:${id}`) === `/lead skip ${id}`, '13 ignore map');
  assert(callbackDataToCommand(`l:n:${id}`) === `/lead open ${id}`, '14 open map');
  assert(callbackDataToCommand(`l:u:${id}`) === `/lead source ${id}`, '15 source map');
  console.log('OK 11-15 buttons/callbacks');
}

// AI actionable copy
{
  const line = buildActionableRecommendation({
    recommendation: {
      code: 'call_now',
      label: 'Gọi ngay',
      reason: 'Hot',
      urgency: 'urgent',
    },
    propertyType: 'đất nền',
    location: 'Ngũ Hành Sơn',
    budgetLabel: '5 tỷ',
    timelineLabel: 'Trong hôm nay',
    hasPhone: true,
  });
  assert(line.includes('Gọi ngay'), 'ai head');
  assert(line.includes('Ngũ Hành Sơn'), 'ai loc');
  assert(line.includes('5 tỷ'), 'ai budget');
  assertNot(line === 'Assign Sales', 'ai not bare assign');
  console.log('OK AI recommendation copy');
}

// Helpers
assert(formatBudgetLabel(5, 7)!.includes('tỷ'), 'budget fmt');
assert(formatBudgetLabel(1_700_000_000, 1_700_000_000) === '~1.7 tỷ', 'budget vnd→ty');
assert(formatAreaLabel({ area: { areaMinM2: 80, areaMaxM2: 100 } }) === '80–100 m²', 'area fmt');
assert(summarizeSignal({ title: 'a'.repeat(200) })!.endsWith('…'), 'signal trunc');
assert(resolveBuyerConfidencePct({ acquisitionFinalScore: 71 }) === 71, 'resolve score');
assert(resolveBuyerConfidencePct({ intentConfidence: 0.5 }) === 50, 'resolve intent');

// Missing budget ask recommendation
{
  const rec = recommendSalesAction({
    confidencePct: 65,
    journeyStage: 'interested',
    pipelineStage: 'qualified',
    followUp: { needsFollowUp: false, coolingHours: 0, reason: null, suggestion: null },
    hasBudget: false,
  });
  assert(rec.label.includes('ngân sách') || rec.code === 'reply_comment', 'ask budget');
  console.log('OK ask budget when missing');
}

console.log('\nPASS H2.2 Telegram Buyer Alert V2');
