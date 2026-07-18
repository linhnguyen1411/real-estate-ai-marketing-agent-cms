/**
 * DomNavigator — open/find composers, dismiss dialogs, locate by selector config.
 */

import type { Locator, Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';

export class DomNavigator {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  async findComposer(page: Page): Promise<Locator | null> {
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
    // Prefer an already-open create-post dialog (avoid random feed contenteditables).
    const dialogComposer = page
      .locator('[role="dialog"] [contenteditable="true"][role="textbox"]')
      .first();
    if (await dialogComposer.isVisible().catch(() => false)) {
      await dialogComposer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
      await domSleep(this.flow.afterFocusWaitMs);
      return dialogComposer;
    }

    for (const name of this.selectors.composerOpenTriggers) {
      const trigger = page.getByRole('button', { name }).first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
        await domSleep(this.flow.afterOpenWaitMs);
        break;
      }
    }

    const feedPrompt = page.locator(this.selectors.composerFeedPromptCss).first();
    if (await feedPrompt.isVisible().catch(() => false)) {
      await feedPrompt.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
      await domSleep(this.flow.afterOpenWaitMs);
    }

    if (await dialogComposer.isVisible().catch(() => false)) {
      await dialogComposer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
      await domSleep(this.flow.afterFocusWaitMs);
      return dialogComposer;
    }

    let composer = await this.findComposer(page);
    if (!composer) {
      throw new Error('browser_composer_not_found');
    }
    await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
    await domSleep(this.flow.afterFocusWaitMs);
    return (await this.findComposer(page)) || composer;
  }

  async dismissDialogs(page: Page): Promise<void> {
    const close = page.locator(this.selectors.closeDialogAriaCss);
    const count = await close.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 3); i += 1) {
      await close.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
  }
}
