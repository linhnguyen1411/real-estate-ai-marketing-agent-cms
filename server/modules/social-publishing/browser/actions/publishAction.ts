/**
 * PublishAction — browser publish as an Automation Action.
 * Owns publish-specific orchestration (upload / compose / click publish).
 * Destination host supplies selectors + DOM strategies only.
 */

import type { DestinationActionHost } from './destinationActionHost';
import type {
  AutomationAction,
  AutomationActionContext,
  AutomationActionEvidence,
  AutomationActionResult,
} from './types';

export class PublishAction implements AutomationAction {
  readonly key = 'publish' as const;
  readonly label = 'Publish';

  constructor(private readonly host: DestinationActionHost) {}

  async prepare(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    return this.host.prepareHost(ctx);
  }

  /**
   * Full publish execute: upload media → compose → publish click.
   * Granular phases remain available for workflow step compatibility.
   */
  async execute(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const upload = await this.uploadMedia(ctx);
    if (!upload.ok) return upload;
    const compose = await this.fillContent(ctx);
    if (!compose.ok) return compose;
    return this.publish(ctx);
  }

  async uploadMedia(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const page = await this.host.ensurePage(ctx);
    if (!page || ctx.dryRun) {
      return this.host.ok('uploadMedia', { mediaCount: ctx.media.length, dryRun: true });
    }
    const mediaFiles = ctx.media
      .map(m => m.fileUrl)
      .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
    if (mediaFiles.length === 0) {
      return this.host.ok('uploadMedia', { mediaCount: 0 });
    }

    const input = page.locator(this.host.selectorMap.fileInput).first();
    if (await input.count().catch(() => 0)) {
      await input.setInputFiles(mediaFiles).catch(() => undefined);
      return this.host.ok('uploadMedia', { mediaCount: mediaFiles.length, method: 'file_input' });
    }
    return this.host.ok('uploadMedia', { mediaCount: 0, skipped: 'no_file_input' });
  }

  async fillContent(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const page = await this.host.ensurePage(ctx);
    if (!page || ctx.dryRun) {
      return this.host.ok('compose', { dryRun: true });
    }
    const composer = page.locator(this.host.selectorMap.composer).first();
    try {
      return await this.host.composeStrategy(page, composer, ctx);
    } catch (error) {
      throw this.host.mapError(error, 'compose');
    }
  }

  async publish(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const page = await this.host.ensurePage(ctx);
    const state = this.host.stateFor(ctx);
    if (!page || ctx.dryRun) {
      state.publishedUrl = `${this.host.initialUrl(ctx)}?story_fbid=stub_${ctx.publishJobId}`;
      return this.host.ok('publish', { dryRun: true, publishedUrl: state.publishedUrl });
    }
    try {
      const result = await this.host.publishStrategy(page, ctx);
      if (result.data?.publishedUrl && typeof result.data.publishedUrl === 'string') {
        state.publishedUrl = result.data.publishedUrl;
      } else {
        state.publishedUrl = page.url();
      }
      return result;
    } catch (error) {
      throw this.host.mapError(error, 'publish');
    }
  }

  async verify(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    const page = await this.host.ensurePage(ctx);
    const state = this.host.stateFor(ctx);
    return this.host.verifyStrategy(page, ctx, state);
  }

  async captureEvidence(ctx: AutomationActionContext): Promise<AutomationActionEvidence> {
    return this.host.captureBrowserEvidence(ctx);
  }

  async cleanup(ctx: AutomationActionContext): Promise<AutomationActionResult> {
    return this.host.cleanupHost(ctx);
  }
}
