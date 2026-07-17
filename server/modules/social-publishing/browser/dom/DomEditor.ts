/**
 * DomEditor — type/fill content into a composer locator.
 */

import type { Locator, Page } from 'playwright';
import type { DomFlowConfig } from './types';
import { domSleep } from './types';

export class DomEditor {
  constructor(private readonly flow: DomFlowConfig) {}

  async typeContent(
    page: Page,
    composer: Locator,
    body: string,
    linkUrl?: string | null,
  ): Promise<void> {
    await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
    await domSleep(200);

    const filled = await composer
      .fill(body)
      .then(() => true)
      .catch(() => false);
    if (!filled) {
      await composer.click().catch(() => undefined);
      await page.keyboard.press('Control+A').catch(() => undefined);
      await page.keyboard.type(body, { delay: this.flow.afterTypeKeyDelayMs });
    }

    if (linkUrl) {
      await page.keyboard
        .type(`\n${linkUrl}`, { delay: this.flow.afterTypeKeyDelayMs })
        .catch(() => undefined);
    }
  }
}
