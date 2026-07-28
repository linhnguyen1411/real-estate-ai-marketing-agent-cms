/**
 * H2.4.9 — Urgent Buyers drill-down unit tests.
 * Run: npx tsx scripts/test-h249-urgent-buyers-drilldown.ts
 */
import assert from 'node:assert/strict';
import {
  selectUrgentBuyers,
  formatUrgentBuyersListText,
  urgentBuyersListKeyboard,
  dailyBriefingSalesKeyboard,
  formatSalesDailyBriefing,
  isUrgentSalesProfile,
  type PipelineSalesRow,
} from '../server/modules/sales-layer';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import type { SalesLayerProfile } from '../server/modules/sales-layer/types';

function profile(partial: Partial<SalesLayerProfile> & { urgency: 'urgent' | 'soon' | 'normal' | 'low'; label?: string }): SalesLayerProfile {
  return {
    version: 'h35_v1',
    findingId: partial.findingId || 'f1',
    buyerKey: 'bk',
    canonicalFindingId: partial.findingId || 'f1',
    mergedFindingIds: [],
    journeyStage: 'interested',
    pipelineStage: 'qualified',
    signals: [],
    timeline: [],
    stageHistory: [],
    owner: null,
    expectedCloseAt: null,
    probability: 0.5,
    expectedDealTy: 5,
    recommendation: {
      code: 'call_now',
      label: partial.label || 'Gọi ngay',
      reason: 'test',
      urgency: partial.urgency,
    },
    followUp: { needsFollowUp: false, coolingHours: 0, reason: null, suggestion: null },
    updatedAt: new Date().toISOString(),
    ...partial,
  } as SalesLayerProfile;
}

function row(id: string, urgency: 'urgent' | 'soon', confidence: number): PipelineSalesRow {
  return {
    findingId: id,
    personName: `Person ${id}`,
    title: `Title ${id}`,
    propertyType: 'đất nền',
    location: 'Ngũ Hành Sơn',
    classification: 'buyer',
    budgetMin: 5,
    budgetMax: 5,
    askingPrice: null,
    confidencePct: confidence,
    profile: profile({ findingId: id, urgency, label: 'Gọi ngay' }),
    campaignId: null,
    campaignName: null,
    sourceId: null,
    sourceName: null,
    createdAt: new Date(),
    closedAt: null,
    intent: 'buyer',
    persona: 'land',
    isBuyer: true,
    timeline: 'buying_today',
  };
}

let n = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  n += 1;
  console.log(`✓ ${name}`);
}

const rows = [
  row('f1', 'urgent', 86),
  row('f2', 'urgent', 82),
  row('f3', 'soon', 90),
  row('f4', 'urgent', 70),
  row('f5', 'urgent', 88),
  row('f6', 'urgent', 60),
];

// Count integrity via selectUrgentBuyers vs filter
{
  const urgentOnly = rows.filter(r => isUrgentSalesProfile(r.profile));
  const { total, items } = selectUrgentBuyers(rows, { limit: 10 });
  ok('count=5', total === 5);
  ok('list=5', items.length === 5);
  ok('same filter size', total === urgentOnly.length);
  ok('sorted by priority', items[0]!.confidence >= items[1]!.confidence);
  ok('no soon in list', !items.some(i => i.id === 'f3'));
}

// empty
{
  const { total, items } = selectUrgentBuyers(rows.filter(r => r.findingId === 'f3'));
  ok('empty total 0', total === 0);
  ok('empty items', items.length === 0);
  const text = formatUrgentBuyersListText({ total: 0, items: [] });
  ok('empty state', text.includes('Không có khách cần xử lý gấp'));
}

// formatting hides nulls / no internal ids
{
  const { items } = selectUrgentBuyers(rows, { limit: 2 });
  const text = formatUrgentBuyersListText({ total: 5, items, page: 0 });
  ok('header', text.includes('🚨 URGENT BUYERS · 5'));
  ok('who', text.includes('Person'));
  ok('confidence', /Confidence \d+%/.test(text));
  ok('next', text.includes('→ Gọi ngay'));
  ok('no undefined', !text.includes('undefined') && !text.includes('null'));
  ok('no campaign id leak', !/campaignId|traceId|findingId=/i.test(text));
}

// keyboard open buttons
{
  const { items, total } = selectUrgentBuyers(rows, { limit: 5 });
  const kb = urgentBuyersListKeyboard({ items, total, page: 0 });
  const flat = kb.inline_keyboard.flat();
  ok('open buttons', flat.filter(b => b.text.startsWith('Open #')).length === 5);
  const open1 = flat.find(b => b.text === 'Open #1');
  ok(
    'open maps to sales card',
    Boolean(
      open1 &&
        'callback_data' in open1 &&
        callbackDataToCommand(open1.callback_data!)?.startsWith('/sales card '),
    ),
  );
  ok('list callback', callbackDataToCommand('s:u:list') === '/sales urgent');
  ok('page callback', callbackDataToCommand('s:u:p:1') === '/sales urgent 1');
}

// briefing text + keyboard
{
  const metrics = {
    detected: 8,
    qualified: 6,
    assigned: 0,
    contacted: 0,
    appointment: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
    pipelineValueTy: 157,
    estimatedRevenueTy: 0,
    expectedRevenueTy: 39.4,
    averageDealSizeTy: 0,
    winRate: 0,
    averageDays: 0,
    needFollowUp: 0,
    urgentBuyers: 5,
    byCampaign: [],
    bySource: [],
  };
  const brief = formatSalesDailyBriefing(metrics);
  ok('brief urgent section', brief.includes('🚨 URGENT BUYERS · 5'));
  ok('brief cta', brief.includes('5 khách cần xử lý ngay'));
  const kb = dailyBriefingSalesKeyboard(5);
  ok('brief btn', Boolean(kb?.inline_keyboard.flat().some(b => /Xem 5 khách/.test(b.text))));
  const zero = dailyBriefingSalesKeyboard(0);
  ok(
    'no zero urgent btn',
    !zero?.inline_keyboard.flat().some(b => /Xem 0/.test(b.text)),
  );
  const emptyBrief = formatSalesDailyBriefing({ ...metrics, urgentBuyers: 0 });
  ok('zero empty', emptyBrief.includes('Không có khách cần xử lý gấp'));
}

// invalid callback controlled
{
  ok('unknown s returns null', callbackDataToCommand('s:x:foo') === null);
}

console.log(`\nPASS H2.4.9 urgent buyers drill-down (${n} checks)`);
