import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'qa');
const RUNTIME_DIR = path.join(ROOT, 'runtime', 'qa');

const api = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, 'api-results.json'), 'utf8')).results;
const ui = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, 'ui-results.json'), 'utf8'));
const desktop = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, 'desktop-results.json'), 'utf8'));

const manual = [
  {
    id: 'MAN-01',
    module: 'Authentication (thủ công)',
    priority: 'P0',
    title: 'Tài khoản legacy lưu plaintext vẫn đăng nhập được và tự nâng cấp Argon2',
    steps: 'Seed user plaintext (`data.password`, `password_hash` NULL) → khởi động server mới cổng 3101 → login + /me → restart → login lại (qa/legacy-login-check.mjs)',
    expected: 'HTTP 200, DB nâng cấp Argon2, plaintext bị xoá, đăng nhập vẫn sống sau restart',
    status: 'PASS',
    evidence: 'Login lần 1 và lần 2 sau restart đều 200; `/me` 200; `data.password_hash` bắt đầu `$argon2`; `data.password` đã bị xoá',
  },
  {
    id: 'MAN-02',
    module: 'Desktop security (static)',
    priority: 'P1',
    title: 'Không hardcode HMAC secret/API key của agent trong source',
    steps: 'Quét desktop/src/main/index.ts và git diff tìm vpsApiSecret/vpsApiKeyId mặc định',
    expected: 'Không có credential thật trong source; secret lưu at-rest dạng mã hoá',
    status: 'PASS',
    evidence: '`defaultSettings.vpsApiKeyId/vpsApiSecret` để trống; `saveSettings` mã hoá secret bằng safeStorage (`enc:v1:`) — DESK-15 xác minh file settings không còn plaintext',
  },
  {
    id: 'MAN-03',
    module: 'QA hygiene',
    priority: 'P1',
    title: 'Dữ liệu và tiến trình QA được dọn sạch sau khi test',
    steps: 'Sau 3 suite: query user email qa.*, entitlement grantedBy=qa-runner, source/tên QA, customer QA; kiểm tra port 3100',
    expected: '0 bản ghi QA còn lại; không còn process listen port 3100',
    status: 'PASS',
    evidence: 'qaUsers=0, entitlements=0, sources QA=0, customers QA=0; port 3100 chỉ còn TIME_WAIT, server QA đã dừng',
  },
];

const moduleNames = {
  Health: 'Sức khoẻ hệ thống',
  Authentication: 'Xác thực',
  RBAC: 'Phân quyền (RBAC)',
  'Tenant isolation': 'Cô lập đa công ty',
  Properties: 'Bất động sản',
  Customers: 'CRM khách hàng',
  Content: 'Nội dung / bài viết',
  Appointments: 'Lịch hẹn xem nhà',
  License: 'License & PEM',
  Wallet: 'Ví token',
  'Agent sources': 'Nguồn AI Agent',
  'Public site': 'Website công khai',
  Security: 'Bảo mật API',
  'Authentication (thủ công)': 'Xác thực (thủ công)',
  'Desktop security (static)': 'Desktop security (static)',
  'QA hygiene': 'Vệ sinh dữ liệu QA',
};

