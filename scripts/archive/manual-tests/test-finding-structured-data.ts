#!/usr/bin/env node
/**
 * Structured extraction + scoreStatus tests
 */
import assert from 'assert';
import {
  resolveLeadIntelligence,
  formatResolvedBudget,
  formatVietnamPhoneDisplay,
} from '../src/utils/resolveLeadIntelligence';
import { extractPhoneData } from '../server/agent/extractors/phoneExtractor';
import { extractMoney } from '../server/agent/extractors/moneyExtractor';
import { buildStructuredFindingPatch } from '../server/agent/findingStructuredData';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  const r = resolveLeadIntelligence({
    title: 'Post title không phải tên',
    summary: 'x',
    score: 100,
    scannedContent: { authorName: 'Nguyễn Văn A', authorUrl: 'https://facebook.com/a' },
    extractedData: {},
  });
  ok('authorName → personName', r.person.name === 'Nguyễn Văn A');
}

{
  const phones = extractPhoneData('Zalo 0905 777 594 hoặc +84905777594');
  ok('phone normalize', phones.primaryPhone === '0905777594');
  ok('dedupe phones', phones.phones.length === 1);
  ok('display format', formatVietnamPhoneDisplay('0905777594') === '0905 777 594');
}

{
  const money = extractMoney('Ngân sách 3–4 tỷ gần trung tâm');
  const budget = money.find(m => m.type === 'buyer_budget');
  ok('buyer budget 3-4 tỷ', Boolean(budget && budget.minAmountVnd && budget.maxAmountVnd));
}

{
  const money = extractMoney('Cần thuê dưới 20 triệu/tháng');
  const rent = money.find(m => m.type === 'rent_price');
  ok('rent budget 20 triệu', Boolean(rent && (rent.maxAmountVnd || rent.minAmountVnd)));
}

{
  const r = resolveLeadIntelligence({
    title: 'Khách tìm',
    summary: 'x',
    classification: 'buyer',
    actorRole: 'demand_side',
    primaryLocation: 'Đà Nẵng, Hải Châu',
    propertyType: 'khách sạn',
    budgetMin: 3_000_000_000,
    budgetMax: 4_000_000_000,
    extractedData: {
      intelligence: { needSummary: 'Khách cần mua khách sạn khu Hải Châu Đà Nẵng, ngân sách 3–4 tỷ.' },
    },
  });
  ok('location Đà Nẵng', /Đà Nẵng/i.test(r.primaryLocation || ''));
  ok('property type khách sạn', r.propertyTypes.some(t => /khách sạn/i.test(t)));
  ok('needSummary no technical', !/matched keyword|kw score|buyer signal/i.test(r.demand.needSummary));
  ok('budget label', formatResolvedBudget(r.budgetMin, r.budgetMax).includes('tỷ'));
}

{
  const patch = buildStructuredFindingPatch({
    title: 'Khách tìm mua nhà',
    summary: 'Cần mua nhà Đà Nẵng ngân sách 3 tỷ. 0905111222',
    score: 100,
    classification: 'buyer',
    actorRole: 'demand_side',
    keywordScore: 40,
    scannedContent: {
      authorName: 'Lan',
      contentText: 'Cần mua nhà Đà Nẵng ngân sách 3 tỷ. 0905111222',
      canonicalUrl: 'https://facebook.com/groups/x/posts/1',
    },
    extractedData: {},
  });
  ok('AI fail still has needSummary', Boolean(patch.needSummary));
  ok('provisional when no aiScore', patch.scoreStatus === 'provisional');
  ok('phone extracted', patch.primaryPhone === '0905111222');
  ok('person from author', patch.personName === 'Lan');
}

{
  const r = resolveLeadIntelligence({
    title: 'x',
    summary: 'y',
    score: 100,
    classification: 'buyer',
    actorRole: 'demand_side',
    finalScore: 86,
    aiScore: 80,
    leadFitScore: 90,
    keywordScore: 50,
    extractedData: {},
  });
  ok('scored display', r.displayScoreLabel === '86');
}

{
  const r = resolveLeadIntelligence({
    title: 'x',
    summary: 'y',
    score: 100,
    classification: 'unknown',
    finalScore: null,
    extractedData: { scoreBreakdown: { finalScore: 100 } },
  });
  ok('unknown không dùng score cũ 100', r.displayScoreLabel === 'Cần xem lại');
  ok('finalScore null', r.finalScore == null || r.scoreStatus === 'needs_review');
}

