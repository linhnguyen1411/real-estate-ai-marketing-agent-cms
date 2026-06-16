/**
 * Test Post Block Scanner logic (no DOM)
 * Run: npx tsx scripts/test-block-scanner.ts
 */
import { cleanFacebookNoise } from '../chrome-extension/src/lib/cleanFacebookNoise';
import { extractVietnamPhones } from '../server/lib/extractVietnamPhones';
import { extractLeadContextAroundPhone, hasRealEstateContext } from '../chrome-extension/src/lib/phoneContextExtractor';

function classifyDemand(text: string): string {
  const n = text.toLowerCase();
  if (n.includes('cần bán') || n.includes('can ban') || n.includes('bán')) return 'sell';
  if (n.includes('mua')) return 'buy';
  if (n.includes('cho thuê')) return 'lease';
  if (n.includes('thuê')) return 'rent';
  return 'unknown';
}

function extractProperty(text: string): string {
  const n = text.toLowerCase();
  if (n.includes('lô') || n.includes('đất') || n.includes('dat')) return 'land';
  if (n.includes('căn hộ')) return 'apartment';
  return 'other';
}

function extractBudget(text: string): number {
  const n = text.toLowerCase().replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '');
  const m = n.match(/(\d+)ty(\d{2,4})/) || n.match(/(\d+)\s*ty\s*(\d+)/);
  return m ? Number(`${m[1]}.${m[2]}`) : 0;
}

const NOISY_INPUT =
  'Tìm bạn bè... Facebook Facebook... BẤT ĐỘNG SẢN ĐÀ NẴNG... Hưng Thịnh Land... ' +
  'Cần Bán nhanh lô Thanh lương 16, Hoà xuân, Tp Đà Nẵng. Block: B1.54 Hướng: Tây Bắc Giá: 5ty850 Lh 0905274869 #BDSHoaxuan ... ' +
  'Thích Bình luận Chia sẻ...';

const MULTI_INPUT = [
  'Cần bán lô A LH 0905274869 giá 3 tỷ Hòa Xuân',
  'Bán đất B LH 0911796192 Cam Lệ 5 tỷ',
  'Cho thuê shophouse Zalo 0935888999 Đà Nẵng'
].join('\n---\n');

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

// Test 1: clean noise
const cleaned = cleanFacebookNoise(NOISY_INPUT);
assert('Không còn Facebook lặp', !/facebook facebook/i.test(cleaned));
assert('Không còn Thích/Bình luận', !/thích/i.test(cleaned) && !/bình luận/i.test(cleaned));
assert('Còn nội dung bài', cleaned.includes('Cần Bán') || cleaned.includes('Cần bán'));

// Test 2: single lead extraction
const phones1 = extractVietnamPhones(cleaned);
assert('Phone 0905274869', phones1.validPhones.includes('0905274869'));
const raw = phones1.rawMatches.find(r => r.replace(/\D/g, '').includes('0905274869')) || '0905274869';
const ctx = extractLeadContextAroundPhone(cleaned, raw);
assert('Context BĐS', hasRealEstateContext(ctx.cleanContextText));
assert('Demand sell', classifyDemand(ctx.cleanContextText) === 'sell');
assert('Property land', extractProperty(ctx.cleanContextText) === 'land');
assert('Location Hòa Xuân', /hoà xuân|hoa xuan/i.test(ctx.cleanContextText));
assert('Budget 5.850', Math.abs(extractBudget(ctx.cleanContextText) - 5.85) < 0.01);
assert('Raw content sạch', !ctx.cleanContextText.toLowerCase().includes('facebook'));

// Test 3: multi lead
let multiCount = 0;
for (const chunk of MULTI_INPUT.split('\n---\n')) {
  const c = cleanFacebookNoise(chunk);
  const pr = extractVietnamPhones(c);
  for (const phone of pr.validPhones) {
    const rawM = pr.rawMatches.find(r => r.replace(/\D/g, '').includes(phone.replace(/\D/g, ''))) || phone;
    const { cleanContextText } = extractLeadContextAroundPhone(c, rawM);
    if (hasRealEstateContext(cleanContextText)) multiCount += 1;
  }
}
assert('Multi lead: 3 leads', multiCount === 3, `got ${multiCount}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
