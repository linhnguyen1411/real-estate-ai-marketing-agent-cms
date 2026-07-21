/**
 * DomPublisher — click the publish / post control.
 */

import type { Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';

export class DomPublisher {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  /** Facebook create-post may require Tiếp/Next before Đăng/Post. */
  private async clickNextIfPresent(page: Page): Promise<boolean> {
    const nextName = /^(next|tiếp)$|tiếp tục|continue/i;
    const candidates = [
      page.locator('[role="dialog"]').getByRole('button', { name: nextName }),
      page.locator(
        '[role="dialog"] [aria-label="Next"], [role="dialog"] [aria-label="Tiếp"], [role="dialog"] [aria-label*="Tiếp" i]',
      ),
      page.getByRole('button', { name: nextName }),
    ];
    for (const loc of candidates) {
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 4); i += 1) {
        const btn = loc.nth(i);
        if (!(await btn.isVisible().catch(() => false))) continue;
        const ariaDisabled = await btn.getAttribute('aria-disabled');
        let disabled = (await btn.isDisabled().catch(() => false)) || ariaDisabled === 'true';
        if (disabled) {
          // Wait for composer content to enable Next.
          for (let w = 0; w < 8; w += 1) {
            await domSleep(400);
            disabled =
              (await btn.isDisabled().catch(() => false)) ||
              (await btn.getAttribute('aria-disabled')) === 'true';
            if (!disabled) break;
          }
        }
        if (disabled) continue;
        await btn.scrollIntoViewIfNeeded().catch(() => undefined);
        await btn.click({ timeout: this.flow.publishClickTimeoutMs });
        await domSleep(this.flow.afterPublishWaitMs);
        return true;
      }
    }
    return false;
  }

  async clickPublish(page: Page): Promise<boolean> {
    // FB create-post: content → Tiếp (maybe repeated) → Đăng/Post
    for (let hop = 0; hop < 3; hop += 1) {
      const advanced = await this.clickNextIfPresent(page);
      if (!advanced) break;
    }

    // Prefer dialog-scoped controls — feed/share buttons often match loose names.
    const buttons = [
      page.locator('[role="dialog"]').getByRole('button', { name: this.selectors.publishButtonRoleName }),
      page.locator(this.selectors.publishDialogAriaCss),
      page.locator('[role="dialog"]').getByText(this.selectors.publishButtonRoleName),
      page.getByRole('button', { name: this.selectors.publishButtonRoleName }),
      page.locator(this.selectors.publishAriaCss),
      // Last resort: visible text inside dialog (FB often nests label spans).
      page.locator('[role="dialog"] [role="button"]').filter({
        hasText: this.selectors.publishButtonRoleName,
      }),
    ];

    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      for (const loc of buttons) {
        const count = await loc.count().catch(() => 0);
        for (let i = 0; i < Math.min(count, 6); i += 1) {
          const btn = loc.nth(i);
          if (!(await btn.isVisible().catch(() => false))) continue;
          const ariaDisabled = await btn.getAttribute('aria-disabled');
          const disabled = (await btn.isDisabled().catch(() => false)) || ariaDisabled === 'true';
          if (disabled) continue;
          await btn.scrollIntoViewIfNeeded().catch(() => undefined);
          await btn.click({ timeout: this.flow.publishClickTimeoutMs });
          return true;
        }
      }
      // Intermediate step may still show Tiếp instead of Post.
      await this.clickNextIfPresent(page);
      await domSleep(400);
    }
    return false;
  }
}
