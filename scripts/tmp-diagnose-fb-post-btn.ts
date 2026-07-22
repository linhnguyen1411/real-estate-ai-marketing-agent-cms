/**
 * Diagnose Facebook create-post dialog buttons via local CDP.
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('no CDP context');
  const page = await context.newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);

    // Open composer
    const triggers = [
      page.getByRole('button', { name: /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i }),
      page.locator('[role="button"]:has-text("What\'s on your mind"), [role="button"]:has-text("Bạn đang nghĩ gì")'),
    ];
    for (const t of triggers) {
      if (await t.first().isVisible().catch(() => false)) {
        await t.first().click({ timeout: 10_000 });
        break;
      }
    }
    await page.waitForTimeout(2000);

    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('[contenteditable="true"]') }).last();
    const dialogVisible = await dialog.isVisible().catch(() => false);
    console.log(JSON.stringify({ dialogVisible, url: page.url() }, null, 2));

    if (dialogVisible) {
      const box = dialog.locator('[contenteditable="true"]').first();
      await box.click();
      await page.keyboard.type('Test publish diagnostic ' + Date.now(), { delay: 15 });
      await page.waitForTimeout(1500);

      const buttons = await dialog.locator('[role="button"], button').evaluateAll(els =>
        els.slice(0, 40).map(el => ({
          tag: el.tagName,
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label'),
          disabled: el.getAttribute('aria-disabled') || (el as HTMLButtonElement).disabled,
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        })),
      );
      console.log(JSON.stringify({ buttons }, null, 2));
    } else {
      const allDialogs = await page.locator('[role="dialog"]').count();
      console.log(JSON.stringify({ allDialogs }, null, 2));
    }
  } finally {
    await page.close().catch(() => undefined);
    // do not browser.close() — would disconnect user Chrome
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
