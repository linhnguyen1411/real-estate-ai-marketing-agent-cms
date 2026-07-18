/**
 * DomEvidence — screenshots + HTML snapshot helpers.
 */

import fs from 'fs/promises';
import type { Page } from 'playwright';
import { hashDomContent } from '../../runtime/publishEvidenceService';

export interface DomEvidencePaths {
  evidenceDir?: string;
  screenshotBeforePath?: string;
  screenshotAfterPath?: string;
  htmlSnapshotPath?: string;
}

export interface DomEvidenceFlags {
  screenshotBeforeTaken?: boolean;
  screenshotAfterTaken?: boolean;
}

export class DomEvidence {
  async screenshot(
    page: Page,
    path: string | undefined,
    evidenceDir?: string,
  ): Promise<boolean> {
    if (!path) return false;
    if (evidenceDir) {
      await fs.mkdir(evidenceDir, { recursive: true }).catch(() => undefined);
    } else {
      await fs.mkdir('.', { recursive: true }).catch(() => undefined);
    }
    await page.screenshot({ path, fullPage: true }).catch(() => undefined);
    return true;
  }

  async screenshotBefore(
    page: Page,
    paths: DomEvidencePaths,
    flags: DomEvidenceFlags,
  ): Promise<void> {
    if (!paths.screenshotBeforePath || flags.screenshotBeforeTaken) return;
    await this.screenshot(page, paths.screenshotBeforePath, paths.evidenceDir);
    flags.screenshotBeforeTaken = true;
  }

  async screenshotAfter(
    page: Page,
    paths: DomEvidencePaths,
    flags: DomEvidenceFlags,
  ): Promise<void> {
    if (!paths.screenshotAfterPath) return;
    await this.screenshot(page, paths.screenshotAfterPath, paths.evidenceDir);
    flags.screenshotAfterTaken = true;
  }

  async captureHtml(
    page: Page,
    htmlSnapshotPath: string | undefined,
    evidenceDir?: string,
  ): Promise<{ html: string; domHash?: string }> {
    const html = await page.content().catch(() => '');
    if (!html || !htmlSnapshotPath) return { html };
    if (evidenceDir) {
      await fs.mkdir(evidenceDir, { recursive: true }).catch(() => undefined);
    }
    const domHash = hashDomContent(html);
    await fs.writeFile(htmlSnapshotPath, html, 'utf8').catch(() => undefined);
    return { html, domHash };
  }
}
