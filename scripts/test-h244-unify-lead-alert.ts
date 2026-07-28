/**
 * H2.4.4 — Unify Telegram Lead Alert into ONE canonical Sales Action Card.
 * Covers A–N (formatter + gates + dedupe key + buttons). No live Telegram required.
 * Run: npx tsx scripts/test-h244-unify-lead-alert.ts
 */

import assert from 'node:assert/strict';
import {
  classifyBuyerHeat,
  shouldSendBuyerAlert,
} from '../server/modules/sales-layer/buyerHeat';
import {
  formatSalesActionCard,
  resolveLeadAlertRole,
  salesActionCardKeyboard,
  buildLeadCenterUrl,
} from '../server/modules/sales-layer/telegramSalesActionCard';
import { formatLeadTelegramAlert } from '../server/notifications/telegramFormatter';
import { leadAlertEventKey } from '../server/notifications/telegramNotificationService';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import type { LeadAcquisitionProfile } from '../server/modules/lead-acquisition/types';

function acq(
  over: Partial<LeadAcquisitionProfile> & {
    intentLabel?: string;
    finalScore?: number;
    isBuyer?: boolean;
  } = {},
): LeadAcquisitionProfile {
  const finalScore = over.finalScore ?? 76;
  const intentLabel = over.intentLabel ?? 'ready_buyer';
  return {
    version: 'h3_v1',
    findingId: over.findingId || 'f-h244',
    pipelineStage: 'qualified',
    intent: {
      intent: intentLabel as LeadAcquisitionProfile['intent']['intent'],
      confidence: finalScore / 100,
      matchedPatterns: [],
      reasons: ['test'],
    },
    persona: { persona: 'unknown', confidence: 0.5, reasons: [] },
    timeline: 'within_7_days',
    campaignMatch: {
      campaignId: null,
      campaignName: null,
      propertyHint: null,
      matchScore: 0,
      reasons: [],
    },
    priority: {
      urgency: 50,
      budget: 50,
      areaMatch: 50,
      campaignMatch: 0,
      activity: 50,
      buyingTimeline: 50,
      engagement: 50,
      aiConfidence: 50,
      finalScore,
    },
    action: { action: 'call', label: 'Gọi ngay', reason: 'test' },
    isBuyer: over.isBuyer ?? true,
    isVip: false,
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

// A. Buyer 85 → HOT → canonical
{
  const card = formatSalesActionCard({
    findingId: 'a-buyer',
    acquisition: acq({ finalScore: 85, intentLabel: 'ready_buyer', isBuyer: true }),
    confidencePct: 85,
    role: 'buyer',
    location: 'Ngũ Hành Sơn',
    budgetMin: 5,
    budgetMax: 7,
    phone: '0901111222',
    title: 'Cần mua đất',
  });
  ok('A header', card.includes('🎯 LEAD ALERT'));
  ok('A hot', card.includes('🔥 HOT'));
  ok('A role', card.includes('Người mua'));
  ok('A confidence', card.includes('BUYER CONFIDENCE: 85%'));
  ok('A no legacy score', !/Lead mới|Score \d+\/100|LEAD SCORE/.test(card));
}

// B. Tenant 76 → WARM
{
  const card = formatSalesActionCard({
    findingId: 'b-tenant',
    acquisition: acq({
      finalScore: 76,
      intentLabel: 'renter',
      isBuyer: false,
    }),
    confidencePct: 76,
    role: 'tenant',
    location: 'Liên Chiểu',
    budgetMax: 12_000_000,
    phone: '0903522712',
    sourceLabel: 'Group: HỘI MUA BÁN NHÀ VÀ ĐẤT ĐÀ NẴNG',
    needSummary: 'Khách cần thuê giá thuê ≤ 12 triệu/tháng',
  });
  ok('B warm', card.includes('🟡 WARM'));
  ok('B tenant role', card.includes('Người thuê'));
  ok('B confidence 76', card.includes('BUYER CONFIDENCE: 76%'));
  ok('B budget rent', /12.*triệu/.test(card));
  ok('B phone', card.includes('0903522712'));
  ok('B single metric', !card.includes('Score 76/100'));
}

// C. Investor 66 → WARM
{
  const card = formatSalesActionCard({
    findingId: 'c-inv',
    acquisition: acq({ finalScore: 66, intentLabel: 'investor', isBuyer: true }),
    confidencePct: 66,
    role: 'investor',
    location: 'Liên Chiểu',
    title: 'Nhà đầu tư tại Liên Chiểu',
  });
  ok('C warm', card.includes('🟡 WARM'));
  ok('C investor', card.includes('Nhà đầu tư'));
  ok('C confidence', card.includes('BUYER CONFIDENCE: 66%'));
}

// D. score 39 → no Telegram
ok('D skip <40', shouldSendBuyerAlert(39) === false);
ok('D heat skip', classifyBuyerHeat(39).heat === 'skip');

// E/F role gates
ok('E spam role null', resolveLeadAlertRole({ classification: 'spam' }) === null);
ok('F seller role null', resolveLeadAlertRole({ classification: 'seller' }) === null);
ok('F broker role null', resolveLeadAlertRole({ classification: 'broker' }) === null);
ok('E/F buyer ok', resolveLeadAlertRole({ classification: 'buyer', isBuyer: true }) === 'buyer');
ok('E/F tenant ok', resolveLeadAlertRole({ intent: 'renter' }) === 'tenant');

// G missing budget
{
  const card = formatSalesActionCard({
    findingId: 'g',
    confidencePct: 70,
    role: 'buyer',
    location: 'Hòa Xuân',
  });
  ok('G no empty budget', !card.includes('💰'));
  ok('G still renders', card.includes('🎯 LEAD ALERT'));
}

// H missing location
{
  const card = formatSalesActionCard({
    findingId: 'h',
    confidencePct: 70,
    role: 'buyer',
    budgetMin: 3,
    budgetMax: 4,
  });
  ok('H no empty location', !card.includes('📍'));
  ok('H still renders', card.includes('💰'));
}

// I/J dedupe key stable
{
  const k1 = leadAlertEventKey('lead-abc');
  const k2 = leadAlertEventKey('lead-abc');
  ok('I same NEW_LEAD key', k1 === k2);
  ok('I key shape', k1 === 'finding:lead-abc:telegram:new');
  ok('J retry same key', k1 === leadAlertEventKey('lead-abc'));
}

// K buttons + finding id
{
  const fid = 'finding-h244-btn-id-xxxxxxxxxx';
  const kb = salesActionCardKeyboard({
    findingId: fid,
    sourceUrl: 'https://www.facebook.com/groups/1/posts/2',
    leadCenterUrl: 'https://example.com/admin/agents/lead-center?findingId=' + fid,
    hasPhone: true,
    phone: '0905111222',
  });
  const flat = kb.inline_keyboard.flat();
  const id = fid.slice(0, 48);
  ok('K call id', flat.some(b => b.callback_data === `l:k:${id}`));
  ok('K contact id', flat.some(b => b.callback_data === `l:t:${id}`));
  ok('K assign id', flat.some(b => b.callback_data === `l:a:${id}`));
  ok('K history id', flat.some(b => b.callback_data === `l:h:${id}`));
  ok('K ignore id', flat.some(b => b.callback_data === `l:s:${id}`));
  ok('K call maps', callbackDataToCommand(`l:k:${id}`) === `/lead call ${id}`);
  ok('K contact maps', callbackDataToCommand(`l:t:${id}`) === `/lead contact ${id}`);
}

// L source permalink
{
  const url = 'https://www.facebook.com/groups/999/posts/888';
  const kb = salesActionCardKeyboard({ findingId: 'fL', sourceUrl: url });
  const src = kb.inline_keyboard.flat().find(b => b.text.includes('Source'));
  ok('L real source url', Boolean(src && 'url' in src && src.url === url));
}

// M Open Lead deep-link
{
  process.env.PUBLIC_SITE_URL = 'https://bdsdanang.site';
  const deep = buildLeadCenterUrl('finding-open-me');
  ok(
    'M deep link',
    deep === 'https://bdsdanang.site/admin/agents/lead-center?findingId=finding-open-me',
  );
  const kb = salesActionCardKeyboard({
    findingId: 'finding-open-me',
    leadCenterUrl: deep,
  });
  const open = kb.inline_keyboard.flat().find(b => b.text.includes('Open Lead'));
  ok('M open url btn', Boolean(open && 'url' in open && open.url === deep));
}

// N legacy formatter → canonical (no crash, no Lead mới)
{
  const legacy = formatLeadTelegramAlert(
    {
      id: 'legacy-1',
      finalScore: 76,
      classification: 'renter',
      needSummary: 'Cần thuê',
      primaryPhone: '0903522712',
    },
    null,
    { includePhone: true },
  );
  ok('N no crash', Boolean(legacy.text));
  ok('N canonical', legacy.text.includes('🎯 LEAD ALERT'));
  ok('N no Lead mới', !/Lead mới \(\d+\/100\)/.test(legacy.text));
  ok('N tenant', legacy.text.includes('Người thuê'));
}

console.log(`\nPASS H2.4.4 unify lead alert (${passed} checks)`);
