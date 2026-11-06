import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PROJECT_DIR = process.cwd();
const OUT_DIR = path.join(PROJECT_DIR, 'runtime', 'qa');
const PROFILE_DIR = path.join(OUT_DIR, 'desktop-profile');
const ELECTRON_LOG = path.join(OUT_DIR, 'desktop-electron.log');
const MOCK_PORT = 3200;
const CDP_PORT = 9333;
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const ELECTRON_EXE = path.join(PROJECT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const APP_ENTRY = path.join(PROJECT_DIR, 'desktop', 'dist', 'main', 'index.cjs');

const FAKE_UPDATE = Buffer.from('QA fake desktop update payload — not an installer.\n'.repeat(2000), 'utf8');
const FAKE_UPDATE_SHA = crypto.createHash('sha256').update(FAKE_UPDATE).digest('hex');

const MOCK_LOGIN_KEY = 'MOCK-AAAA-BBBB-CC99';
const MOCK_CAPABILITIES = {
  roleKey: 'super_admin',
  roleLabel: 'Quản trị viên',
  portal: 'admin',
  scope: 'all',
  canScan: true,
  canManageSources: true,
  canPublish: true,
  canViewReports: true,
  canUseNotifications: true,
  canManageVps: true,
  canManageDevices: true,
};
const MOCK_USER = {
  id: 'qa-desktop-super',
  name: 'QA Desktop Super',
  email: 'qa.desktop@example.test',
  role: 'super_admin',
  roleKey: 'super_admin',
  roleLabel: 'Quản trị viên',
  companyId: null,
  teamId: null,
  portal: 'admin',
};
const MOCK_INGEST = { keyId: 'ak_mock_desktop', secret: 'mock-desktop-secret', expiresAt: null };

const MOCK_SOURCES = [
  {
    id: 'qa-src-1',
    name: 'QA Source Alpha',
    url: 'https://www.facebook.com/groups/qa-test-1',
    type: 'facebook_group',
    status: 'active',
    companyId: null,
  },
  {
    id: 'qa-src-2',
    name: 'QA Source Beta',
    url: 'https://www.facebook.com/groups/qa-test-2',
    type: 'facebook_group',
    status: 'active',
    companyId: null,
  },
];

let manifestMode = 'ok';
const requests = [];
const cases = [];
const results = [];
let electronChild = null;
let browser = null;
let page = null;
let mockServer = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: mong đợi ${JSON.stringify(expected)}, nhận ${JSON.stringify(actual)}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`${label} (timeout ${timeoutMs}ms)${lastError ? `: ${lastError.message}` : ''}`);
}

function record(id, module, priority, title, steps, expected, fn) {
  cases.push({ id, module, priority, title, steps, expected, fn });
}

async function run(testCase) {
  const started = Date.now();
  try {
    const evidence = await testCase.fn();
    results.push({ ...testCase, fn: undefined, status: 'PASS', evidence, ms: Date.now() - started });
    console.log(`PASS ${testCase.id} — ${testCase.title}`);
  } catch (error) {
    let shot = '';
    try {
      if (page) {
        shot = path.join(OUT_DIR, 'screenshots', `${testCase.id}.png`);
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        await page.screenshot({ path: shot, fullPage: true });
      }
    } catch { /* best effort */ }
    results.push({
      ...testCase,
      fn: undefined,
      status: 'FAIL',
      evidence: `${error instanceof Error ? error.message : String(error)}${shot ? ` [screenshot: ${path.relative(PROJECT_DIR, shot)}]` : ''}`,
      ms: Date.now() - started,
    });
    console.log(`FAIL ${testCase.id} — ${testCase.title}: ${error instanceof Error ? error.message : error}`);
  }
}

