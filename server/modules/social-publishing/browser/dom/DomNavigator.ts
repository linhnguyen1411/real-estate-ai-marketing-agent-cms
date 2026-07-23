/**
 * DomNavigator — open/find composers (evaluate clicks for FB overlays).
 */

import type { Locator, Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';
import {
  DISMISS_STRAY_DIALOGS,
  FIND_DIALOG_COMPOSER,
  OPEN_COMPOSER_BY_TRIGGERS,
} from './domComposerEval';

function browserFn<T extends (...args: never[]) => unknown>(source: string): T {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${source})`)() as T;
}

const EXTRA_GROUP_TRIGGERS = [
  'bạn viết gì đi',
  'viết gì đó',
  'viết gì đi',
  'bạn đang nghĩ gì',
  'tạo bài viết',
  'bài viết công khai',
  'write something',
  'create a public post',
  "what's on your mind",
  'đăng bài',
];

function triggerPatterns(selectors: DomSelectorConfig): string[] {
  const fromRegex = selectors.composerOpenTriggers.map(r =>
    r.source
      .replace(/\\s/g, ' ')
      .replace(/[.^$*+?()[\]{}|\\]/g, ' ')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean),
  );
  return [...new Set([...EXTRA_GROUP_TRIGGERS, ...fromRegex.flat()])];
}

export class DomNavigator {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  async findComposer(page: Page): Promise<Locator | null> {
    const found = await page.evaluate(browserFn<() => boolean>(FIND_DIALOG_COMPOSER));
    if (found) {
      return page.locator('[role="dialog"] [contenteditable="true"]').last();
    }

    const candidates: Locator[] = [];
    for (const name of this.selectors.composerRoleNames) {
      candidates.push(page.getByRole('textbox', { name }));
    }
    for (const css of this.selectors.composerCssCandidates) {
      candidates.push(page.locator(css));
    }
    candidates.push(page.locator(this.selectors.composerCss));

    for (const loc of candidates) {
      const first = loc.first();
      if (await first.isVisible().catch(() => false)) return first;
    }
    return null;
  }

  async openComposer(page: Page): Promise<Locator> {
    const dismiss = browserFn<() => void>(DISMISS_STRAY_DIALOGS);
    const openByTrigger = browserFn<(patterns: string[]) => { ok: boolean }>(
      OPEN_COMPOSER_BY_TRIGGERS,
    );
    const findInDialog = browserFn<() => boolean>(FIND_DIALOG_COMPOSER);
    const patterns = triggerPatterns(this.selectors);

    await page.evaluate(dismiss);
    await domSleep(300);

    for (let round = 0; round < 5; round += 1) {
      const hasStray = await page.evaluate(function () {
        var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
        for (var i = 0; i < dialogs.length; i++) {
          var d = dialogs[i];
          if (d.querySelector('[contenteditable="true"]')) continue;
          var text = (d.textContent || '').toLowerCase();
          if (/thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test(text)) return true;
        }
        return false;
      });
      if (!hasStray) break;
      await page.evaluate(dismiss);
      await domSleep(500);
    }

    if (await page.evaluate(findInDialog)) {
      const dialogEd = page.locator('[role="dialog"] [contenteditable="true"]').last();
      if ((await dialogEd.count()) > 0) return dialogEd;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const opened = await page.evaluate(openByTrigger, patterns);
      if (opened.ok) {
        for (let wait = 0; wait < 12; wait += 1) {
          await domSleep(this.flow.afterOpenWaitMs + 200);
          const dialogEd = page.locator('[role="dialog"] [contenteditable="true"]').last();
          if ((await dialogEd.count()) > 0 && (await dialogEd.isVisible().catch(() => false))) {
            return dialogEd;
          }
        }
      }

      const feedPrompt = page.locator(this.selectors.composerFeedPromptCss).first();
      if (await feedPrompt.isVisible().catch(() => false)) {
        await feedPrompt.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
        await domSleep(this.flow.afterOpenWaitMs);
        if (await page.evaluate(findInDialog)) {
          return page.locator('[role="dialog"] [contenteditable="true"]').last();
        }
      }

      for (const name of this.selectors.composerOpenTriggers) {
        const trigger = page.getByRole('button', { name }).first();
        if (await trigger.isVisible().catch(() => false)) {
          await trigger.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
          await domSleep(this.flow.afterOpenWaitMs);
          break;
        }
      }

      if (await page.evaluate(findInDialog)) {
        return page.locator('[role="dialog"] [contenteditable="true"]').last();
      }
      await domSleep(500);
    }

    const composer = await this.findComposer(page);
    if (!composer) {
      throw new Error('browser_composer_not_found');
    }
    await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
    await domSleep(this.flow.afterFocusWaitMs);
    return (await this.findComposer(page)) || composer;
  }

  async dismissDialogs(page: Page): Promise<void> {
    const dismiss = browserFn<() => void>(DISMISS_STRAY_DIALOGS);
    const hasBlockingNotif = async (): Promise<boolean> =>
      page.evaluate(function () {
        var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
        for (var i = 0; i < dialogs.length; i++) {
          var d = dialogs[i];
          if (d.querySelector('[contenteditable="true"]')) continue;
          var text = (d.textContent || '').toLowerCase();
          if (/thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test(text)) return true;
        }
        return false;
      });

    for (let round = 0; round < 6; round += 1) {
      await page.evaluate(dismiss);
      if (!(await hasBlockingNotif())) break;

      await page
        .locator('[aria-label="Quay lại trang trước"]')
        .first()
        .click({ timeout: 2_000 })
        .catch(() => undefined);
      await page
        .locator('[aria-label*="Thông báo"], [aria-label*="Notifications"]')
        .first()
        .click({ timeout: 2_000 })
        .catch(() => undefined);
      for (let e = 0; e < 3; e += 1) {
        await page.keyboard.press('Escape').catch(() => undefined);
      }
      await page
        .locator('[role="main"]')
        .first()
        .click({ position: { x: 40, y: 40 }, timeout: 2_000 })
        .catch(() => undefined);
      await domSleep(450);
    }

    const close = page.locator(this.selectors.closeDialogAriaCss);
    const count = await close.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 3); i += 1) {
      await close.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}
