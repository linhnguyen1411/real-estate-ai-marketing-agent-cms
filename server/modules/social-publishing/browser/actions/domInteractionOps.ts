/**
 * Destination DOM helpers for interaction actions.
 * Pure locator fill/click — no action orchestration, no Facebook product logic.
 */

import type { Page } from 'playwright';

export async function clickFirstMatching(
  page: Page,
  selectors: string[],
  timeoutMs = 8_000,
): Promise<{ clicked: boolean; selector?: string }> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    await loc.click({ timeout: timeoutMs }).catch(() => undefined);
    return { clicked: true, selector };
  }
  return { clicked: false };
}

export async function fillFirstMatching(
  page: Page,
  selectors: string[],
  text: string,
  timeoutMs = 8_000,
): Promise<{ filled: boolean; selector?: string }> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    await loc.click({ timeout: timeoutMs }).catch(() => undefined);
    await loc.fill(text).catch(async () => {
      await loc.pressSequentially(text, { delay: 15 }).catch(() => undefined);
    });
    return { filled: true, selector };
  }
  return { filled: false };
}

export async function hoverFirstMatching(
  page: Page,
  selectors: string[],
  timeoutMs = 8_000,
): Promise<{ hovered: boolean; selector?: string }> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    await loc.hover({ timeout: timeoutMs }).catch(() => undefined);
    return { hovered: true, selector };
  }
  return { hovered: false };
}
