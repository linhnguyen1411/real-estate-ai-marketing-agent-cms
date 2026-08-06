/**
 * Verify Tiếp enables after typing in FB create-post dialog.
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('No CDP context');
  const page = context.pages().find(p => /facebook\.com/i.test(p.url())) || (await context.newPage());
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);

  const trigger = page.getByRole('button', { name: /đang nghĩ gì|what.?s on your mind/i }).first();
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click({ timeout: 10_000 });
  } else {
    await page.locator('[role="button"]:has-text("đang nghĩ gì")').first().click({ timeout: 10_000 });
  }
  await page.waitForTimeout(2000);

  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Tạo bài viết|Create post/i }).first();
  const visible = await dialog.isVisible().catch(() => false);
  console.log('dialog', visible);

  const composer = dialog.locator('[contenteditable="true"][role="textbox"]').first();
  await composer.click();
  await page.keyboard.type('[SMOKE debug] Tiếp button probe — delete me', { delay: 8 });
  await page.waitForTimeout(1500);

  const buttons = dialog.locator('[role="button"]');
  const count = await buttons.count();
  const rows = [];
  for (let i = 0; i < Math.min(count, 50); i += 1) {
    const b = buttons.nth(i);
    const aria = await b.getAttribute('aria-label');
    const text = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    rows.push({
      i,
      aria,
      text,
      visible: await b.isVisible().catch(() => false),
      disabled: await b.isDisabled().catch(() => false),
      ariaDisabled: await b.getAttribute('aria-disabled'),
    });
  }
  console.log(JSON.stringify(rows.filter(r => /tiếp|next|đăng|post|publish|share/i.test(`${r.aria || ''} ${r.text}`)), null, 2));
  await page.screenshot({ path: 'runtime/publish-evidence/_debug-composer-typed.png', fullPage: false });
  // leave dialog open for inspection; close tab only if we created it
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
