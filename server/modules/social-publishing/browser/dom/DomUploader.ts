/**
 * DomUploader — attach local media, wait for thumbnail / upload complete (P0.3).
 */

import type { Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';
import { getPublishTrace } from '../publishTrace';

export class DomUploader {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  /** Wait until composer shows media thumbnails / upload finished. */
  async waitForUploadComplete(
    page: Page,
    expectedCount: number,
    publishJobId?: string,
  ): Promise<{ thumbnailVisible: boolean; mediaNodes: number }> {
    const trace = publishJobId ? getPublishTrace(publishJobId) : null;
    const deadline = Date.now() + Math.max(15_000, this.flow.afterUploadWaitMs * 8);
    let lastCount = 0;

    while (Date.now() < deadline) {
      const state = await page
        .evaluate((need: number) => {
          const dialog =
            Array.from(document.querySelectorAll('[role="dialog"]')).find(d =>
              Boolean(d.querySelector('[contenteditable="true"]')),
            ) || document.body;

          const imgs = Array.from(dialog.querySelectorAll('img')).filter(img => {
            const r = img.getBoundingClientRect();
            if (r.width < 40 || r.height < 40) return false;
            const src = (img.getAttribute('src') || '').toLowerCase();
            // Exclude tiny chrome / emoji / profile avatars when possible
            if (/emoji|static\.xx|rsrc\.php/i.test(src) && r.width < 80) return false;
            return true;
          });

          const progress = dialog.querySelector(
            '[role="progressbar"], [aria-busy="true"], [aria-label*="Uploading" i], [aria-label*="Đang tải" i]',
          );
          const busy = Boolean(progress);
          return { mediaNodes: imgs.length, busy, need };
        }, expectedCount)
        .catch(() => ({ mediaNodes: 0, busy: true, need: expectedCount }));

      lastCount = state.mediaNodes;
      if (!state.busy && state.mediaNodes >= Math.min(1, expectedCount)) {
        trace?.mark('ThumbnailVisible', { mediaNodes: state.mediaNodes });
        trace?.mark('UploadComplete', { mediaNodes: state.mediaNodes });
        await domSleep(400);
        return { thumbnailVisible: true, mediaNodes: state.mediaNodes };
      }
      await domSleep(400);
    }

    // Soft pass if we saw at least one media node — FB DOM varies.
    if (lastCount >= 1) {
      trace?.mark('ThumbnailVisible', { mediaNodes: lastCount, soft: true });
      trace?.mark('UploadComplete', { mediaNodes: lastCount, soft: true });
      return { thumbnailVisible: true, mediaNodes: lastCount };
    }

    throw new Error('browser_media_thumbnail_timeout');
  }

  async uploadFiles(
    page: Page,
    mediaFiles: string[],
    opts?: { publishJobId?: string },
  ): Promise<{ uploaded: number; method: string; thumbnailVisible: boolean }> {
    if (mediaFiles.length === 0) {
      return { uploaded: 0, method: 'none', thumbnailVisible: false };
    }

    const trace = opts?.publishJobId ? getPublishTrace(opts.publishJobId) : null;
    trace?.mark('UploadMedia', { count: mediaFiles.length });

    const inputs = page.locator(this.selectors.fileInput);
    const inputCount = await inputs.count().catch(() => 0);
    for (let i = 0; i < inputCount; i += 1) {
      const input = inputs.nth(i);
      const accept = (await input.getAttribute('accept').catch(() => '')) || '';
      if (accept && !/image|\*|photo/i.test(accept) && /video/i.test(accept)) {
        continue;
      }
      try {
        await input.setInputFiles(mediaFiles);
        await domSleep(this.flow.afterUploadWaitMs);
        const wait = await this.waitForUploadComplete(page, mediaFiles.length, opts?.publishJobId);
        return {
          uploaded: mediaFiles.length,
          method: 'file_input',
          thumbnailVisible: wait.thumbnailVisible,
        };
      } catch {
        // try next / fallback
      }
    }

    const photoBtn = page.getByRole('button', { name: this.selectors.photoButtonRoleName }).first();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: this.flow.fileChooserTimeoutMs }).catch(() => null),
      photoBtn.click({ timeout: this.flow.clickTimeoutMs }).catch(() => undefined),
    ]);
    if (chooser) {
      await chooser.setFiles(mediaFiles);
      await domSleep(this.flow.afterUploadWaitMs);
      const wait = await this.waitForUploadComplete(page, mediaFiles.length, opts?.publishJobId);
      return {
        uploaded: mediaFiles.length,
        method: 'file_chooser',
        thumbnailVisible: wait.thumbnailVisible,
      };
    }

    const after = page.locator(this.selectors.fileInput).first();
    if (await after.count().catch(() => 0)) {
      await after.setInputFiles(mediaFiles);
      await domSleep(this.flow.afterUploadWaitMs);
      const wait = await this.waitForUploadComplete(page, mediaFiles.length, opts?.publishJobId);
      return {
        uploaded: mediaFiles.length,
        method: 'file_input_after_click',
        thumbnailVisible: wait.thumbnailVisible,
      };
    }

    throw new Error('browser_media_input_not_found');
  }
}