function startMockVps() {
  manifestMode = 'ok';
  mockServer = http.createServer((req, res) => {
    const url = new URL(req.url, MOCK_BASE);
    requests.push({ method: req.method, path: url.pathname + url.search });

    if (url.pathname === '/api/license/activate') {
      let payload = '';
      req.on('data', (chunk) => { payload += chunk; });
      req.on('end', () => {
        let key = '';
        try { key = JSON.parse(payload).key || ''; } catch { /* ignore */ }
        if (key !== MOCK_LOGIN_KEY) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', code: 'INVALID_KEY', message: 'Khóa bản quyền không hợp lệ hoặc không tồn tại.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          message: 'Kích hoạt thành công.',
          data: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 7200,
            plan: 'trial',
            features: ['tool.exe'],
            expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
            user: MOCK_USER,
            capabilities: MOCK_CAPABILITIES,
            ingest: MOCK_INGEST,
          },
        }));
      });
      return;
    }

    if (url.pathname === '/api/license/heartbeat') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        valid: true,
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        offlineGraceHours: 48,
        data: {
          user: MOCK_USER,
          capabilities: MOCK_CAPABILITIES,
          plan: 'trial',
          features: ['tool.exe'],
          ingest: MOCK_INGEST,
        },
      }));
      return;
    }

    if (url.pathname === '/api/license/refresh-token') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: { accessToken: 'mock-access-token-2' } }));
      return;
    }

    if (url.pathname === '/api/agent-ingest/v1/sources') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: MOCK_SOURCES }));
      return;
    }

    if (url.pathname === '/downloads/agent-version.json') {
      let manifest;
      if (manifestMode === 'badsha') {
        manifest = {
          version: '9.9.10',
          url: '/downloads/qa-fake-update-9.9.10.bin',
          sha256: '0'.repeat(64),
          size: FAKE_UPDATE.length,
          notes: 'QA bad sha',
        };
      } else if (manifestMode === 'incomplete') {
        manifest = { version: '9.9.11', notes: 'QA missing sha/url' };
      } else {
        manifest = {
          version: '9.9.9',
          url: '/downloads/qa-fake-update-9.9.9.bin',
          sha256: FAKE_UPDATE_SHA,
          size: FAKE_UPDATE.length,
          notes: 'QA desktop updater smoke',
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifest));
      return;
    }

    if (url.pathname.startsWith('/downloads/qa-fake-update-')) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': FAKE_UPDATE.length });
      res.end(FAKE_UPDATE);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'not found' }));
  });

  return new Promise((resolve, reject) => {
    mockServer.once('error', reject);
    mockServer.listen(MOCK_PORT, '127.0.0.1', resolve);
  });
}

function stopMockVps() {
  return new Promise(resolve => {
    if (!mockServer) return resolve();
    mockServer.close(() => resolve());
  });
}

function writeProfileSettings(overrides = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const settings = {
    vpsUrl: MOCK_BASE,
    vpsApiKeyId: '',
    vpsApiSecret: '',
    autoSyncEnabled: false,
    autoUpdateEnabled: false,
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    scanSpeedMode: 'turbo',
    ...overrides,
  };
  fs.writeFileSync(path.join(PROFILE_DIR, 'desktop_agent_settings.json'), JSON.stringify(settings, null, 2), 'utf8');
}

function readStoredSettings() {
  return JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, 'desktop_agent_settings.json'), 'utf8'));
}

async function launchApp() {
  if (!fs.existsSync(ELECTRON_EXE)) throw new Error(`Không thấy Electron: ${ELECTRON_EXE}`);
  if (!fs.existsSync(APP_ENTRY)) throw new Error(`Chưa build desktop: ${APP_ENTRY}`);
  const logStream = fs.createWriteStream(ELECTRON_LOG, { flags: 'a' });
  electronChild = spawn(
    ELECTRON_EXE,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      APP_ENTRY,
    ],
    {
      cwd: PROJECT_DIR,
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  electronChild.stdout.pipe(logStream);
  electronChild.stderr.pipe(logStream);

  browser = await waitFor(
    async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      } catch {
        return null;
      }
    },
    30_000,
    'Kết nối CDP tới Electron',
  );

  page = await waitFor(
    () => {
      for (const context of browser.contexts()) {
        for (const candidate of context.pages()) {
          if (candidate.url().includes('desktop/dist/renderer/index.html')) return candidate;
        }
      }
      return null;
    },
    20_000,
    'Tìm cửa sổ điều khiển Desktop Agent',
  );
  page.setDefaultTimeout(30_000);
  await page.locator('#top-bar').waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.desktopAgent), null, { timeout: 15_000 });

  // Auth gate: log in through the real UI on first launch; restored vaults auto-login.
  await sleep(2500);
  if (await page.locator('#auth-screen').isVisible()) {
    await page.locator('#auth-key-input').fill(MOCK_LOGIN_KEY);
    await page.locator('#auth-remember').check();
    await page.locator('#auth-submit').click();
    await waitFor(
      async () => !(await page.locator('#auth-screen').isVisible()),
      30_000,
      'Đăng nhập mock VPS',
    );
  }
}

