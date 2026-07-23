/**
 * Live E2E: DomEditor + DomPublisher with operator draft body (actually posts).
 * Usage: npx tsx scripts/tmp-live-dom-publish.ts
 */
import fs from 'fs';
import { chromium } from 'playwright';
import { DomEditor } from '../server/modules/social-publishing/browser/dom/DomEditor';
import { DomPublisher } from '../server/modules/social-publishing/browser/dom/DomPublisher';
import { FACEBOOK_TIMELINE_FLOW, FACEBOOK_TIMELINE_SELECTORS } from '../server/modules/social-publishing/browser/adapters/facebookTimelineConfig';

async function main() {
  if (!fs.existsSync('scripts/tmp-draft-body-full.txt')) {
    throw new Error('missing scripts/tmp-draft-body-full.txt');
  }
  const body = fs.readFileSync('scripts/tmp-draft-body-full.txt', 'utf8').replace(/^\uFEFF/, '');

  console.log(JSON.stringify({ bodyLen: body.length, head: body.slice(0, 80) }));

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error('no CDP context');
  const page = await ctx.newPage();

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);

    const trigger = page.getByRole('button', {
      name: /bạn đang nghĩ gì|what.?s on your mind|tạo bài viết|create a post/i,
    });
    if (await trigger.first().isVisible().catch(() => false)) {
      await trigger.first().click();
    } else {
      await page.locator('[role="button"]:has-text("Bạn đang nghĩ gì")').first().click();
    }
    await page.waitForTimeout(2000);

    const composer = page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]').last();
    const editor = new DomEditor(FACEBOOK_TIMELINE_FLOW);
    await editor.typeContent(page, composer, body, null);
    console.log('typed', ((await composer.innerText()) || '').trim().length);

    const publisher = new DomPublisher(FACEBOOK_TIMELINE_SELECTORS, FACEBOOK_TIMELINE_FLOW);
    const ok = await publisher.clickPublish(page);
    console.log(JSON.stringify({ clickPublish: ok, url: page.url() }));
    await page.waitForTimeout(4000);
    console.log(
      JSON.stringify({
        dialogClosed: await publisher.isComposerDialogClosed(page),
        url: page.url(),
      }),
    );
  } finally {
    // keep tab for visual check — close after short delay
    await page.waitForTimeout(2000);
    await page.close().catch(() => undefined);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
