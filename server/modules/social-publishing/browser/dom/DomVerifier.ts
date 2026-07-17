/**
 * DomVerifier — collect post-publish signals, extract permalink/postId, success checks.
 */

import type { Page } from 'playwright';
import type {
  DomPermalinkResult,
  DomPlatformRules,
  DomSelectorConfig,
  PublishSuccessSignal,
} from './types';

export class DomVerifier {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly rules: DomPlatformRules,
  ) {}

  async collectSignals(page: Page): Promise<{
    currentUrl: string;
    hrefs: string[];
    html: string;
    bodyText: string;
  }> {
    const currentUrl = page.url();
    const hrefs = await page
      .locator(this.selectors.permalinkHrefCss)
      .evaluateAll(els =>
        els
          .map(el => (el as HTMLAnchorElement).href)
          .filter(Boolean)
          .slice(0, 40),
      )
      .catch(() => [] as string[]);
    const html = await page.content().catch(() => '');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    return { currentUrl, hrefs, html, bodyText: bodyText.slice(0, 8000) };
  }

  extractPostIdFromUrl(url: string): string | null {
    const m = url.match(this.rules.postIdPattern);
    return m?.[1] ?? null;
  }

  extractPermalink(input: {
    currentUrl?: string | null;
    hrefs?: string[];
    html?: string | null;
    bodyText?: string | null;
  }): DomPermalinkResult {
    const pool: string[] = [];
    if (input.currentUrl) pool.push(input.currentUrl);
    if (input.hrefs?.length) pool.push(...input.hrefs);
    if (input.html) {
      const matches = input.html.match(new RegExp(this.rules.urlPattern.source, 'gi')) || [];
      pool.push(...matches);
    }
    if (input.bodyText) {
      const matches = input.bodyText.match(new RegExp(this.rules.urlPattern.source, 'gi')) || [];
      pool.push(...matches);
    }

    for (const raw of pool) {
      const url = raw.replace(/&amp;/g, '&').replace(/[>"'].*$/, '').trim();
      if (!url || !this.rules.hostPattern.test(url)) continue;
      if (!this.rules.permalinkMarkers.test(url)) continue;
      const postId = this.extractPostIdFromUrl(url);
      return { permalink: url, postId };
    }

    return { permalink: null, postId: null };
  }

  parseSuccess(input: {
    currentUrl?: string;
    bodyText?: string;
    toastText?: string;
  }): PublishSuccessSignal {
    return this.rules.parsePublishSuccess(input);
  }

  recoverAfterTimeout(input: {
    timedOut: boolean;
    currentUrl?: string;
    bodyText?: string;
    toastText?: string;
  }) {
    return this.rules.recoverAfterPublishClickTimeout(input);
  }
}