{
  const text =
    'Dãy trọ 4 phòng đang khai thác ổn định Dt 109,2m² ngang 5,2m - nhỉnh 6 tỷ Kiệt ô tô Võ Duy Ninh Sơn Trà Dòng tiền sẵn';
  const patch = buildStructuredFindingPatch({
    title: text.slice(0, 80),
    summary: text,
    score: 100,
    extractedData: { classification: 'investor', intent: 'invest' },
    scannedContent: { contentText: text, authorName: null },
  });
  ok('cashflow listing → seller not investor', patch.classification === 'seller');
  ok('listing asking ~6 tỷ', patch.askingPrice?.toString() === '6000000000');
  ok('property type dãy trọ', patch.primaryPropertyType === 'dãy trọ');
  ok('needSummary chào bán/nguồn', /chào bán|nguồn hàng/i.test(patch.needSummary || ''));
  ok('not investor need wording', !/nhà đầu tư tìm|khách cần mua/i.test(patch.needSummary || ''));
}

{
  const text = `Nhỉnh 3 tỷ có lô đất đường 5m5 lề 3m sạch đẹp. Gần núi gần sông gần biển mát mẻ. Khu dân cư mới dân trí cao tại Đà Nẵng
Diện tích: 100m2
Hướng Đông Nam
Hotline: 0886815252 xem đất có giá tốt
Zalo: 0901989133 Ms Tú`;

  const phones = extractPhoneData(text);
  ok('Ms Tú phones length 2', phones.phones.length === 2);
  ok('Ms Tú primary Zalo', phones.primaryPhone === '0901989133');
  ok(
    'Ms Tú hotline label',
    phones.phones.find(p => p.normalized === '0886815252')?.label === 'hotline',
  );
  ok(
    'Ms Tú zalo label',
    phones.phones.find(p => p.normalized === '0901989133')?.label === 'zalo',
  );

  const moneyNhinh = extractMoney('Nhỉnh 3 tỷ có lô đất');
  ok('nhỉnh 3 tỷ asking', moneyNhinh[0]?.type === 'asking_price');
  ok('nhỉnh qualifier', moneyNhinh[0]?.qualifier === 'slightly_above');
  ok('nhỉnh min 3e9', moneyNhinh[0]?.minAmountVnd === 3_000_000_000);
  ok('nhỉnh display', moneyNhinh[0]?.display === 'Trên 3 tỷ');

  const moneyXxx = extractMoney('Giá 3 tỷ xxx đường 5m');
  ok('3 tỷ xxx asking', moneyXxx.some(m => m.type === 'asking_price' && m.minAmountVnd === 3_000_000_000));

  const patch = buildStructuredFindingPatch({
    title: 'Facebook post',
    summary: 'Khách cần mua tại Đà Nẵng',
    classification: 'buyer',
    actorRole: 'demand_side',
    intent: 'buy',
    primaryPhone: { normalized: '0886815252', raw: '0886815252' } as unknown as string,
    scannedContent: { contentText: text, authorName: null },
    extractedData: {
      intelligence: { needSummary: 'Khách cần mua tại Đà Nẵng' },
      contact: {
        phones: [
          { normalized: '0886815252', raw: '0886815252', label: 'hotline' },
          { normalized: '0901989133', raw: '0901989133', label: 'zalo', contactName: 'Ms Tú' },
        ],
        primaryPhone: { normalized: '0886815252' },
      },
    },
  });

  ok('Ms Tú displayName', patch.personName === 'Ms Tú');
  ok('Ms Tú primaryPhone string', patch.primaryPhone === '0901989133');
  ok('Ms Tú classification seller', patch.classification === 'seller');
  ok('Ms Tú actorRole supply', patch.actorRole === 'supply_side');
  ok('Ms Tú intent sell', patch.intent === 'sell');
  ok('Ms Tú asking 3e9', patch.askingPrice?.toString() === '3000000000');
  ok('Ms Tú city', patch.primaryLocation === 'Đà Nẵng');
  ok('Ms Tú property land', patch.primaryPropertyType === 'land');
  ok('Ms Tú no buyer summary', !/khách cần mua/i.test(patch.needSummary || ''));
  ok('Ms Tú chào bán summary', /chào bán/i.test(patch.needSummary || ''));

  const resolved = resolveLeadIntelligence({
    ...patch,
    scannedContent: { contentText: text },
    extractedData: patch.extractedData,
    askingPrice: patch.askingPrice,
    primaryPhone: patch.primaryPhone,
    personName: patch.personName,
    classification: patch.classification,
    actorRole: patch.actorRole,
    intent: patch.intent,
    primaryLocation: patch.primaryLocation,
    propertyType: patch.primaryPropertyType,
  });
  ok('resolver primaryPhone string', typeof resolved.primaryPhone === 'string');
  ok('no object Object in phones', !resolved.phones.some(p => /object Object/i.test(String(p))));
  ok('legacy object not in UI string', !/\[object Object\]/.test(String(resolved.primaryPhone)));
  ok('road 5.5', resolved.property.roadWidthMeters === 5.5);
  ok('pavement 3', resolved.property.pavementWidthMeters === 3);
  ok('direction Đông Nam', resolved.property.direction === 'Đông Nam');
  ok('area 100', resolved.property.areaMinM2 === 100);
  ok('qualifier slightly_above', resolved.priceQualifier === 'slightly_above');
  ok('budget Trên 3 tỷ', resolved.displayBudgetLabel === 'Trên 3 tỷ');
}

