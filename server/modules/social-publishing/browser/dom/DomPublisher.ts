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

  async clickPublish(page: Page): Promise<boolean> {
    const buttons = [
      page.getByRole('button', { name: this.selectors.publishButtonRoleName }),
      page.locator(this.selectors.publishAriaCss),
      page.locator(this.selectors.publishDialogAriaCss),
    ];
    for (const loc of buttons) {
      const btn = loc.first();
      if (await btn.isVisible().catch(() => false)) {
        const disabled = await btn.isDisabled().catch(() => false);
        if (disabled) {
          await domSleep(this.flow.disabledPublishWaitMs);
        }
        await btn.click({ timeout: this.flow.publishClickTimeoutMs });
        return true;
      }
    }
    return false;
  }
}
