import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  BASE,
  prisma,
  TEST_EMAILS,
  TEST_PASSWORDS,
  SUPER_ADMIN,
  QA_PASSWORD,
  http,
  login,
  assert,
  assertEqual,
  assertStatus,
  setupTestEnv,
  restoreState,
  loadState,
  newState,
  saveState,
  resultsToMarkdown,
} from './lib.mjs';

const OUT_DIR = path.join(process.cwd(), 'runtime', 'qa');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const cases = [];
const results = [];
const state = newState();

function record(id, module, priority, title, steps, expected, fn) {
  cases.push({ id, module, priority, title, steps, expected, fn });
}

async function run(testCase, page) {
  const started = Date.now();
  try {
    const evidence = await testCase.fn(page);
    results.push({ ...testCase, fn: undefined, status: 'PASS', evidence, ms: Date.now() - started });
    console.log(`PASS ${testCase.id} — ${testCase.title}`);
  } catch (error) {
    let shot = '';
    try {
      if (page) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        shot = path.join(SHOT_DIR, `${testCase.id}.png`);
        await page.screenshot({ path: shot, fullPage: true });
      }
    } catch { /* best effort */ }
    results.push({
      ...testCase,
      fn: undefined,
      status: 'FAIL',
      evidence: `${error instanceof Error ? error.message : String(error)}${shot ? ` [screenshot: ${path.relative(process.cwd(), shot)}]` : ''}`,
      ms: Date.now() - started,
    });
    console.log(`FAIL ${testCase.id} — ${testCase.title}: ${error instanceof Error ? error.message : error}`);
  }
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function loginUi(page, portalPath, email, password) {
  await page.goto(`${BASE}${portalPath}`, { waitUntil: 'domcontentloaded' });
  const firstInput = page.locator('form input').first();
  await firstInput.waitFor({ state: 'visible' });
  await firstInput.fill(email);
  await page.locator('form input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.getByText('Dashboard tổng quan', { exact: false }).first().waitFor({ state: 'visible' });
}

async function openAgentMenu(page) {
  const trigger = page.locator('aside').getByText('AI Agent', { exact: true });
  if (await trigger.count()) {
    await trigger.first().click();
  }
}

/* ------------------------------------------------------------------ */
/* Test cases                                                          */
/* ------------------------------------------------------------------ */

record('UI-01', 'Public site', 'P0', 'Trang chủ công khai render được', 'Mở /', 'HTTP 200, có tiêu đề House & Life và liên kết nội bộ', async page => {
  const res = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  assertStatus({ status: res.status(), text: '' }, 200);
  await page.waitForLoadState('networkidle').catch(() => {});
  const title = await page.title();
  assert(title.includes('House & Life'), `title="${title}"`);
  const links = await page.locator('a[href^="/"]').count();
  assert(links > 10, `links=${links}`);
  return `title="${title.slice(0, 60)}…", links=${links}`;
});

record('UI-02', 'Public site', 'P0', 'Trang chi tiết bất động sản render đúng', 'Mở canonical slug của BĐS public', 'HTTP 200, tiêu đề BĐS hiển thị', async page => {
  const list = await http('/api/public/properties');
  assertStatus(list, 200);
  const property = (list.json?.data || []).find(p => p.slug && p.id);
  assert(property, 'Không có BĐS public');
  const slug = `${property.slug}-${property.id}`;
  const res = await page.goto(`${BASE}/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' });
  assertStatus({ status: res.status(), text: '' }, 200);
  const snippet = String(property.title || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 6).join(' ');
  await page.getByText(snippet, { exact: false }).first().waitFor({ state: 'visible' });
  return `slug=${slug}`;
});

record('UI-03', 'Auth UI', 'P0', 'Truy cập admin khi chưa đăng nhập bị chặn', 'Mở /admin/dashboard không session', 'Hiện form Đăng nhập Super Admin', async page => {
  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Đăng nhập Super Admin', { exact: false }).first().waitFor({ state: 'visible' });
  assertEqual(await page.locator('aside').count(), 0, 'Sidebar xuất hiện khi chưa đăng nhập');
  return `url=${new URL(page.url()).pathname}`;
});

record('UI-04', 'Auth UI', 'P1', 'Sai mật khẩu hiển thị lỗi, không vào được', 'Đăng nhập sai tại /admin/login', 'Lỗi "Email hoặc mật khẩu không đúng."', async page => {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('form input').first().fill(TEST_EMAILS.adminA);
  await page.locator('form input[type="password"]').first().fill('SaiMatKhau!999');
  await page.locator('form button[type="submit"]').first().click();
  await page.getByText('Email hoặc mật khẩu không đúng.', { exact: false }).first().waitFor({ state: 'visible' });
  const dashboardVisible = await page.locator('aside').count();
  assertEqual(dashboardVisible, 0, 'Sidebar xuất hiện dù đăng nhập sai');
  return 'Hiển thị lỗi đúng, không mount sidebar';
});

record('UI-05', 'Auth UI', 'P0', 'Super Admin đăng nhập và thấy menu quản trị', 'Đăng nhập /admin/login', 'Sidebar có Dashboard, Hồ sơ, Cấu hình, Phân quyền', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  const sidebar = page.locator('aside').first();
  for (const label of ['Dashboard tổng quan', 'Hồ sơ cá nhân', 'Cấu hình hệ thống', 'Phân quyền & Gói']) {
    await sidebar.getByText(label, { exact: false }).first().waitFor({ state: 'visible' });
  }
  return `url=${new URL(page.url()).pathname}`;
});

record('UI-06', 'Menus', 'P0', 'Menu Website Chat / Chat History đã bị gỡ', 'Đọc toàn bộ sidebar super admin', 'Không còn 2 menu đã gỡ', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  const text = await page.locator('aside').first().innerText();
  assert(!text.includes('Website Chat'), 'Sidebar còn Website Chat');
  assert(!text.includes('Chat History'), 'Sidebar còn Chat History');
  return 'Không còn Website Chat / Chat History';
});

record('UI-07', 'Agent sources UI', 'P0', 'Trang Nguồn render đúng sau refactor', 'Mở /admin/agents/sources', 'Tiêu đề "Nguồn quét (Sources)", không có error boundary', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto(`${BASE}/admin/agents/sources`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Nguồn quét (Sources)', { exact: false }).first().waitFor({ state: 'visible' });
  const body = await page.locator('body').innerText();
  assert(!body.includes('Lỗi tải giao diện'), 'Error boundary xuất hiện');
  assert(!body.includes('Không tải được danh sách nguồn'), 'Báo lỗi tải nguồn');
  return 'Trang Nguồn render ổn định';
});

record('UI-08', 'Profile UI', 'P0', 'Tab ví giữ trạng thái qua URL và reload', 'Mở /admin/profile?tab=wallet → reload', 'Tab Ví active, URL & nội dung giữ nguyên', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto(`${BASE}/admin/profile?tab=wallet`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Quản Lý Số Dư & Giao Dịch Token', { exact: false }).first().waitFor({ state: 'visible' });
  assert(page.url().includes('tab=wallet'), `URL=${page.url()}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Quản Lý Số Dư & Giao Dịch Token', { exact: false }).first().waitFor({ state: 'visible' });
  assert(page.url().includes('tab=wallet'), `URL sau reload=${page.url()}`);
  return 'tab=wallet được giữ sau reload';
});

record('UI-09', 'Profile UI', 'P1', 'Chuyển tab License cập nhật URL và giữ sau reload', 'Click tab "Key PEM & Agent" → reload', 'URL tab=license, nội dung khóa/PEM hiển thị', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.goto(`${BASE}/admin/profile?tab=profile`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Key PEM & Agent', { exact: false }).first().click();
  await page.getByText('Quản lý Khóa Kích Hoạt & File PEM', { exact: false }).first().waitFor({ state: 'visible' });
  assert(page.url().includes('tab=license'), `URL=${page.url()}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Quản lý Khóa Kích Hoạt & File PEM', { exact: false }).first().waitFor({ state: 'visible' });
  assert(page.url().includes('tab=license'), `URL sau reload=${page.url()}`);
  return 'tab=license được giữ sau reload';
});

record('UI-10', 'Auth UI', 'P0', 'Quản trị công ty đăng nhập cổng thành viên đúng quyền', 'Đăng nhập /dang-nhap bằng admin công ty', 'Thấy CRM + AI Agent, không thấy menu hệ thống', async page => {
  await loginUi(page, '/dang-nhap', TEST_EMAILS.adminA, TEST_PASSWORDS.adminA);
  const sidebar = page.locator('aside').first();
  await sidebar.getByText('Khách hàng CRM', { exact: false }).first().waitFor({ state: 'visible' });
  const text = await sidebar.innerText();
  assert(!text.includes('Cấu hình hệ thống'), 'Company admin thấy Cấu hình hệ thống');
  assert(!text.includes('Phân quyền & Gói'), 'Company admin thấy Phân quyền & Gói');
  assert(text.includes('AI Agent'), 'Thiếu menu AI Agent theo entitlement');
  await openAgentMenu(page);
  await sidebar.getByText('Nguồn', { exact: true }).first().waitFor({ state: 'visible' });
  return `url=${new URL(page.url()).pathname}, menu công ty đúng`;
});

record('UI-11', 'Auth UI', 'P0', 'Member không thấy menu quản trị người dùng/hệ thống', 'Đăng nhập /dang-nhap bằng member', 'Không có User & Permission / Cấu hình hệ thống', async page => {
  await loginUi(page, '/dang-nhap', TEST_EMAILS.memberA, TEST_PASSWORDS.memberA);
  const text = await page.locator('aside').first().innerText();
  assert(!text.includes('User & Permission'), 'Member thấy User & Permission');
  assert(!text.includes('Cấu hình hệ thống'), 'Member thấy Cấu hình hệ thống');
  assert(!text.includes('Phân quyền & Gói'), 'Member thấy Phân quyền & Gói');
  return 'Menu member đúng phạm vi';
});

record('UI-12', 'Navigation UI', 'P1', 'Điều hướng trực tiếp route admin không crash', 'Mở lần lượt 4 route admin', 'Mỗi trang render, không có error boundary', async page => {
  await loginUi(page, '/admin/login', SUPER_ADMIN.email, SUPER_ADMIN.password);
  const routes = ['/admin/dashboard', '/admin/crm', '/admin/agents/sources', '/admin/profile?tab=wallet'];
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('aside').first().waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = await page.locator('body').innerText();
    assert(!body.includes('Lỗi tải giao diện'), `${route}: error boundary`);
    assert(body.trim().length > 200, `${route}: nội dung trống`);
  }
  return `${routes.length} route render ổn`;
});

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */
async function main() {
  const previous = loadState();
  if (previous) {
    console.log('[ui] Phát hiện state lần chạy trước — khôi phục.');
    await restoreState(previous);
  }
  fs.rmSync(path.join(OUT_DIR, 'state.json'), { force: true });

  const superSession = await login(SUPER_ADMIN.email, SUPER_ADMIN.password);
  await setupTestEnv(state, superSession.token);
  console.log('[ui] Đã tạo user QA tạm cho UI.');

  const localBrowsers = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'),
  ];
  const executablePath = localBrowsers.find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const testCase of cases.slice()) {
      const { context, page } = await newPage(browser);
      try {
        await run(testCase, page);
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await restoreState(state);
    fs.rmSync(path.join(OUT_DIR, 'state.json'), { force: true });
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  fs.writeFileSync(path.join(OUT_DIR, 'ui-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'ui-results.md'), resultsToMarkdown(results));
  console.log(`\n[ui] Kết quả: ${pass}/${results.length} PASS, ${fail} FAIL`);
  console.log(`[ui] Chi tiết: ${path.join(OUT_DIR, 'ui-results.json')}`);
  process.exitCode = fail ? 1 : 0;
}

await main();
await prisma.$disconnect();
