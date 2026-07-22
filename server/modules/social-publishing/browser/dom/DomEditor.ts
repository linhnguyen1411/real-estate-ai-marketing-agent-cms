/**
 * DomEditor — exactly-once composer fill (P0.2 Editor Transaction).
 *
 * Focus → Ctrl+A → Delete → verify empty → insert ONCE → read back → compare.
 * No append. No multi-insert. No retry paste of stacking text.
 */

import type { Locator, Page } from 'playwright';
import type { DomFlowConfig } from './types';
import { domSleep } from './types';
import { significantTextLength } from './facebookText';
import {
  CLEAR_DIALOG_COMPOSER,
  INSERT_DIALOG_COMPOSER_LINES,
  READ_DIALOG_COMPOSER_TEXT,
} from './domComposerEval';
import { getPublishTrace } from '../publishTrace';

function browserFn<T extends (...args: never[]) => unknown>(source: string): T {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${source})`)() as T;
}

function normalizeForCompare(input: string): string {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function captionsMatch(expected: string, actual: string): boolean {
  const a = normalizeForCompare(expected);
  const b = normalizeForCompare(actual);
  if (a === b) return true;
  const aSig = significantTextLength(a);
  const bSig = significantTextLength(b);
  if (aSig === 0) return bSig === 0;
  // FB may collapse newlines; allow whitespace-insensitive equality.
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;
  // Require ≥85% significant length and expected prefix present (FB may drop emoji/ZWJ).
  if (bSig < Math.floor(aSig * 0.85) || bSig > Math.floor(aSig * 1.2)) return false;
  const needle = a.replace(/\s+/g, ' ').slice(0, Math.min(80, a.length));
  return b.replace(/\s+/g, ' ').includes(needle.slice(0, Math.min(40, needle.length)));
}

export class DomEditor {
  constructor(private readonly flow: DomFlowConfig) {}

  private async readComposerText(page: Page, composer?: Locator): Promise<string> {
    // Prefer the Playwright locator we clicked — more reliable than re-query after Lexical re-render.
    if (composer) {
      const fromLocator = await composer
        .evaluate(el => ((el as HTMLElement).innerText || el.textContent || '').trim())
        .catch(() => '');
      if (significantTextLength(fromLocator) > 0) return fromLocator;
    }
    return page.evaluate(browserFn<() => string>(READ_DIALOG_COMPOSER_TEXT));
  }

  private async clearViaEval(page: Page): Promise<boolean> {
    return page.evaluate(browserFn<() => boolean>(CLEAR_DIALOG_COMPOSER));
  }

  private async insertViaEval(page: Page, full: string): Promise<boolean> {
    const lines = full.split('\n');
    return page.evaluate(
      browserFn<(lineList: string[]) => boolean>(INSERT_DIALOG_COMPOSER_LINES),
      lines,
    );
  }

  /**
   * Mandatory clear protocol: focus → Ctrl/Meta+A → Delete → verify empty.
   */
  private async clearEditorTransaction(
    page: Page,
    composer: Locator,
    publishJobId?: string,
  ): Promise<void> {
    const trace = publishJobId ? getPublishTrace(publishJobId) : null;
    await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
    await domSleep(this.flow.afterFocusWaitMs);
    trace?.mark('EditorFocus');

    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+A`);
    await domSleep(80);
    await page.keyboard.press('Backspace');
    await domSleep(80);
    await page.keyboard.press('Delete');
    await domSleep(120);

    let text = await this.readComposerText(page, composer);
    if (significantTextLength(text) > 0) {
      await this.clearViaEval(page);
      await domSleep(150);
      text = await this.readComposerText(page, composer);
    }

    if (significantTextLength(text) > 0) {
      await this.clearViaEval(page);
      await page.keyboard.press(`${mod}+A`);
      await page.keyboard.press('Backspace');
      await domSleep(150);
      text = await this.readComposerText(page, composer);
    }

    if (significantTextLength(text) > 0) {
      throw new Error('browser_composer_not_empty_before_insert');
    }
    trace?.mark('EditorEmpty', { textLen: 0 });
  }

  private async insertLinesOnce(page: Page, composer: Locator, full: string): Promise<void> {
    const lines = full.split('\n');
    await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
    await domSleep(150);
    // Ensure focus is on the locator element, not a feed comment box.
    await composer.focus().catch(() => undefined);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.length > 0) {
        await page.keyboard.type(line, { delay: this.flow.afterTypeKeyDelayMs });
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
        await domSleep(40);
      }
    }
  }

  /**
   * @param caption Already-resolved caption (URL policy applied by caller).
   */
  async typeContent(
    page: Page,
    composer: Locator,
    caption: string,
    _linkUrl?: string | null,
    opts?: { publishJobId?: string },
  ): Promise<{ expected: string; actual: string }> {
    const full = String(caption || '');
    const publishJobId = opts?.publishJobId;
    const trace = publishJobId ? getPublishTrace(publishJobId) : null;
    const targetSig = significantTextLength(full);

    await this.clearEditorTransaction(page, composer, publishJobId);

    trace?.mark('InsertText', { chars: full.length, lines: full.split('\n').length });
    await this.insertLinesOnce(page, composer, full);

    // Tiny nudge so VN 「Tiếp」 enables.
    await page.keyboard.type(' ', { delay: 15 });
    await page.keyboard.press('Backspace');
    await domSleep(700);

    let actual = await this.readComposerText(page, composer);
    let sig = significantTextLength(actual);
    trace?.mark('ReadBack', { expectedLen: targetSig, actualLen: sig, pass: 1 });

    // Empty / near-empty after keyboard type: FB often steals focus or Lexical
    // leaves the wrong node selected. Recover ONCE via execCommand insert (still
    // a single fill — clear first, never append).
    if (targetSig > 0 && sig < Math.max(8, Math.floor(targetSig * 0.4))) {
      trace?.mark('InsertText', { recovery: 'execCommand', chars: full.length });
      await this.clearViaEval(page);
      await composer.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined);
      await this.insertViaEval(page, full);
      await domSleep(600);
      actual = await this.readComposerText(page, composer);
      sig = significantTextLength(actual);
      trace?.mark('ReadBack', { expectedLen: targetSig, actualLen: sig, pass: 2 });
    }

    if (!captionsMatch(full, actual)) {
      trace?.mark('CaptionMismatch', {
        expectedPreview: full.slice(0, 80),
        actualPreview: actual.slice(0, 80),
        expectedLen: targetSig,
        actualLen: sig,
      });
      // Soft-pass: if we clearly have substantial matching text (≥70%), allow publish.
      // Hard-fail only when empty or wildly wrong (prevents false mismatch blocking live).
      if (sig >= Math.max(12, Math.floor(targetSig * 0.7))) {
        const compactA = full.replace(/\s+/g, '');
        const compactB = actual.replace(/\s+/g, '');
        const prefix = compactA.slice(0, Math.min(30, compactA.length));
        if (prefix && compactB.includes(prefix)) {
          trace?.mark('ReadBack', { softPass: true, actualLen: sig });
          return { expected: full, actual };
        }
      }
      throw new Error('browser_composer_mismatch');
    }

    return { expected: full, actual };
  }
}
