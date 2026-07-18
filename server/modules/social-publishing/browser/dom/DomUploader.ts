/**
 * DomUploader — attach local media files via file input or file chooser.
 */

import type { Page } from 'playwright';
import type { DomFlowConfig, DomSelectorConfig } from './types';
import { domSleep } from './types';

export class DomUploader {
  constructor(
    private readonly selectors: DomSelectorConfig,
    private readonly flow: DomFlowConfig,
  ) {}

  async uploadFiles(
    page: Page,
    mediaFiles: string[],
  ): Promise<{ uploaded: number; method: string }> {
    if (mediaFiles.length === 0) {
      return { uploaded: 0, method: 'none' };
    }

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
        return { uploaded: mediaFiles.length, method: 'file_input' };
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
      return { uploaded: mediaFiles.length, method: 'file_chooser' };
    }

    const after = page.locator(this.selectors.fileInput).first();
    if (await after.count().catch(() => 0)) {
      await after.setInputFiles(mediaFiles);
      await domSleep(this.flow.afterUploadWaitMs);
      return { uploaded: mediaFiles.length, method: 'file_input_after_click' };
    }

    throw new Error('browser_media_input_not_found');
  }
}
