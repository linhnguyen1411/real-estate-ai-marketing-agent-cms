import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.MOBILE_BASE || 'http://localhost:3000';
const OUT = process.env.MOBILE_OUT || 'scratch/mobile-regression';
const WIDTHS = (process.env.MOBILE_WIDTHS || '320,360,390,414,768')
  .split(',')
  .map(n => Number(n.trim()))
  .filter(Boolean);
const ADMIN_EMAIL = process.env.MOBILE_ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.MOBILE_ADMIN_PASSWORD || 'admin123';

const PUBLIC_ROUTES = [
  '/',
  '/bat-dong-san',
  '/du-an',
  '/nha-dau-tu',
  '/tin-tuc',
  '/kien-thuc-dau-tu',
  '/lien-he',
  '/chinh-sach-bao-mat',
  '/tai-lieu-dau-tu',
];

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/properties',
  '/admin/crm',
  '/admin/users',
  '/admin/seo/posts',
  '/admin/seo/categories',
  '/admin/agents',
  '/admin/agents/sources',
  '/admin/agents/publishing',
  '/admin/agents/publishing/campaigns',
  '/admin/agents/runtime',
  '/admin/profile?tab=wallet',
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const results = [];

function collect(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [];
    for (const el of document.querySelectorAll('a,button,[role="button"]')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // WCAG 2.5.8 exception: links inline inside a sentence/paragraph.
      const block = el.closest('p,li,td');
      const inlineInText =
        el.tagName === 'A' &&
        cs.display === 'inline' &&
        block &&
        (block.textContent || '').trim().length > (el.textContent || '').trim().length;
      if (inlineInText) continue;
      if (r.height < 24 || r.width < 24) {
        small.push({
          w: Math.round(r.width),
          h: Math.round(r.height),
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        });
      }
    }
    return {
      vw,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      small: small.slice(0, 12),
      smallCount: small.length,
    };
  });
}

async function visit(page, route, viewport, authed) {
  const entry = { route, width: viewport.width, auth: authed ? 'admin' : 'public' };
  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    entry.status = res?.status() ?? null;
    await page.waitForTimeout(1400);
    const data = await collect(page);
    entry.overflow = data.scrollWidth - data.vw;
    entry.smallCount = data.smallCount;
    entry.small = data.small;
    const ok = entry.status === 200 && entry.overflow <= 1 && entry.smallCount === 0;
    entry.ok = ok;
    if (!ok) {
      const slug = `${route.replace(/^\//, '').replace(/[/?=&]/g, '-') || 'home'}-m${viewport.width}`;
      await page.screenshot({ path: `${OUT}/fail-${slug}.png`, fullPage: false });
    }
    console.log(
      `${ok ? 'PASS' : 'FAIL'} m${viewport.width} ${route} status=${entry.status} overflow=${entry.overflow} small=${entry.smallCount}`,
    );
  } catch (err) {
    entry.ok = false;
    entry.error = String(err).slice(0, 300);
    console.log(`FAIL m${viewport.width} ${route} ERROR ${entry.error}`);
  }
  results.push(entry);
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: width >= 768 ? 1024 : 844 },
    deviceScaleFactor: 2,
    isMobile: width < 768,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  for (const route of PUBLIC_ROUTES) {
    await visit(page, route, { width }, false);
  }

  // Public menu: scroll lock + floating rail hidden while open
  if (width < 1024) {
    const check = { route: 'menu', width, auth: 'public' };
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const btn = page.getByRole('button', { name: 'Mở menu' }).first();
      await btn.click();
      await page.waitForTimeout(350);
      const state = await page.evaluate(() => {
        const rail = document.querySelector('[data-mobile-floating]');
        const menu = document.querySelector('[data-mobile-menu]');
        return {
          locked: getComputedStyle(document.body).overflow !== 'visible',
          railHidden: rail ? getComputedStyle(rail).display === 'none' : true,
          menuInsideViewport: menu ? menu.getBoundingClientRect().bottom <= window.innerHeight + 1 : true,
          docFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        };
      });
      check.ok = state.locked && state.railHidden && state.menuInsideViewport && state.docFits;
      check.state = state;
      console.log(`${check.ok ? 'PASS' : 'FAIL'} m${width} menu lock=${state.locked} railHidden=${state.railHidden}`);
      await page.getByRole('button', { name: 'Đóng menu' }).first().click();
      await page.waitForTimeout(250);
    } catch (err) {
      check.ok = false;
      check.error = String(err).slice(0, 200);
      console.log(`FAIL m${width} menu ERROR ${check.error}`);
    }
    results.push(check);
  }

  const login = { route: 'admin-login', width, auth: 'admin' };
  try {
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('form input').first().fill(ADMIN_EMAIL);
    await page.locator('form input[type="password"]').first().fill(ADMIN_PASSWORD);
    await page.locator('form button[type="submit"]').first().click();
    await page.getByText('Dashboard tổng quan', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
    login.ok = true;
    console.log(`PASS m${width} admin login`);
  } catch (err) {
    login.ok = false;
    login.error = String(err).slice(0, 200);
    console.log(`FAIL m${width} admin login ERROR ${login.error}`);
  }
  results.push(login);

  if (login.ok) {
    for (const route of ADMIN_ROUTES) {
      await visit(page, route, { width }, true);
    }
  }

  await ctx.close();
}

await browser.close();

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) {
    console.log(`- m${f.width} ${f.auth} ${f.route}${f.error ? ` error=${f.error}` : ''}`);
  }
  process.exit(1);
}