{
  // Symmetric cashflow: demand investor vs supply seller / broker
  const demandPatch = buildStructuredFindingPatch({
    title: 'Cần mua',
    summary: 'Cần mua tài sản dòng tiền 5 tỷ Đà Nẵng',
    score: 80,
    scannedContent: {
      contentText: 'Cần mua tài sản dòng tiền 5 tỷ Đà Nẵng',
      authorName: null,
    },
    extractedData: {},
  });
  ok(
    'demand cashflow → investor or buyer',
    demandPatch.classification === 'investor' || demandPatch.classification === 'buyer',
  );
  ok('demand cashflow actor demand_side', demandPatch.actorRole === 'demand_side');

  const supplySale = buildStructuredFindingPatch({
    title: 'Bán nhà',
    summary: 'Bán nhà dòng tiền 20 triệu/tháng, giá 5 tỷ. Hotline 0905111222',
    score: 80,
    scannedContent: {
      contentText: 'Bán nhà dòng tiền 20 triệu/tháng, giá 5 tỷ. Hotline 0905111222',
      authorName: null,
    },
    extractedData: {},
  });
  ok('sale cashflow → seller', supplySale.classification === 'seller');
  ok('sale cashflow supply_side', supplySale.actorRole === 'supply_side');
  ok('sale cashflow intent sell', supplySale.intent === 'sell');

  const brokerDemand = buildStructuredFindingPatch({
    title: 'Khách cần',
    summary: 'Khách cần tìm toà căn hộ đang khai thác Đà Nẵng',
    score: 80,
    scannedContent: {
      contentText: 'Khách cần tìm toà căn hộ đang khai thác Đà Nẵng',
      authorName: null,
    },
    extractedData: {},
  });
  ok(
    'broker demand cashflow',
    brokerDemand.classification === 'broker' ||
      brokerDemand.classification === 'investor' ||
      brokerDemand.classification === 'buyer',
  );
  ok(
    'broker demand not supply',
    brokerDemand.actorRole === 'broker' || brokerDemand.actorRole === 'demand_side',
  );

  const brokerSupply = buildStructuredFindingPatch({
    title: 'Em có',
    summary: 'Em có toà căn hộ dòng tiền tốt giá 8 tỷ ib em',
    score: 80,
    scannedContent: {
      contentText: 'Em có toà căn hộ dòng tiền tốt giá 8 tỷ ib em',
      authorName: null,
    },
    extractedData: {},
  });
  ok(
    'broker supply cashflow',
    brokerSupply.classification === 'broker' || brokerSupply.classification === 'seller',
  );
  ok(
    'broker supply not demand_side alone',
    brokerSupply.actorRole === 'broker' || brokerSupply.actorRole === 'supply_side',
  );
}

{
  const r = resolveLeadIntelligence({
    title: 'x',
    summary: 'y',
    primaryPhone: { normalized: '0901989133', raw: '0901.989.133' } as unknown as string,
    extractedData: {
      contact: {
        phones: [{ normalized: '0901989133', raw: '0901989133', label: 'zalo' }],
        primaryPhone: { normalized: '0901989133' },
      },
    },
  });
  ok('legacy primaryPhone object → string', r.primaryPhone === '0901989133');
  ok(
    'formatVietnamPhoneDisplay object-safe',
    formatVietnamPhoneDisplay(r.primaryPhone) === '0901 989 133',
  );
  ok(
    'formatVietnamPhoneDisplay on object',
    formatVietnamPhoneDisplay({ normalized: '0901989133' } as unknown as string) ===
      '0901 989 133' ||
      formatVietnamPhoneDisplay({ normalized: '0901989133' } as unknown as string) === '',
  );
}

console.log(`\n${passed} assertions passed`);
