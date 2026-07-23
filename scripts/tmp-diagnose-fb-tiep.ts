/**
 * Diagnose full VN create-post: type → Tiếp → list buttons for Đăng.
 */
import { chromium } from 'playwright';

async function dumpButtons(page: import('playwright').Page, label: string) {
  const dialog = page.locator('[role="dialog"]').last();
  const visible = await dialog.isVisible().catch(() => false);
  const buttons = visible
    ? await dialog.locator('[role="button"], button').evaluateAll(els =>
        els.slice(0, 50).map(el => ({
          aria: el.getAttribute('aria-label'),
          disabled: el.getAttribute('aria-disabled'),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        })),
      )
    : [];
  console.log(JSON.stringify({ step: label, dialogVisible: visible, url: page.url(), buttons }, null, 2));
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('no CDP context');
  const page = await context.newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const trigger = page.getByRole('button', { name: /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i });
    if (await trigger.first().isVisible().catch(() => false)) {
      await trigger.first().click();
    } else {
      await page.locator('[role="button"]:has-text("Bạn đang nghĩ gì"), [role="button"]:has-text("What\'s on your mind")').first().click();
    }
    await page.waitForTimeout(1500);

    const box = page.locator('[role="dialog"] [contenteditable="true"]').first();
    await box.click();
    // Same insertText path as DomEditor
    await page.evaluate(text => {
      const el = document.querySelector(
        '[role="dialog"] [contenteditable="true"][role="textbox"]',
      ) as HTMLElement | null;
      if (!el) return false;
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return true;
    }, 'Cơ hội hiếm có cho các nhà đầu tư — diagnostic ' + Date.now());
    await page.keyboard.type(' ');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1500);
    await dumpButtons(page, 'after_type');

    const next = page.locator('[role="dialog"] [aria-label="Tiếp"]').first();
    console.log(JSON.stringify({
      nextVisible: await next.isVisible().catch(() => false),
      nextDisabled: await next.getAttribute('aria-disabled'),
    }));
    if (await next.isVisible().catch(() => false)) {
      await next.click({ force: true });
      await page.waitForTimeout(2500);
      await dumpButtons(page, 'after_tiep');
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
