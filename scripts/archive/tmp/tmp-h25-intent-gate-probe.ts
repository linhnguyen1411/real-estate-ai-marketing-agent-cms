/**
 * H2.5 FINAL GATE probe — classification / asset / fail-closed / hijack.
 * No DB writes.
 */
import { classifyByRules } from '../server/modules/control-plane';
import {
  detectSalesMode,
  matchAssetIdentity,
  validateAssetIdentity,
  AssetValidationError,
} from '../server/modules/planning';

type Row = { gate: string; ok: boolean; detail: string };
const rows: Row[] = [];
function check(gate: string, ok: boolean, detail: string) {
  rows.push({ gate, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${gate}] ${detail}`);
}

const campaignCases: Array<[string, string]> = [
  ['A', 'Tạo mission bán shophouse khối đế cho các tòa nhà sun'],
  ['B', 'Tạo campaign bán shophouse Sun Symphony'],
  ['C', 'Làm chiến dịch bán Sun Cora'],
  ['D', 'Marketing cho Sun Cosmo'],
  ['E', 'Bán khối đế Sun Spana'],
  ['F', 'Tìm buyer cho Sun Symphony'],
  ['G', 'Research Sun Cora'],
];

console.log('\n=== 1. CLASSIFICATION ===');
for (const [id, u] of campaignCases) {
  const c = classifyByRules(u);
  const mode = detectSalesMode(u);
  check(
    `classify:${id}`,
    c.name === 'ai_sales_campaign' && mode === 'campaign_board' && c.name !== 'unknown',
    `intent=${c.name} conf=${c.confidence} mode=${mode} :: ${u}`,
  );
}

console.log('\n=== 2. ASSET EXTRACTION ===');
const assetCases = [
  ['Sun Cora', 'Làm chiến dịch bán Sun Cora', /sun\s*cora/i],
  ['Sun Spana', 'Bán khối đế Sun Spana', /sun\s*spana/i],
  ['Sun Symphony', 'Tạo campaign bán shophouse Sun Symphony', /sun\s*symphony/i],
  ['Sun Cosmo', 'Marketing cho Sun Cosmo', /sun\s*cosmo/i],
  ['shophouse', 'Tạo mission bán shophouse khối đế cho các tòa nhà sun', /shophouse/i],
  ['khối đế', 'Bán khối đế Sun Symphony', /khối đế|khoi de|shophouse/i],
  ['retail podium', 'Bán retail podium Sun Cora', /retail podium|shophouse|sun\s*cora/i],
];
for (const [label, u, re] of assetCases) {
  const a = matchAssetIdentity({ utterance: u as string });
  let valid = true;
  try {
    validateAssetIdentity(a);
  } catch {
    valid = false;
  }
  const hit = re.test(`${a.name} ${a.project || ''} ${a.type}`);
  check(
    `asset:${label}`,
    valid && hit && !/^(bđs|căn hộ|bất động sản)$/i.test(a.name.trim()),
    `name=${a.name} type=${a.type} project=${a.project} developer=${a.developer}`,
  );
}

console.log('\n=== 3. FAIL-CLOSED ===');
for (const u of ['Bán bất động sản', 'Tạo chiến dịch']) {
  const c = classifyByRules(u);
  const a = matchAssetIdentity({ utterance: u });
  let prompt: string | null = null;
  try {
    validateAssetIdentity(a);
  } catch (e) {
    prompt = e instanceof AssetValidationError ? e.prompt : String(e);
  }
  const asks =
    Boolean(prompt) &&
    (/dự án|san pham|sản phẩm|asset|cụ thể/i.test(prompt || '') || /muốn bán/i.test(prompt || ''));
  check(
    `failclosed:${u.slice(0, 24)}`,
    c.name === 'ai_sales_campaign' && Boolean(prompt) && asks,
    `intent=${c.name} asset=${a.name} prompt=${prompt}`,
  );
}

console.log('\n=== 5. HIJACK REGRESSION ===');
const hijack: Array<[string, string | null]> = [
  ['Máy nào đang bận?', 'fleet_summary'],
  ['Có lỗi không?', 'incident_summary'],
  ['Scanner sao rồi?', 'scanner_summary'],
  ['Publisher thế nào?', 'publisher_summary'],
  ['Tại sao Scanner không chạy?', 'runtime_explain'],
  ['Research giá Sun Symphony', 'ai_sales_research'],
  ['Research giá thị trường Đà Nẵng', 'ai_sales_research'],
  ['Viết content cho campaign này', 'ai_sales_content'],
  ['Mission nào đang chạy?', 'mission_summary'],
  ['Marketing thế nào hôm nay?', 'marketing_org_summary'],
  ['Content plan tuần này', 'ai_sales_content'],
];
for (const [u, exp] of hijack) {
  const c = classifyByRules(u);
  const ok = exp ? c.name === exp : c.name !== 'ai_sales_campaign' && c.name !== 'unknown';
  check(`hijack:${u.slice(0, 28)}`, ok, `intent=${c.name} expected=${exp ?? 'NOT campaign/unknown'}`);
}

console.log('\n=== 6. NO UNKNOWN FALLBACK FOR CAMPAIGN ===');
for (const [, u] of campaignCases) {
  const c = classifyByRules(u);
  check(`nofallback:${u.slice(0, 28)}`, c.name !== 'unknown' && c.confidence >= 0.75, `intent=${c.name} conf=${c.confidence}`);
}

const failed = rows.filter(r => !r.ok);
console.log(`\nSUMMARY ${rows.length - failed.length}/${rows.length} PASS`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.gate}: ${f.detail}`);
  process.exit(1);
}
console.log('GATE PROBE: ALL PASS');
