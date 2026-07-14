#!/usr/bin/env node
/**
 * Lead Intelligence shared domain — guards, phone/money, golden fixtures, DTO.
 */
import assert from 'assert';
import {
  isLeadIntelligenceClassification,
  isLeadIntelligenceIntent,
  isLeadIntelligenceActorRole,
  resolveLeadIntelligence,
  resolveLeadIntelligenceFromSources,
  toLeadIntelligenceListDTO,
  toLeadIntelligenceDetailDTO,
  resolvePrimaryPhone,
  formatPhoneForDisplay,
  moneyToVndString,
  moneyRangeDTO,
  validateLeadIntelligenceDTO,
  normalizeNullableNumber,
  normalizeStringArray,
} from '../shared/agent-domain';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

// --- runtime guards ---
ok('classification buyer', isLeadIntelligenceClassification('buyer'));
ok('classification rejects foo', !isLeadIntelligenceClassification('foo'));
ok('intent buy', isLeadIntelligenceIntent('buy'));
ok('actor demand', isLeadIntelligenceActorRole('demand_side'));

// --- phone legacy object ---
{
  const r = resolvePrimaryPhone(
    { raw: '0905 111 222', normalized: '0905111222', label: 'mobile' },
    [{ raw: '0905111222' }],
  );
  ok('primaryPhone is string', typeof r.primaryPhone === 'string');
  ok('legacy object flagged', r.legacyFallbacksUsed.includes('legacy_primary_phone_object'));
  ok('display format', formatPhoneForDisplay(r.primaryPhone) === '0905 111 222');
}

// --- money ---
ok('bigint to string', moneyToVndString(3_000_000_000n) === '3000000000');
ok('null money', moneyToVndString(null) === null);
ok(
  'money range',
  moneyRangeDTO({ min: 3e9, max: 4e9 }).minVnd === '3000000000' &&
    moneyRangeDTO({ min: 3e9, max: 4e9 }).maxVnd === '4000000000',
);
ok('nullable number', normalizeNullableNumber('12.5') === 12.5);
ok('string array', normalizeStringArray(['a', '', 'b']).length === 2);

// --- golden: buyer ---
{
  const input = {
    id: 'fix-buyer',
    title: 'Cần mua nhà 3–4 tỷ Đà Nẵng',
    summary: 'Tín hiệu phía cầu (buyer). Khách cần mua nhà 3-4 tỷ tại Đà Nẵng.',
    score: 100,
    classification: 'buyer',
    intent: 'buy',
    actorRole: 'demand_side',
    finalScore: 72,
    leadFitScore: 80,
    aiScore: 70,
    keywordScore: 40,
    primaryPhone: '0905111222',
    primaryLocation: 'Đà Nẵng',
    budgetMin: '3000000000',
    budgetMax: '4000000000',
    status: 'new',
    extractedData: {},
  };
  const r = resolveLeadIntelligenceFromSources(input);
  ok('buyer classification', r.classification === 'buyer');
  ok('buyer confirmed', r.showAsConfirmedLead === true);
  ok('buyer phone string', r.primaryPhone === '0905111222');
  ok('never use score as final when final present', r.finalScore === 72);
  const list = toLeadIntelligenceListDTO(r, { status: 'new', findingId: 'fix-buyer' });
  ok('list DTO id', list.id === 'fix-buyer');
  ok('list omits full content key', !('fullOriginalContent' in list));
  const detail = toLeadIntelligenceDetailDTO(r, { status: 'new' });
  ok('detail has intelligence', detail.intelligence.classification === 'buyer');
}

// --- golden: seller supply ---
{
  const r = resolveLeadIntelligence({
    id: 'fix-seller',
    title: 'Bán lô đất 100m2 giá hơn 3 tỷ',
    summary: 'Chào bán đất nền.',
    classification: 'seller',
    intent: 'sell',
    actorRole: 'supply_side',
    askingPrice: '3100000000',
    finalScore: null,
    score: 90,
    extractedData: {
      money: { askingPriceMin: 3100000000, askingPriceMax: 3100000000 },
    },
  });
  ok('seller supply preferred', r.externalInventoryPreferred === true);
  ok('seller not demand promote', r.isSupplySide === true);
}

// --- golden: legacy score 100 / null classification ---
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
  ok('legacy score display needs review', r.displayScoreLabel === 'Cần xem lại');
  ok('legacy score not confirmed', r.showAsConfirmedLead === false);
}

// --- golden: broker ---
{
  const r = resolveLeadIntelligence({
    title: 'Vinhomes Hải Vân Bay quỹ độc quyền',
    classification: 'broker',
    actorRole: 'broker',
    intent: 'sell',
    finalScore: null,
    extractedData: {},
  });
  ok('broker inventory preferred', r.externalInventoryPreferred === true);
}

// --- golden: renter / investor ---
{
  const renter = resolveLeadIntelligence({
    classification: 'renter',
    intent: 'rent',
    actorRole: 'demand_side',
    finalScore: 60,
    title: 'Cần thuê mặt bằng',
    summary: 'Thuê mặt bằng mở quán',
  });
  ok('renter demand', renter.isDemandSide && renter.classification === 'renter');
  const inv = resolveLeadIntelligence({
    classification: 'investor',
    intent: 'invest',
    actorRole: 'demand_side',
    finalScore: 66,
    title: 'Cần mua dòng tiền',
    summary: 'Tìm tài sản cashflow',
  });
  ok('investor', inv.classification === 'investor');
}

// --- validation ---
{
  const r = resolveLeadIntelligence({
    id: 'x',
    title: 't',
    classification: 'buyer',
    finalScore: 50,
    primaryPhone: '0905',
  });
  const v = validateLeadIntelligenceDTO(r);
  ok('validate resolves ok-ish', Array.isArray(v.warnings));
}

// identity with shared entrypoint
ok(
  'alias equals',
  resolveLeadIntelligenceFromSources({ classification: 'buyer', title: 'a' }).classification ===
    resolveLeadIntelligence({ classification: 'buyer', title: 'a' }).classification,
);

console.log(`\n${passed} assertions passed`);
