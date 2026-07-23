/**
 * Verify insertText + keyboard nudge enables Tiếp then reveals Đăng (no post).
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('no context');
  const page = await ctx.newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const trigger = page.getByRole('button', {
      name: /bạn đang nghĩ gì|what.?s on your mind|tạo bài viết/i,
    });
    if (await trigger.first().isVisible().catch(() => false)) {
      await trigger.first().click();
    } else {
      await page.locator('[role="button"]:has-text("Bạn đang nghĩ gì")').first().click();
    }
    await page.waitForTimeout(1500);

    const box = page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]').last();
    await box.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');

    const full =
      'Mai Dang Chon 650m2 test enable Tiep ' +
      Date.now() +
      '\nCo hoi dau tu Da Nang gia tot, phap ly ro rang.';

    await page.evaluate(value => {
      const el = document.querySelector(
        '[role="dialog"] [contenteditable="true"][role="textbox"]',
      ) as HTMLElement | null;
      if (!el) return;
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, value);
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }),
      );
    }, full);
    await page.keyboard.type(' ', { delay: 20 });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]').filter({
      has: page.locator('[contenteditable="true"]'),
    });
    const tiep = dialog.locator('[aria-label="Tiếp"]').last();
    const state = {
      textLen: ((await box.innerText()) || '').trim().length,
      tiepVis: await tiep.isVisible().catch(() => false),
      tiepDis: await tiep.getAttribute('aria-disabled'),
    };
    console.log(JSON.stringify(state));

    if (state.tiepVis && state.tiepDis !== 'true') {
      await tiep.click({ force: true });
      await page.waitForTimeout(2000);
      const dang = page.locator('[role="dialog"] [aria-label="Đăng"]').last();
      console.log(
        JSON.stringify({
          dangVis: await dang.isVisible().catch(() => false),
          dangDis: await dang.getAttribute('aria-disabled'),
        }),
      );
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
  } finally {
    await page.close().catch(() => undefined);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