async function closeApp() {
  const child = electronChild;
  try {
    if (page) await page.evaluate(() => window.close()).catch(() => {});
    if (child && child.exitCode === null) {
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        sleep(8000),
      ]);
    }
  } finally {
    await browser?.close().catch(() => {});
    browser = null;
    page = null;
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        sleep(3000),
      ]);
    }
    electronChild = null;
  }
  // The app may spawn helper processes; give Chromium a moment to release ports and profile locks.
  await sleep(1500);
}

async function openTab(tab) {
  await page.locator(`#tab-btn-${tab}`).click();
  await page.waitForFunction(
    name => {
      const view = document.querySelector(`#view-${name}`);
      return view && !view.classList.contains('hidden');
    },
    tab,
    { timeout: 10_000 },
  );
}

async function getSettings() {
  return page.evaluate(() => window.desktopAgent.getSettings());
}

async function getUpdateState() {
  return page.evaluate(() => window.desktopAgent.getUpdateState());
}

/* ------------------------------------------------------------------ */
/* Test cases                                                          */
/* ------------------------------------------------------------------ */

record('DESK-01', 'Desktop build', 'P0', 'Build desktop tạo đủ main/preload/renderer', 'Chạy npm run build:desktop và kiểm tra artifact', 'Đủ 3 bundle main, preload, renderer + index.html', async () => {
  const artifacts = [
    'desktop/dist/main/index.cjs',
    'desktop/dist/preload/appPreload.cjs',
    'desktop/dist/preload/facebookPreload.cjs',
    'desktop/dist/preload/zaloPreload.cjs',
    'desktop/dist/renderer/renderer.js',
    'desktop/dist/renderer/index.html',
    'desktop/dist/renderer/assets/logo_hl.png',
  ];
  for (const relative of artifacts) {
    const full = path.join(PROJECT_DIR, relative);
    assert(fs.existsSync(full), `Thiếu artifact ${relative}`);
    assert(fs.statSync(full).size > 1000, `Artifact quá nhỏ ${relative}`);
  }
  return `${artifacts.length} artifacts hợp lệ`;
});

record('DESK-02', 'Desktop UI', 'P0', 'Cửa sổ Agent render đủ 5 tab điều hướng', 'Mở app, đọc thanh tab', 'Có Dashboard, Publisher, Facebook, Zalo, Cài đặt', async () => {
  const tabs = await page.locator('.nav-tab').allInnerTexts();
  const text = tabs.join(' | ');
  for (const label of ['Tổng quan', 'Đăng bài', 'Facebook', 'Zalo', 'Cài đặt']) {
    assert(text.includes(label), `Thiếu tab "${label}" trong "${text}"`);
  }
  assertEqual(tabs.length, 5, 'Số tab điều hướng');
  return text.replace(/\s+/g, ' ').trim();
});

record('DESK-03', 'Desktop sources', 'P0', 'Agent tải nguồn Facebook từ VPS khi khởi động', 'Chờ đồng bộ nguồn từ mock VPS', 'Header hiển thị QA Source Alpha 1/2 và URL group', async () => {
  await waitFor(
    async () => (await page.locator('#current-source-name').innerText()).includes('QA Source Alpha'),
    30_000,
    'Header nguồn hiện tại',
  );
  const name = await page.locator('#current-source-name').innerText();
  assertEqual(await page.locator('#source-index-badge').innerText(), '1/2', 'Badge nguồn');
  const href = await page.locator('#current-source-url').getAttribute('href');
  const parsed = new URL(href);
  assertEqual(parsed.origin + parsed.pathname, 'https://www.facebook.com/groups/qa-test-1', 'URL nguồn');
  assertEqual(parsed.searchParams.get('sorting_setting'), 'CHRONOLOGICAL', 'Tham số sắp xếp theo thời gian');
  const stats = await page.evaluate(() => window.desktopAgent.getStats());
  assertEqual(stats.vpsConnected, true, 'Trạng thái kết nối VPS');
  assertEqual(stats.activeSourcesTotal, 2, 'Tổng nguồn active');
  return `${name.trim()} — ${href}, vpsConnected=true, sources=2`;
});

