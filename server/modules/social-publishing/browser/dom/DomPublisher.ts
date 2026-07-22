/**
 * DomPublisher — VN Timeline / Group: type → Tiếp → Đăng.
 */

import type { Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';
import {
  DOM_PUBLISHER_CLICK_ARIA,
  DOM_PUBLISHER_CLICK_DIALOG_BUTTON,
  DOM_PUBLISHER_DIALOG_CLOSED,
  DOM_PUBLISHER_PROBE,
} from './domPublisherEval';

type AriaProbe = {
  found: boolean;
  disabled: boolean;
  textLen: number;
  dialogCount: number;
  labels: string[];
};

function browserFn<T extends (...args: never[]) => unknown>(source: string): T {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${source})`)() as T;
}

export class DomPublisher {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  private async probe(page: Page, ariaExact: string): Promise<AriaProbe> {
    return page.evaluate(browserFn<(label: string) => AriaProbe>(DOM_PUBLISHER_PROBE), ariaExact);
  }

  private async clickDialogButton(
    page: Page,
    patterns: string[],
    waitEnableMs = 12_000,
  ): Promise<boolean> {
    const deadline = Date.now() + waitEnableMs;
    const fn = browserFn<(patterns: string[]) => boolean>(DOM_PUBLISHER_CLICK_DIALOG_BUTTON);
    while (Date.now() < deadline) {
      const clicked = await page.evaluate(fn, patterns);
      if (clicked) {
        await domSleep(1_400);
        return true;
      }
      await domSleep(350);
    }
    return false;
  }

  private async clickAria(page: Page, ariaExact: string, waitEnableMs = 12_000): Promise<boolean> {
    const deadline = Date.now() + waitEnableMs;
    while (Date.now() < deadline) {
      const p = await this.probe(page, ariaExact);
      if (p.found && !p.disabled) break;
      await domSleep(350);
    }

    const before = await this.probe(page, ariaExact);
    if (!before.found || before.disabled) {
      console.log(`[DomPublisher] clickAria miss label=${ariaExact}`, before);
      return false;
    }

    const fn = browserFn<(label: string) => boolean>(DOM_PUBLISHER_CLICK_ARIA);
    const clicked = await page.evaluate(fn, ariaExact);
    console.log(`[DomPublisher] clickAria label=${ariaExact} clicked=${clicked}`, before);
    if (!clicked) return false;
    await domSleep(1_400);
    return true;
  }

  private async dangReady(page: Page): Promise<boolean> {
    const dang = await this.probe(page, 'Đăng');
    if (dang.found && !dang.disabled) return true;
    const post = await this.probe(page, 'Post');
    return post.found && !post.disabled;
  }

  async clickPublish(page: Page): Promise<boolean> {
    const start = await this.probe(page, 'Tiếp');
    console.log('[DomPublisher] clickPublish start', start);

    if (await this.dangReady(page)) {
      if (await this.clickAria(page, 'Đăng', 5_000)) return await this.waitDialogClosed(page);
      if (await this.clickAria(page, 'Post', 5_000)) return await this.waitDialogClosed(page);
      if (
        await this.clickDialogButton(page, ['Đăng', 'Post', 'Publish', 'Chia sẻ', 'Share'], 3_000)
      ) {
        return await this.waitDialogClosed(page);
      }
    }

    const tiepDeadline = Date.now() + 22_000;
    let clickedTiep = false;
    while (Date.now() < tiepDeadline) {
      if (await this.dangReady(page)) break;
      if (await this.clickAria(page, 'Tiếp', 2_000)) {
        clickedTiep = true;
        break;
      }
      if (await this.clickAria(page, 'Next', 1_000)) {
        clickedTiep = true;
        break;
      }
      await domSleep(400);
    }

    if (clickedTiep) {
      await domSleep(1_200);
      if (!(await this.dangReady(page))) {
        const stillTiep = await this.probe(page, 'Tiếp');
        if (stillTiep.found && !stillTiep.disabled) {
          await this.clickAria(page, 'Tiếp', 3_000);
          await domSleep(1_000);
        }
      }
    }

    const postDeadline = Date.now() + 28_000;
    while (Date.now() < postDeadline) {
      if (await this.clickAria(page, 'Đăng', 3_000)) {
        return await this.waitDialogClosed(page);
      }
      if (await this.clickAria(page, 'Post', 2_000)) {
        return await this.waitDialogClosed(page);
      }
      if (await this.clickAria(page, 'Publish', 2_000)) {
        return await this.waitDialogClosed(page);
      }
      if (
        await this.clickDialogButton(page, ['Đăng', 'Post', 'Publish', 'Chia sẻ', 'Share'], 2_500)
      ) {
        return await this.waitDialogClosed(page);
      }
      if (!(await this.dangReady(page))) {
        await this.clickAria(page, 'Tiếp', 2_000);
      }
      await domSleep(500);
    }

    console.log('[DomPublisher] clickPublish exhausted', await this.probe(page, 'Đăng'));
    return false;
  }

  private async waitDialogClosed(page: Page): Promise<boolean> {
    for (let w = 0; w < 40; w += 1) {
      await domSleep(400);
      if (await this.isComposerDialogClosed(page)) return true;
    }
    return true;
  }

  async isComposerDialogClosed(page: Page): Promise<boolean> {
    const fn = browserFn<() => boolean>(DOM_PUBLISHER_DIALOG_CLOSED);
    return page.evaluate(fn);
  }
}
