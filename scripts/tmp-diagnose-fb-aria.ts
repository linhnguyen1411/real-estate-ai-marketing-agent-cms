/**
 * Wider dump: any aria-label matching Đăng/Tiếp/Post on page after compose steps.
 */
import { chromium } from 'playwright';

async function dumpAria(page: import('playwright').Page, step: string) {
  const hits = await page.evaluate(() => {
    const out: Array<{ aria: string; role: string | null; disabled: string | null; tag: string }> = [];
    for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
      const aria = el.getAttribute('aria-label') || '';
      if (!/đăng|post|publish|tiếp|next|quay lại|back|chia sẻ/i.test(aria)) continue;
      out.push({
        aria,
        role: el.getAttribute('role'),
        disabled: el.getAttribute('aria-disabled'),
        tag: el.tagName,
      });
    }
    return out.slice(0, 60);
  });
  const dialogCount = await page.locator('[role="dialog"]').count();
  console.log(JSON.stringify({ step, dialogCount, hits }, null, 2));
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0]!;
  const page = await context.newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1200);
    const trigger = page.getByRole('button', { name: /bạn đang nghĩ gì|what.?s on your mind|tạo bài viết/i });
    await trigger.first().click({ timeout: 15_000 });
    await page.waitForTimeout(1200);

    await page.locator('[role="dialog"] [contenteditable="true"]').first().click();
    await page.keyboard.type('Bai test diagnostic ' + Date.now(), { delay: 20 });
    await page.waitForTimeout(2000);
    await dumpAria(page, 'after_keyboard_type');

    const tiep = page.locator('[aria-label="Tiếp"]').first();
    if (await tiep.isVisible()) {
      console.log('clicking Tiếp disabled=', await tiep.getAttribute('aria-disabled'));
      await tiep.click({ force: true });
      await page.waitForTimeout(3000);
      await dumpAria(page, 'after_tiep');
    }

    const dang = page.locator('[aria-label="Đăng"], [aria-label="Post"]').first();
    if (await dang.isVisible().catch(() => false)) {
      console.log('Đăng visible disabled=', await dang.getAttribute('aria-disabled'));
    } else {
      console.log('Đăng not visible');
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