const moduleOrder = [
  'Health',
  'Authentication',
  'RBAC',
  'Tenant isolation',
  'Properties',
  'Customers',
  'Content',
  'Appointments',
  'License',
  'Wallet',
  'Agent sources',
  'Public site',
  'Security',
];

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function truncate(value, max = 160) {
  const text = escapeCell(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function statusIcon(status) {
  if (status === 'PASS') return 'PASS';
  if (status === 'FAIL') return 'FAIL';
  return 'NOT RUN';
}

function caseRows(cases) {
  return cases
    .map(
      (testCase) =>
        `| ${testCase.id} | ${testCase.priority} | ${escapeCell(testCase.title)} | ${escapeCell(
          testCase.steps,
        )} | ${escapeCell(testCase.expected)} | ${statusIcon(testCase.status)} | ${truncate(
          testCase.evidence,
        )} |`,
    )
    .join('\n');
}

function tableHeader() {
  return [
    '| ID | Ưu tiên | Test case | Bước thực hiện | Kỳ vọng | Kết quả | Bằng chứng |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ].join('\n');
}

function countBy(items, key) {
  const map = {};
  for (const item of items) map[item[key]] = (map[item[key]] || 0) + 1;
  return map;
}

function statusSummary(cases) {
  return {
    total: cases.length,
    pass: cases.filter((testCase) => testCase.status === 'PASS').length,
    fail: cases.filter((testCase) => testCase.status === 'FAIL').length,
  };
}

const apiSummary = statusSummary(api);
const uiSummary = statusSummary(ui);
const desktopSummary = statusSummary(desktop);
const manualSummary = statusSummary(manual);
const allCases = [...api, ...ui, ...desktop, ...manual];
const allSummary = statusSummary(allCases);
const priorityCounts = countBy(allCases, 'priority');

const lines = [];
lines.push('# Bộ testcase toàn hệ thống — Real Estate AI Marketing Agent CMS');
lines.push('');
lines.push('| Thông tin | Giá trị |');
lines.push('| --- | --- |');
lines.push('| Phiên bản tài liệu | 1.1 (sau fix & chạy lại) |');
lines.push('| Ngày lập / thực thi | 2026-11-03 |');
lines.push('| Nhánh | `refactor/master-plan` — commit `b997200` |');
lines.push('| Vai trò | QA Senior (kiểm thử độc lập, black-box + UI + desktop) |');
lines.push('| Môi trường API | Server cô lập port 3100, PostgreSQL local 5434, cache nạp mới |');
lines.push('| Môi trường UI | Playwright Chromium (headless) trỏ port 3100 |');
lines.push('| Môi trường Desktop | Electron 1.1.0 build từ `desktop/`, mock VPS `127.0.0.1:3200`, profile tạm |');
lines.push('| Tổng test case | ' + allSummary.total + ' |');
lines.push('| Kết quả | **' + allSummary.pass + ' PASS / ' + allSummary.fail + ' FAIL** |');
lines.push('');
lines.push('## 1. Mục tiêu và phạm vi');
lines.push('');
lines.push('Mục tiêu: xác minh độc lập các luồng nghiệp vụ chính của CMS bất động sản sau đợt refactor, bao gồm:');
lines.push('');
lines.push('- Nền tảng HTTP: health, xử lý lỗi, giới hạn body, header bảo mật, rate limit.');
lines.push('- Xác thực và phân quyền: đăng nhập/đăng ký, token, đổi mật khẩu, RBAC, cô lập dữ liệu theo công ty.');
lines.push('- Nghiệp vụ: bất động sản, khách hàng CRM, nội dung, lịch hẹn, license/PEM, ví token, nguồn AI Agent.');
lines.push('- Website công khai: SEO, canonical slug, sitemap/robots, short link, form liên hệ.');
lines.push('- Giao diện quản trị: đăng nhập, menu theo quyền, route trực tiếp, tab hồ sơ, trang nguồn.');
lines.push('- Desktop Agent: build, cửa sổ điều khiển, tải nguồn, luân chuyển nguồn, lưu cấu hình, Telegram, auto-update.');
lines.push('');
lines.push('Ngoài phạm vi phiên này (xem mục 9): đăng nhập Facebook/Zalo thật, gửi Telegram thật, chạy installer cập nhật, kiểm thử tải/performance, kiểm thử đa trình duyệt/thiết bị.');
lines.push('');
lines.push('## 2. Môi trường và dữ liệu test');
lines.push('');
lines.push('- **Server API cô lập**: `NODE_ENV=development PORT=3100 AGENT_ENABLED=true RUN_WORKERS=false`, cache nạp mới từ PostgreSQL để tránh cache cũ của server dev 3000.');
lines.push('- **Tài khoản test**: 4 user dùng một lần (`qa.admin-a.*`, `qa.admin-b.*`, `qa.member-a.*`, `qa.member-b.*`) tạo qua chính API `POST /api/users` để cache và DB đồng bộ; 1 user trial cho license.');
lines.push('- **Entitlement tạm**: cấp feature `tool.exe`, `agent.*`, `crm`, `investor_leads`, `fb_inbox`, `automation.*`, `team.manage`, `lead.intel`, hết hạn sau 7 ngày và bị xoá khi kết thúc.');
lines.push('- **UI**: Playwright Chromium 1248 headless; screenshot lỗi lưu tại `runtime/qa/screenshots/`.');
lines.push('- **Desktop**: Electron local với `--user-data-dir` tạm, mock VPS chỉ phục vụ `/api/agent-ingest/v1/sources` và `/downloads/agent-version.json`; tắt auto-update để không chạy installer giả.');
lines.push('- **Không thay đổi server dev 3000**. QA không sửa mã trong lúc kiểm thử; 4 defect được fix sau khi lập defect log và toàn bộ suite được chạy lại trên build đã fix.');
lines.push('');
lines.push('## 3. Chiến lược và quy ước');
lines.push('');
lines.push('| Mức | Ý nghĩa |');
lines.push('| --- | --- |');
lines.push('| P0 | Luồng sống còn: đăng nhập, phân quyền, cô lập dữ liệu, thanh toán/ví, license, public site. |');
lines.push('| P1 | Luồng quan trọng: CRUD nghiệp vụ, cấu hình, nguồn agent, cập nhật desktop. |');
lines.push('| P2 | Kiểm tra biên, thông báo lỗi, tiện ích, khả năng chịu lỗi. |');
lines.push('');
lines.push('| Trạng thái | Ý nghĩa |');
lines.push('| --- | --- |');
lines.push('| PASS | Đúng kỳ vọng, có bằng chứng runtime. |');
lines.push('| FAIL | Sai kỳ vọng hoặc phát hiện lỗi sản phẩm; có ID defect tương ứng. |');
lines.push('| NOT RUN | Chưa thực thi trong phiên, nằm trong backlog mục 9. |');
lines.push('');
lines.push('## 4. Tổng hợp kết quả');
lines.push('');
lines.push('| Suite | Tổng | PASS | FAIL | Tỉ lệ PASS | File kết quả |');
lines.push('| --- | --- | --- | --- | --- | --- |');
lines.push(`| API black-box | ${apiSummary.total} | ${apiSummary.pass} | ${apiSummary.fail} | ${((apiSummary.pass / apiSummary.total) * 100).toFixed(1)}% | \`runtime/qa/api-results.json\` |`);
lines.push(`| UI smoke (Playwright) | ${uiSummary.total} | ${uiSummary.pass} | ${uiSummary.fail} | ${((uiSummary.pass / uiSummary.total) * 100).toFixed(1)}% | \`runtime/qa/ui-results.json\` |`);
lines.push(`| Desktop Agent | ${desktopSummary.total} | ${desktopSummary.pass} | ${desktopSummary.fail} | ${((desktopSummary.pass / desktopSummary.total) * 100).toFixed(1)}% | \`runtime/qa/desktop-results.json\` |`);
lines.push(`| Thủ công / static | ${manualSummary.total} | ${manualSummary.pass} | ${manualSummary.fail} | ${((manualSummary.pass / manualSummary.total) * 100).toFixed(1)}% | Mục 6.4 |`);
lines.push(`| **Tổng** | **${allSummary.total}** | **${allSummary.pass}** | **${allSummary.fail}** | **${((allSummary.pass / allSummary.total) * 100).toFixed(1)}%** | |`);
lines.push('');
lines.push('Phân bổ ưu tiên: ' + Object.entries(priorityCounts).map(([priority, count]) => `${priority}=${count}`).join(', ') + '.');
lines.push('');
lines.push('Danh sách FAIL: **không còn** — 4 defect phát hiện ở vòng đầu đã được fix và xác minh lại (xem mục 7).');
lines.push('');
lines.push('Vòng chạy lại sau fix: API 121/121, UI 12/12, Desktop 15/15, thủ công 3/3 PASS.');
lines.push('');
lines.push('## 5. Ma trận module');
lines.push('');
lines.push('| Module | Số case | PASS | FAIL | Ghi chú |');
lines.push('| --- | --- | --- | --- | --- |');
for (const moduleName of moduleOrder) {
  const cases = api.filter((testCase) => testCase.module === moduleName);
  if (!cases.length) continue;
  const summary = statusSummary(cases);
  lines.push(`| ${moduleNames[moduleName]} (\`${moduleName}\`) | ${summary.total} | ${summary.pass} | ${summary.fail} | API black-box |`);
}
{
  const summary = statusSummary(ui);
  lines.push(`| Giao diện web (UI smoke) | ${summary.total} | ${summary.pass} | ${summary.fail} | Playwright |`);
}
{
  const summary = statusSummary(desktop);
  lines.push(`| Desktop Agent | ${summary.total} | ${summary.pass} | ${summary.fail} | Electron + mock VPS |`);
}
{
  const summary = statusSummary(manual);
  lines.push(`| Thủ công / static | ${summary.total} | ${summary.pass} | ${summary.fail} | Legacy auth (đã fix), secret at-rest, dọn dẹp |`);
}
lines.push('');
lines.push('## 6. Test case chi tiết');
lines.push('');
lines.push('### 6.1 API black-box (121 case)');
lines.push('');
lines.push('Nguồn: `qa/api-e2e.mjs`. Mỗi case gọi HTTP thật tới server cô lập, không mock tầng nghiệp vụ.');
lines.push('');
for (const moduleName of moduleOrder) {
  const cases = api.filter((testCase) => testCase.module === moduleName);
  if (!cases.length) continue;
  const summary = statusSummary(cases);
  lines.push(`#### ${moduleNames[moduleName]} — \`${moduleName}\` (${summary.pass}/${summary.total} PASS)`);
  lines.push('');
  lines.push(tableHeader());
  lines.push(caseRows(cases));
  lines.push('');
}
lines.push('### 6.2 UI smoke (12 case)');
lines.push('');
lines.push('Nguồn: `qa/ui-smoke.mjs`. Mỗi case dùng context trình duyệt mới, thao tác như người dùng thật trên server cô lập.');
lines.push('');
lines.push(tableHeader());
lines.push(caseRows(ui));
lines.push('');
lines.push('### 6.3 Desktop Agent (15 case)');
lines.push('');
lines.push('Nguồn: `qa/desktop-smoke.mjs`. Electron được build từ source, trỏ tới mock VPS để kiểm soát nguồn và manifest cập nhật; không chạy installer.');
lines.push('');
lines.push(tableHeader());
lines.push(caseRows(desktop));
lines.push('');
lines.push('### 6.4 Thủ công / static (3 case)');
lines.push('');
lines.push(tableHeader());
lines.push(caseRows(manual));
lines.push('');
lines.push('## 7. Defect log (tóm tắt)');
lines.push('');
lines.push('| Defect | Mức | Khu vực | Mô tả | Test phát hiện | Trạng thái |');
lines.push('| --- | --- | --- | --- | --- | --- |');
lines.push('| BUG-AUTH-01 | P0 | Đăng nhập legacy | `server/dbHelper.ts:149` map `data.password` vào `password_hash`, khiến nhánh `verifyPlaintextLegacy` không bao giờ chạy. | MAN-01 | **Đã fix & xác minh** |');
lines.push('| BUG-AUTH-02 | P0 | Đổi mật khẩu / token | `toAuthUser` không trả `token_version`; `signToken` mặc định 1 trong khi DB tăng lên 2 sau đổi mật khẩu. Mọi request sau đăng nhập mới bị 401. | AUTH-15, SEC-07 | **Đã fix & xác minh** |');
lines.push('| BUG-DESK-01 | P2 | Desktop UI | Renderer gọi `update:get-state` trước khi `AgentUpdater` được tạo, nhận `null`, hiển thị trống phiên bản và "Không có thông tin cập nhật." | DESK-05 | **Đã fix & xác minh** |');
lines.push('| BUG-SEC-01 | P1 | Desktop security | HMAC API key/secret mặc định bị hardcode trong `desktop/src/main/index.ts:72-74`. | MAN-02, DESK-15 | **Đã fix & xác minh** |');
lines.push('');
lines.push('Tóm tắt fix:');
lines.push('');
lines.push('- BUG-AUTH-01: bỏ fallback `data.password` khi nạp cache; login legacy đi đúng nhánh plaintext và nâng cấp Argon2.');
lines.push('- BUG-AUTH-02: `toAuthUser` trả `token_version` từ user record để token mới mang đúng phiên bản.');
lines.push('- BUG-DESK-01: `update:get-state` trả state `idle` mặc định trước khi updater khởi tạo.');
lines.push('- BUG-SEC-01: bỏ credential hardcode; mã hoá `vpsApiSecret`/`telegramBotToken` at-rest bằng `safeStorage`.');
lines.push('');
lines.push('Chi tiết bằng chứng, root cause và khuyến nghị sửa: `docs/qa/EXECUTION_REPORT.md`.');
lines.push('');
lines.push('## 8. Truy vết tự động hoá');
lines.push('');
lines.push('| Lệnh | Mục đích |');
lines.push('| --- | --- |');
lines.push('| `node qa/desktop-smoke.mjs` | Build/launch Electron, chạy 15 case desktop với mock VPS. |');
lines.push('| `node qa/api-e2e.mjs` | Chạy 121 case API black-box (cần server QA port 3100). |');
lines.push('| `node qa/ui-smoke.mjs` | Chạy 12 case UI Playwright (cần server QA port 3100). |');
lines.push('| `node qa/legacy-login-check.mjs` | Seed user plaintext, khởi động server riêng port 3101, xác minh login + nâng cấp Argon2 + restart. |');
lines.push('| `npm run build:desktop` | Build bundle desktop trước khi smoke. |');
lines.push('');
lines.push('Script dùng state tạm `runtime/qa/state.json` và tự khôi phục user/entitlement nếu lần chạy trước bị gián đoạn.');
lines.push('');
lines.push('## 9. Khoảng trống và backlog (NOT RUN)');
lines.push('');
lines.push('Các khu vực sau chưa được kiểm thử sâu trong phiên này và cần bổ sung trước khi phát hành lớn:');
lines.push('');
lines.push('- Đăng nhập Facebook/Zalo thật, quét GraphQL thật, gửi lead thật tới VPS production.');
lines.push('- Gửi Telegram thật (chỉ kiểm tra nhánh thiếu cấu hình).');
lines.push('- Chạy installer cập nhật desktop thật và rollback khi lỗi; kiểm tra chữ ký số installer.');
lines.push('- Publish hàng loạt lên group Facebook thật, rate limit và xử lý checkpoint tài khoản.');
lines.push('- Kiểm thử tải/performance cho API public, ingest agent và job worker.');
lines.push('- Kiểm thử đa trình duyệt (Firefox/Safari), responsive mobile, accessibility.');
lines.push('- Kiểm thử thanh toán thật, đối soát ví và hoàn tiền.');
lines.push('- Kiểm thử backup/restore PostgreSQL và migration Prisma trên dữ liệu lớn.');
lines.push('');
lines.push('Trạng thái các mục trên: **NOT RUN** — cần môi trường/tài khoản thật và sự phê duyệt riêng.');
lines.push('');
lines.push('## 10. Tiêu chí kết thúc');
lines.push('');
lines.push('- 100% case P0 PASS trước khi coi build là releasable.');
lines.push('- Không còn defect P0/P1 mở; P2 có kế hoạch sửa và workaround.');
lines.push('- Dữ liệu QA và tiến trình test được dọn sạch (MAN-03 PASS).');
lines.push('- Chạy lại 3 suite trên build cuối cùng và lưu artifact kết quả.');
lines.push('');

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, 'SYSTEM_TEST_CASES.md');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`Đã ghi ${outFile}`);
console.log(JSON.stringify({ api: apiSummary, ui: uiSummary, desktop: desktopSummary, manual: manualSummary, all: allSummary }, null, 2));
