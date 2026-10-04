/**
 * MASTER PLAN VERIFICATION SUITE
 * Tests all 5 stages of the Master Plan:
 * 1. Intent Classification (Supply vs. Demand)
 * 2. Lead Scoring Engine (Phone 30, Budget 25, Location 25, Urgency 20)
 * 3. Listing Normalization & Property Signature Deduplication
 * 4. Dynamic Adaptive Scheduling & CDP Self-Healing logic
 * 5. Dual-Inventory Auto-Matching & Fast Mini Landing Page
 */

import assert from 'node:assert';
import {
  classifyPostType,
  evaluateLeadScore,
} from '../server/agent/extractors/leadScoring';
import {
  extractProjectLotDetails,
  buildPropertySignature,
  normalizeListing,
  mapStandardPropertyType,
} from '../server/agent/listingNormalization';
import { extractLeadData } from '../server/agent/extractors';
import {
  computeAdaptiveScanInterval,
  computeNextScanAt,
} from '../server/agent/agentScheduler';
import { matchPropertiesForLead } from '../server/agent/propertyMatchingService';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 RUNNING MASTER PLAN VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('   ', err.message);
    }
  }

  async function testAsync(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('   ', err.message);
    }
  }

  // --- HẠNG MỤC 1: PHÂN TÁCH CUNG / CẦU (INTENT CLASSIFIER) ---
  console.log('--- TEST GROUP 1: Phân tách Intent Cung vs Cầu ---');

  test('1.1. Phân loại chuẩn xác nhóm DEMAND (Khách tìm mua)', () => {
    const text = 'Gia đình cần tìm mua lô đất Nam Hòa Xuân, tài chính tầm 3.5 tỷ, hướng Đông Nam. Ai có ib mình 0905123456';
    const res = classifyPostType(text);
    assert.strictEqual(res.postType, 'DEMAND', `Expected DEMAND, got ${res.postType}`);
  });

  test('1.2. Phân loại chuẩn xác nhóm DEMAND (Khách tìm thuê)', () => {
    const text = 'Mình cần thuê căn hộ 2PN Sơn Trà hoặc Ngũ Hành Sơn, ngân sách dưới 10tr/tháng, vào ở ngay.';
    const res = classifyPostType(text);
    assert.strictEqual(res.postType, 'DEMAND', `Expected DEMAND, got ${res.postType}`);
  });

  test('1.3. Phân loại chuẩn xác nhóm SUPPLY (Tin rao bán)', () => {
    const text = 'Chính chủ cần bán gấp lô đất B2-12 Nam Hòa Xuân, diện tích 100m2, giá chỉ 3.6 tỷ có thương lượng. Sổ đỏ sẵn công chứng ngay. LH 0905777888';
    const res = classifyPostType(text);
    assert.strictEqual(res.postType, 'SUPPLY', `Expected SUPPLY, got ${res.postType}`);
  });

  test('1.4. Phân loại chuẩn xác nhóm SUPPLY (Tin cho thuê)', () => {
    const text = 'Cho thuê nhà nguyên căn mặt tiền Cẩm Lệ, 3 tầng full nội thất, giá 15tr/tháng. Liên hệ 0914000111';
    const res = classifyPostType(text);
    assert.strictEqual(res.postType, 'SUPPLY', `Expected SUPPLY, got ${res.postType}`);
  });

  test('1.5. Phân loại tin mơ hồ về UNKNOWN', () => {
    const text = 'Thời tiết Đà Nẵng hôm nay đẹp quá mọi người ơi.';
    const res = classifyPostType(text);
    assert.strictEqual(res.postType, 'UNKNOWN', `Expected UNKNOWN, got ${res.postType}`);
  });

  // --- HẠNG MỤC 2: BÓC TÁCH LEAD & CHẤM ĐIỂM (0 - 100 ĐIỂM) ---
  console.log('\n--- TEST GROUP 2: Lead Extraction & Scoring Engine ---');

  test('2.1. Lead hoàn hảo đủ 4 tiêu chí đạt 100 điểm', () => {
    // SĐT: +30, Ngân sách: +25, Khu vực: +25, Cấp thiết: +20 = 100đ
    const text = 'Cần mua gấp trong tuần lô đất Nam Hòa Xuân, tài chính 3.5 tỷ công chứng ngay. LH 0905777594';
    const res = evaluateLeadScore(text);
    assert.strictEqual(res.breakdown.phoneScore, 30, 'Phone score must be 30');
    assert.strictEqual(res.breakdown.budgetScore, 25, 'Budget score must be 25');
    assert.strictEqual(res.breakdown.locationScore, 25, 'Location score must be 25');
    assert.strictEqual(res.breakdown.urgencyScore, 20, 'Urgency score must be 20');
    assert.strictEqual(res.intentScore, 100, `Expected 100, got ${res.intentScore}`);
    assert.strictEqual(res.isHighPriorityLead, true, 'Must be marked as high priority');
    assert.strictEqual(res.extracted.primaryPhone, '0905777594');
  });

  test('2.2. Lead có SĐT + Ngân sách + Khu vực (80đ, >=70đ trigger alert)', () => {
    const text = 'Tìm mua nhà phố Hòa Xuân ngân sách khoảng 4 tỷ. Liên hệ Zalo 0935112233.';
    const res = evaluateLeadScore(text);
    assert.strictEqual(res.intentScore, 80, `Expected 80, got ${res.intentScore}`);
    assert.strictEqual(res.isHighPriorityLead, true, 'Score 80 must be high priority');
    assert.strictEqual(res.breakdown.urgencyScore, 0, 'No urgency keywords');
  });

  test('2.3. Lead thiếu SĐT nhưng có budget + location (50đ, < 70đ)', () => {
    const text = 'Mình tìm đất khu FPT City hoặc Hòa Quý, tài chính tầm 2.8 tỷ.';
    const res = evaluateLeadScore(text);
    assert.strictEqual(res.intentScore, 50, `Expected 50, got ${res.intentScore}`);
    assert.strictEqual(res.isHighPriorityLead, false, 'Score 50 must not trigger alert');
    assert.strictEqual(res.extracted.primaryPhone, null);
  });

  // --- HẠNG MỤC 3: CHUẨN HÓA TIN & KHỬ TRÙNG (PROPERTY SIGNATURE) ---
  console.log('\n--- TEST GROUP 3: Chuẩn hóa dữ liệu & Khử trùng lặp (Clustering) ---');

  test('3.1. Bóc tách chính xác Block và Lô tại dự án Nam Hòa Xuân', () => {
    const text = 'Bán lô đất B2-12 lô 35 Nam Hòa Xuân vị trí đẹp';
    const details = extractProjectLotDetails(text);
    assert.strictEqual(details.project, 'Nam Hòa Xuân');
    assert.strictEqual(details.block, 'B2-12');
    assert.strictEqual(details.lot, '35');
  });

  test('3.2. Thuật toán Property Signature gom cụm tin đăng của các môi giới khác nhau', () => {
    // Cùng 1 lô B2-15 lô 20 Nam Hòa Xuân, 100m2, giá đăng 3.5 tỷ vs 3.52 tỷ
    const sig1 = buildPropertySignature({
      location: 'Nam Hòa Xuân',
      project: 'Nam Hòa Xuân',
      block: 'B2-15',
      lot: '20',
      areaM2: 100,
      priceVnd: 3_500_000_000,
    });

    const sig2 = buildPropertySignature({
      location: 'Nam Hòa Xuân',
      project: 'Nam Hòa Xuân',
      block: 'B2-15',
      lot: '20',
      areaM2: 100,
      priceVnd: 3_520_000_000, // Sai lệch nhẹ do môi giới khác kê giá
    });

    assert.strictEqual(sig1, sig2, 'Hai tin cùng căn/lô đất phải có propertySignature trùng khớp');
  });

  test('3.3. Chuẩn hóa loại hình BĐS', () => {
    assert.strictEqual(mapStandardPropertyType(['đất nền']), 'Đất nền');
    assert.strictEqual(mapStandardPropertyType(['nhà phố', 'nhà kiệt']), 'Nhà phố');
    assert.strictEqual(mapStandardPropertyType(['căn hộ chung cư']), 'Căn hộ');
    assert.strictEqual(mapStandardPropertyType(['biệt thự']), 'Biệt thự');
    assert.strictEqual(mapStandardPropertyType(['shophouse']), 'Mặt bằng / Shophouse');
  });

  test('3.4. Chuẩn hóa tính đơn giá/m2 và phát hiện Spam', () => {
    const rawText = 'Cần bán gấp nhà phố Cẩm Lệ, diện tích 100m2, giá 4 tỷ. Sổ hồng riêng. LH 0905123456';
    const extraction = extractLeadData(rawText);
    const normalized = normalizeListing(rawText, extraction);

    assert.strictEqual(normalized.standardPropertyType, 'Nhà phố');
    assert.strictEqual(normalized.areaM2, 100);
    assert.strictEqual(normalized.priceVnd, 4_000_000_000);
    assert.strictEqual(normalized.unitPricePerM2Vnd, 40_000_000, 'Đơn giá phải là 40tr/m2');
    assert.strictEqual(normalized.isSpam, false, 'Tin chuẩn không bị coi là spam');
  });

  test('3.5. Nhận diện tin spam thiếu cả vị trí và giá', () => {
    const spamText = 'Ai cần mua ib em tư vấn hỗ trợ nhé.';
    const extraction = extractLeadData(spamText);
    const normalized = normalizeListing(spamText, extraction);
    assert.strictEqual(normalized.isSpam, true, 'Phải phát hiện spam khi thiếu cả vị trí và giá');
  });

  // --- HẠNG MỤC 4: LẬP LỊCH THÔNG MINH THEO KHUNG GIỜ ---
  console.log('\n--- TEST GROUP 4: Dynamic Adaptive Crawling (Lập lịch thông minh) ---');

  test('4.1. Giờ cao điểm sáng (09:00 VN) quét chu kỳ 15 phút', () => {
    // 09:00 VN = 02:00 UTC
    const peakMorning = new Date('2026-10-04T02:00:00Z');
    const schedule = computeAdaptiveScanInterval(peakMorning);
    assert.strictEqual(schedule.timeWindow, 'peak');
    assert.strictEqual(schedule.intervalMinutes, 15);
  });

  test('4.2. Giờ cao điểm tối (20:00 VN) quét chu kỳ 15 phút', () => {
    // 20:00 VN = 13:00 UTC
    const peakEvening = new Date('2026-10-04T13:00:00Z');
    const schedule = computeAdaptiveScanInterval(peakEvening);
    assert.strictEqual(schedule.timeWindow, 'peak');
    assert.strictEqual(schedule.intervalMinutes, 15);
  });

  test('4.3. Giờ đêm (01:00 VN) quét giãn cách 120 phút', () => {
    // 01:00 VN = 18:00 UTC hôm trước
    const night = new Date('2026-10-04T18:00:00Z');
    const schedule = computeAdaptiveScanInterval(night);
    assert.strictEqual(schedule.timeWindow, 'night');
    assert.strictEqual(schedule.intervalMinutes, 120);
  });

  test('4.4. Giờ bình thường chiều (17:30 VN) quét chu kỳ 45 phút', () => {
    // 17:30 VN = 10:30 UTC
    const normal = new Date('2026-10-04T10:30:00Z');
    const schedule = computeAdaptiveScanInterval(normal);
    assert.strictEqual(schedule.timeWindow, 'normal');
    assert.strictEqual(schedule.intervalMinutes, 45);
  });

  // --- HẠNG MỤC 5: AUTO-MATCHING & FAST MINI LANDING PAGE ---
  console.log('\n--- TEST GROUP 5: Auto-Matching Engine & Dual-Inventory ---');

  await testAsync('5.1. So khớp tự động Demand Lead với kho BĐS nội bộ', async () => {
    const matchRes = await matchPropertiesForLead({
      classification: 'buyer',
      location: 'Nam Hòa Xuân',
      budgetMin: 3_000_000_000,
      budgetMax: 4_500_000_000,
      propertyTypes: ['đất nền'],
    });

    assert.ok(Array.isArray(matchRes.items), 'Kết quả phải trả về danh sách items');
    console.log(`     -> Khớp được ${matchRes.items.length} BĐS phù hợp.`);
    if (matchRes.items.length > 0) {
      const top = matchRes.items[0];
      console.log(`     -> Top match: "${top.title}" (${top.priceDisplay}) - Độ tương thích: ${top.compatibilityPct}%`);
      assert.ok(top.compatibilityPct >= 40, 'Độ tương thích phải >= 40%');
    }
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