record('DESK-04', 'Desktop sources', 'P1', 'Chuyển nguồn kế tiếp / trước đó hoạt động', 'Bấm Nhóm kế tiếp rồi Nhóm trước', 'Header đổi sang QA Source Beta 2/2 rồi quay lại Alpha 1/2', async () => {
  await page.locator('#btn-next-source').click();
  await waitFor(
    async () => (await page.locator('#current-source-name').innerText()).includes('QA Source Beta'),
    10_000,
    'Chuyển sang nguồn Beta',
  );
  assertEqual(await page.locator('#source-index-badge').innerText(), '2/2', 'Badge sau khi next');
  await page.locator('#btn-prev-source').click();
  await waitFor(
    async () => (await page.locator('#current-source-name').innerText()).includes('QA Source Alpha'),
    10_000,
    'Quay lại nguồn Alpha',
  );
  assertEqual(await page.locator('#source-index-badge').innerText(), '1/2', 'Badge sau khi prev');
  return 'next → Beta 2/2, prev → Alpha 1/2';
});

record('DESK-05', 'Desktop settings', 'P0', 'Cài đặt nạp đúng cấu hình đã lưu và phiên bản app', 'Mở tab Cài đặt', 'VPS URL = mock, phiên bản 1.2.0, auto-update tắt', async () => {
  await openTab('settings');
  assertEqual(await page.locator('#setting-vps-url').inputValue(), MOCK_BASE, 'VPS URL');
  const currentVersion = await page.locator('#update-current-version').inputValue();
  const updateStatus = await page.locator('#update-status').innerText();
  assertEqual(currentVersion, '1.2.0', `Phiên bản app (update-status="${updateStatus}")`);
  assertEqual(await page.locator('#setting-auto-update').isChecked(), false, 'Auto update');
  assertEqual(await page.locator('#setting-telegram-enabled').isChecked(), false, 'Telegram enabled');
  const summary = await page.locator('#source-select-summary').innerText();
  assert(summary.includes('2/2'), `Tóm tắt nguồn="${summary}"`);
  return `vps=${MOCK_BASE}, version=1.2.0, sources=2/2`;
});

record('DESK-06', 'Desktop settings', 'P0', 'Danh sách nguồn trong Cài đặt hiển thị đủ và có nhãn hệ thống', 'Đọc checklist nguồn', '2 checkbox, cả hai có tag "Hệ thống"', async () => {
  const labels = page.locator('#settings-sources-list .source-check-item');
  assertEqual(await labels.count(), 2, 'Số nguồn');
  const text = await labels.allInnerTexts();
  assert(text.join(' ').includes('QA Source Alpha'), 'Thiếu nguồn Alpha');
  assert(text.join(' ').includes('QA Source Beta'), 'Thiếu nguồn Beta');
  assertEqual(await page.locator('#settings-sources-list .source-scope-tag').count(), 2, 'Số nhãn Hệ thống');
  return text.map(t => t.replace(/\s+/g, ' ').trim()).join(' | ');
});

record('DESK-07', 'Desktop settings', 'P0', 'Bỏ tick nguồn được lưu ngay và áp dụng cho vòng quét', 'Bỏ tick QA Source Beta', 'enabledSourceIds=[qa-src-1], tóm tắt 1/2, dropdown còn 1 nguồn', async () => {
  const beta = page.locator('#settings-sources-list input[data-source-id="qa-src-2"]');
  await beta.uncheck();
  await waitFor(async () => {
    const settings = await getSettings();
    return Array.isArray(settings.enabledSourceIds) && settings.enabledSourceIds.length === 1;
  }, 10_000, 'Lưu enabledSourceIds');
  const settings = await getSettings();
  assertEqual(JSON.stringify(settings.enabledSourceIds), JSON.stringify(['qa-src-1']), 'enabledSourceIds');
  const disk = readStoredSettings();
  assertEqual(JSON.stringify(disk.enabledSourceIds), JSON.stringify(['qa-src-1']), 'enabledSourceIds trên đĩa');
  const summary = await page.locator('#source-select-summary').innerText();
  assert(summary.includes('1/2'), `Tóm tắt nguồn="${summary}"`);
  await openTab('dashboard');
  assertEqual(await page.locator('#select-sources-dropdown option').count(), 1, 'Số nguồn trong dropdown');
  const stats = await page.evaluate(() => window.desktopAgent.getStats());
  assertEqual(stats.activeSourcesTotal, 1, 'activeSourcesTotal sau khi bỏ tick');
  return 'Chỉ còn qa-src-1 trong settings + dropdown + stats';
});

