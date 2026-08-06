/**
 * Live CDP dump: all dialogs + keyboard.type path (matches DomEditor).
 * Leaves composer open for inspection — does NOT click Đăng.
 */
import { chromium } from 'playwright';

async function dumpAllDialogs(page: import('playwright').Page, label: string) {
  const data = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.map((d, i) => {
      const btns = [...d.querySelectorAll('[role="button"], button')].slice(0, 40).map((el) => ({
        aria: el.getAttribute('aria-label'),
        disabled: el.getAttribute('aria-disabled'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      }));
      const editable = !!d.querySelector('[contenteditable="true"]');
      const textLen = (d.querySelector('[contenteditable="true"]') as HTMLElement | null)?.innerText?.trim()
        .length;
      return {
        i,
        editable,
        textLen: textLen ?? 0,
        ariaLabels: btns.map((b) => b.aria).filter(Boolean),
        buttons: btns.filter((b) => b.aria && /tiếp|đăng|post|next|publish|chia sẻ/i.test(b.aria)),
      };
    });
  });
  console.log(JSON.stringify({ step: label, url: page.url(), dialogs: data }, null, 2));
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  if (!context) throw new Error('no CDP context');
  const page = await context.newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);

    const trigger = page.getByRole('button', {
      name: /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i,
    });
    if (await trigger.first().isVisible().catch(() => false)) {
      await trigger.first().click();
    } else {
      await page
        .locator('[role="button"]:has-text("Bạn đang nghĩ gì"), [role="button"]:has-text("What\'s on your mind")')
        .first()
        .click();
    }
    await page.waitForTimeout(2000);
    await dumpAllDialogs(page, 'composer_open');

    const box = page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]').last();
    await box.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    const sample =
      'Mai Đăng Chơn 650m2 — diagnostic keyboard type ' + Date.now() + ' — cơ hội đầu tư Đà Nẵng.';
    await page.keyboard.type(sample, { delay: 8 });
    await page.waitForTimeout(1500);
    await dumpAllDialogs(page, 'after_keyboard_type');

    // Prefer composer dialog (has contenteditable), not .last() blindly
    const composerDialog = page.locator('[role="dialog"]').filter({
      has: page.locator('[contenteditable="true"]'),
    });
    const tiep = composerDialog.locator('[aria-label="Tiếp"]').last();
    const dang = composerDialog.locator('[aria-label="Đăng"]').last();
    console.log(
      JSON.stringify({
        composerDialogCount: await composerDialog.count(),
        tiepVisible: await tiep.isVisible().catch(() => false),
        tiepDisabled: await tiep.getAttribute('aria-disabled').catch(() => null),
        dangVisible: await dang.isVisible().catch(() => false),
        dangDisabled: await dang.getAttribute('aria-disabled').catch(() => null),
        boxTextLen: ((await box.innerText().catch(() => '')) || '').trim().length,
      }),
    );

    if ((await tiep.isVisible().catch(() => false)) && (await tiep.getAttribute('aria-disabled')) !== 'true') {
      await tiep.click({ force: true });
      await page.waitForTimeout(2500);
      await dumpAllDialogs(page, 'after_tiep_click');
      console.log(
        JSON.stringify({
          dangAfter: {
            visible: await composerDialog.locator('[aria-label="Đăng"]').last().isVisible().catch(() => false),
            disabled: await composerDialog
              .locator('[aria-label="Đăng"]')
              .last()
              .getAttribute('aria-disabled')
              .catch(() => null),
          },
        }),
      );
    }

    // Close without posting
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  } finally {
    await page.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
