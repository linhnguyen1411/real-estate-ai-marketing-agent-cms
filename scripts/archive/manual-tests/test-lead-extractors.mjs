#!/usr/bin/env node
/**
 * Deterministic extractor unit tests (phone / money / location / property).
 * Run: npm run test:lead-extractors
 */
import { extractPhoneData, normalizeVietnamPhone } from '../server/agent/extractors/phoneExtractor.ts';
import { extractMoneyData } from '../server/agent/extractors/moneyExtractor.ts';
import { extractLocation } from '../server/agent/extractors/locationExtractor.ts';
import { extractPropertyData, extractArea } from '../server/agent/extractors/propertyExtractor.ts';
import { extractLeadData } from '../server/agent/extractors/index.ts';

let passed = 0;
let failed = 0;
function assert(cond, label, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
    if (detail !== undefined) console.error('    ', JSON.stringify(detail));
  }
}

console.log('\n=== Deterministic extractors — unit tests ===\n');

console.log('Phone');
{
  assert(extractPhoneData('Liên hệ 0905 777 594').primaryPhone === '0905777594', 'spaces -> 0905777594');
  assert(extractPhoneData('call 0905.777.594 nhé').primaryPhone === '0905777594', 'dots -> 0905777594');
  assert(extractPhoneData('sdt 0905-777-594').primaryPhone === '0905777594', 'dashes -> 0905777594');
  assert(extractPhoneData('Alo +84905777594').primaryPhone === '0905777594', '+84 normalize');
  assert(extractPhoneData('84 905 777 594').primaryPhone === '0905777594', '84 prefix normalize');
  assert(extractPhoneData('Zalo 0936 112 151').primaryPhone === '0936112151', '0936 112 151');
  const e164 = normalizeVietnamPhone('0905777594');
  assert(e164 && e164.e164 === '+84905777594', 'e164 form', e164);
  // money must NOT be a phone
  assert(extractPhoneData('giá 3 tỷ 500 triệu').phones.length === 0, 'money not phone', extractPhoneData('giá 3 tỷ 500 triệu').phones);
  assert(extractPhoneData('diện tích 500m2').phones.length === 0, 'area not phone');
  // dedupe
  assert(extractPhoneData('0905777594 hoặc 0905 777 594').phones.length === 1, 'dedupe same number');
}

console.log('\nMoney');
{
  const budget = extractMoneyData('cần mua nhà tài chính 3-4 tỷ');
  assert(budget.budgetMin === 3_000_000_000 && budget.budgetMax === 4_000_000_000, 'range 3-4 tỷ -> budget', budget);
  const ask = extractMoneyData('bán nhà giá 4 tỷ 500');
  assert(ask.askingPrice === 4_500_000_000, '4 tỷ 500 -> 4.5 tỷ asking', ask);
  const ask2 = extractMoneyData('bán gấp giá 4 tỷ 5');
  assert(ask2.askingPrice === 4_500_000_000, '4 tỷ 5 -> 4.5 tỷ', ask2);
  const rent = extractMoneyData('cho thuê 15tr/tháng');
  assert(rent.rentPrice === 15_000_000, '15tr/tháng -> rent 15tr', rent);
  const rent2 = extractMoneyData('cho thuê căn hộ 40 triệu/tháng');
  assert(rent2.money[0]?.period === 'month' && rent2.rentPrice === 40_000_000, '40 triệu/tháng monthly', rent2);
  const trieu = extractMoneyData('giá 950 triệu');
  assert(trieu.askingPrice === 950_000_000, '950 triệu', trieu);
  const combo = extractMoneyData('giá 1 tỷ 200 triệu');
  assert(combo.askingPrice === 1_200_000_000, '1 tỷ 200 triệu', combo);
  const under = extractMoneyData('cần mua tầm dưới 5 tỷ');
  assert(under.money.some(m => m.maxAmountVnd === 5_000_000_000), 'dưới 5 tỷ -> max', under);
  const area = extractMoneyData('lô đất 500m2 đẹp');
  assert(area.money.length === 0, '500m2 not money', area.money);
  const negotiable = extractMoneyData('giá thương lượng');
  assert(negotiable.money.length === 1 && negotiable.money[0].minAmountVnd === null, 'thương lượng negotiable', negotiable);
}

console.log('\nLocation');
{
  const loc = extractLocation('bán đất Mai Đăng Chơn, Ngũ Hành Sơn, Đà Nẵng');
  assert(loc.city === 'Đà Nẵng', 'city Đà Nẵng', loc);
  assert(loc.district === 'Ngũ Hành Sơn', 'district NHS', loc);
  assert(loc.normalizedLocations.includes('Mai Đăng Chơn'), 'street mention', loc);
  const fpt = extractLocation('nhà gần FPT giá tốt');
  assert(fpt.primaryLocation === 'FPT City' && fpt.confidence <= 0.5, 'FPT soft alias low confidence', fpt);
  const none = extractLocation('bán nhà đẹp lắm');
  assert(none.primaryLocation === null, 'no location -> null', none);
  const dn = extractLocation('mua nhà ĐN nhé');
  assert(dn.city === 'Đà Nẵng', 'ĐN abbr -> Đà Nẵng', dn);
}

console.log('\nProperty / Area / Demand');
{
  const area = extractArea('đất 5x20, đường ô tô vào');
  assert(area.frontageMeters === 5 && area.depthMeters === 20 && area.areaMinM2 === 100, '5x20 -> 100m2', area);
  const area2 = extractArea('ngang 10m, khoảng 650m2');
  assert(area2.frontageMeters === 10 && area2.areaMinM2 === 650, 'ngang + area', area2);
  const buyer = extractPropertyData('Cần mua nhà đất có dòng tiền tại Đà Nẵng, tài chính 3-4 tỷ, ô tô vào');
  assert(buyer.classification === 'buyer' && buyer.intent === 'buy', 'buyer classified', buyer);
  assert(buyer.requirements.includes('ô tô vào'), 'requirement ô tô vào', buyer.requirements);
  const broker = extractPropertyData('Sàn BĐS nhận ký gửi, môi giới chuyên nghiệp, chốt nhanh hoa hồng cao');
  assert(broker.classification === 'broker', 'broker not buyer', broker);
  const types = extractPropertyData('bán căn hộ chung cư và nhà phố').propertyTypes;
  assert(types.includes('căn hộ') && types.includes('nhà phố'), 'property types', types);
}

console.log('\nCombiner (buyer example)');
{
  const d = extractLeadData('Cần mua nhà đất có dòng tiền tại Đà Nẵng, tài chính 3-4 tỷ, ô tô vào. LH 0905 777 594');
  assert(d.property.classification === 'buyer', 'combiner buyer', d.property.classification);
  assert(d.money.budgetMin === 3_000_000_000 && d.money.budgetMax === 4_000_000_000, 'combiner budget', d.money);
  assert(d.location.city === 'Đà Nẵng', 'combiner city', d.location.city);
  assert(d.phone.primaryPhone === '0905777594', 'combiner phone', d.phone.primaryPhone);
  assert(d.status === 'succeeded', 'combiner status succeeded', d.status);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