record('DESK-08', 'Desktop settings', 'P1', 'Lưu cấu hình tốc độ quét xuống đĩa', 'Chọn tốc độ Nhanh, bấm Lưu cấu hình', 'getSettings và file JSON đều có scanSpeedMode=fast', async () => {
  await openTab('settings');
  await page.locator('#setting-speed-mode').selectOption('fast');
  await page.locator('#btn-save-settings').click();
  await page.locator('#save-settings-msg').waitFor({ state: 'visible' });
  await waitFor(async () => (await getSettings()).scanSpeedMode === 'fast', 10_000, 'Lưu speed mode');
  assertEqual(readStoredSettings().scanSpeedMode, 'fast', 'scanSpeedMode trên đĩa');
  return 'scanSpeedMode=fast (IPC + file)';
});

record('DESK-09', 'Desktop Telegram', 'P1', 'Gửi tin Telegram thiếu cấu hình báo lỗi rõ ràng', 'Bấm Gửi tin thử khi chưa có token/chat id', 'Hiển thị "Thiếu Bot Token hoặc Chat ID.", app không crash', async () => {
  await page.locator('#btn-telegram-test').click();
  await waitFor(
    async () => (await page.locator('#telegram-test-msg').innerText()).includes('Thiếu Bot Token hoặc Chat ID.'),
    10_000,
    'Thông báo lỗi Telegram',
  );
  const msg = await page.locator('#telegram-test-msg').innerText();
  assertEqual(await page.locator('#top-bar').isVisible(), true, 'App còn sống sau test Telegram');
  return msg.trim();
});

record('DESK-10', 'Desktop updater', 'P0', 'Kiểm tra cập nhật tải bản mới và xác minh SHA-256', 'Click Kiểm tra cập nhật (manifest 9.9.9 hợp lệ)', 'latest=9.9.9, status=ready, file tải về khớp SHA-256', async () => {
  manifestMode = 'ok';
  // Auto-check chạy sau 20s khởi động; chờ nó kết thúc để không tranh chấp cờ busy.
  await waitFor(async () => {
    const state = await getUpdateState();
    return Boolean(state) && !['checking', 'idle'].includes(state.status);
  }, 35_000, 'Auto update check khởi động hoàn tất');
  await page.locator('#btn-check-update').click();
  await waitFor(
    async () => (await page.locator('#update-status').innerText()).includes('Đã tải xong'),
    30_000,
    'Updater ready',
  );
  assertEqual(await page.locator('#update-latest-version').inputValue(), '9.9.9', 'Phiên bản mới nhất');
  assertEqual(await page.locator('#update-current-version').inputValue(), '1.2.0', 'Phiên bản đang chạy trên UI');
  const state = await getUpdateState();
  assertEqual(state.status, 'ready', 'Update status');
  assertEqual(state.currentVersion, '1.2.0', 'currentVersion');
  assertEqual(state.progressPercent, 100, 'progressPercent');
  assertEqual(await page.locator('#btn-install-update').isVisible(), true, 'Nút cài đặt hiển thị');

  const downloaded = path.join(os.tmpdir(), 'houseandlife-updates', 'HouseAndLife-Agent-Setup-9.9.9.exe');
  assert(fs.existsSync(downloaded), `Không thấy file tải về ${downloaded}`);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(downloaded)).digest('hex');
  assertEqual(digest, FAKE_UPDATE_SHA, 'SHA-256 file tải về');
  return `9.9.9 ready 100%, sha256 khớp, file=${path.basename(downloaded)}`;
});

record('DESK-11', 'Desktop updater', 'P0', 'Updater từ chối file sai SHA-256', 'Manifest 9.9.10 có sha256 sai, click Kiểm tra cập nhật', 'status=error chứa "SHA-256", file tải về bị xóa', async () => {
  manifestMode = 'badsha';
  await page.locator('#btn-check-update').click();
  await waitFor(
    async () => {
      const state = await getUpdateState();
      return state.status === 'error' && String(state.error).includes('SHA-256');
    },
    30_000,
    'Updater báo lỗi SHA-256',
  );
  const state = await getUpdateState();
  assertEqual(state.latestVersion, '9.9.10', 'Phiên bản mới nhất');
  const badFile = path.join(os.tmpdir(), 'houseandlife-updates', 'HouseAndLife-Agent-Setup-9.9.10.exe');
  assertEqual(fs.existsSync(badFile), false, 'File sai hash vẫn còn trên đĩa');
  assertEqual(await page.locator('#btn-install-update').isVisible(), false, 'Nút cài đặt vẫn hiện');
  return state.error;
});

record('DESK-15', 'Desktop security', 'P1', 'HMAC secret được mã hoá at-rest và giải mã đúng khi đọc lại', 'Nhập API key/secret giả, lưu cấu hình', 'File settings chứa enc:v1, không chứa plaintext; getSettings trả secret gốc', async () => {
  const secret = 'qa-hmac-secret-2026';
  await openTab('settings');
  await page.locator('#setting-vps-key').fill('qa-key-id');
  await page.locator('#setting-vps-secret').fill(secret);
  await page.locator('#btn-save-settings').click();
  await waitFor(async () => (await getSettings()).vpsApiSecret === secret, 10_000, 'Lưu secret qua IPC');
  const settings = await getSettings();
  assertEqual(settings.vpsApiKeyId, 'qa-key-id', 'API key id');
  assertEqual(settings.vpsApiSecret, secret, 'Secret giải mã qua IPC');
  const disk = readStoredSettings();
  assert(String(disk.vpsApiSecret).startsWith('enc:v1:'), `Secret trên đĩa không được mã hoá: ${String(disk.vpsApiSecret).slice(0, 12)}`);
  assert(!String(disk.vpsApiSecret).includes(secret), 'Secret plaintext còn trên đĩa');
  return `disk=${String(disk.vpsApiSecret).slice(0, 12)}…, IPC trả plaintext đúng`;
});

record('DESK-12', 'Desktop restart', 'P0', 'Cấu hình và nguồn đã chọn được giữ sau khi khởi động lại', 'Đóng app, mở lại cùng user-data-dir', 'VPS URL, speed=fast, enabledSourceIds=[qa-src-1], secret giải mã đúng, 1 nguồn active', async () => {
  await closeApp();
  await launchApp();
  await waitFor(
    async () => (await page.locator('#current-source-name').innerText()).includes('QA Source Alpha'),
    30_000,
    'Nguồn tải lại sau restart',
  );
  const settings = await getSettings();
  assertEqual(settings.vpsUrl, MOCK_BASE, 'VPS URL sau restart');
  assertEqual(settings.scanSpeedMode, 'fast', 'speed mode sau restart');
  assertEqual(JSON.stringify(settings.enabledSourceIds), JSON.stringify(['qa-src-1']), 'enabledSourceIds sau restart');
  assertEqual(settings.vpsApiSecret, 'qa-hmac-secret-2026', 'Secret giải mã sau restart');
  const stats = await page.evaluate(() => window.desktopAgent.getStats());
  assertEqual(stats.activeSourcesTotal, 1, 'activeSourcesTotal sau restart');
  assertEqual(await page.locator('#select-sources-dropdown option').count(), 1, 'Dropdown nguồn sau restart');
  await openTab('settings');
  assertEqual(await page.locator('#update-current-version').inputValue(), '1.2.0', 'Version sau restart');
  return 'restart giữ vpsUrl, speed=fast, secret giải mã, 1 nguồn active';
});

record('DESK-13', 'Desktop updater', 'P1', 'Manifest thiếu trường bắt buộc bị từ chối an toàn', 'Manifest 9.9.11 thiếu sha256/url, click Kiểm tra cập nhật', 'status=error chứa "Manifest thiếu", app không crash', async () => {
  manifestMode = 'incomplete';
  await page.locator('#btn-check-update').click();
  await waitFor(
    async () => {
      const state = await getUpdateState();
      return state.status === 'error' && String(state.error).includes('Manifest thiếu');
    },
    30_000,
    'Updater báo manifest thiếu trường',
  );
  const state = await getUpdateState();
  assertEqual(await page.locator('#top-bar').isVisible(), true, 'App còn sống sau manifest lỗi');
  return state.error;
});

record('DESK-14', 'Desktop updater', 'P1', 'Không tự cài cập nhật khi người dùng tắt auto-update', 'Đọc state sau khi auto check khởi động (autoUpdateEnabled=false)', 'Không có tiến trình cài đặt, file giả không bị thực thi, app vẫn chạy', async () => {
  const state = await getUpdateState();
  assert(['idle', 'available', 'error', 'uptodate'].includes(state.status), `status bất thường=${state.status}`);
  assertEqual(await page.locator('#setting-auto-update').isChecked(), false, 'Auto update đang bật');
  assertEqual(await page.locator('#top-bar').isVisible(), true, 'App còn sống');
  return `status=${state.status}, autoUpdate=off, không chạy installer`;
});

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */
function resultsToMarkdown() {
  const lines = [
    '# Desktop Agent Smoke Test — Kết quả',
    '',
    `- Thời điểm: ${new Date().toISOString()}`,
    `- Môi trường: Electron local, mock VPS ${MOCK_BASE}, CDP port ${CDP_PORT}`,
    `- Tổng: ${results.length} — PASS: ${results.filter(r => r.status === 'PASS').length} — FAIL: ${results.filter(r => r.status === 'FAIL').length}`,
    '',
    '| ID | Module | Ưu tiên | Test case | Kết quả | Bằng chứng |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const result of results) {
    const evidence = String(result.evidence || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${result.id} | ${result.module} | ${result.priority} | ${result.title} | ${result.status} | ${evidence} |`);
  }
  lines.push('', '## Chi tiết test case', '');
  for (const testCase of cases) {
    const result = results.find(r => r.id === testCase.id);
    lines.push(`### ${testCase.id} — ${testCase.title}`);
    lines.push('');
    lines.push(`- Module: ${testCase.module} · Ưu tiên: ${testCase.priority}`);
    lines.push(`- Bước: ${testCase.steps}`);
    lines.push(`- Kỳ vọng: ${testCase.expected}`);
    lines.push(`- Kết quả: **${result?.status || 'NOT RUN'}**`);
    lines.push(`- Bằng chứng: ${result?.evidence || ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(ELECTRON_LOG, { force: true });
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  writeProfileSettings();

  await startMockVps();
  console.log(`[desk] Mock VPS đang chạy tại ${MOCK_BASE}`);

  try {
    await launchApp();
    console.log('[desk] Electron đã khởi động và kết nối CDP.');

    for (const testCase of cases.slice()) {
      await run(testCase);
      if (testCase.id === 'DESK-12') {
        // DESK-12 chủ động restart app; các case sau dùng phiên mới.
      }
    }
  } finally {
    await closeApp();
    await stopMockVps();
    fs.writeFileSync(
      path.join(OUT_DIR, 'desktop-mock-requests.log'),
      requests.map(r => `${new Date().toISOString()} ${r.method} ${r.path}`).join('\n'),
      'utf8',
    );
    const fakeFile = path.join(os.tmpdir(), 'houseandlife-updates', 'HouseAndLife-Agent-Setup-9.9.9.exe');
    fs.rmSync(fakeFile, { force: true });
    fs.rmSync(path.join(os.tmpdir(), 'houseandlife-updates', 'HouseAndLife-Agent-Setup-9.9.10.exe'), { force: true });
    try {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    } catch (error) {
      console.warn('[desk] Không xoá được profile tạm:', error.message);
    }
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  fs.writeFileSync(path.join(OUT_DIR, 'desktop-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'desktop-results.md'), resultsToMarkdown());
  console.log(`\n[desk] Kết quả: ${pass}/${results.length} PASS, ${fail} FAIL`);
  console.log(`[desk] Chi tiết: ${path.join(OUT_DIR, 'desktop-results.json')}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch(error => {
  console.error('[desk] Runner lỗi:', error);
  process.exitCode = 1;
});
