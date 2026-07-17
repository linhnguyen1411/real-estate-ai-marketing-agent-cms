import type { Locator, Page } from 'playwright';
import { detectFacebookAuthBlock } from '../../../../agent-worker/facebook/facebookCheckpointDetector';
import { DESTINATION_CAPABILITY_PRESETS } from '../capabilities';
import type {
  BrowserDestinationContext,
  BrowserDestinationPhaseResult,
} from '../types';
import type { DestinationActionState } from '../actions/destinationActionHost';
import {
  type DestinationPageFactory,
  GenericBrowserDestinationAdapter,
} from './genericBrowserDestinationAdapter';

export class FacebookTimelineAdapter extends GenericBrowserDestinationAdapter {
  readonly key = 'facebook_timeline' as const;
  readonly capabilities = DESTINATION_CAPABILITY_PRESETS.facebook_timeline;
  readonly selectorMap = {
    composer: '[contenteditable="true"][role="textbox"], div[contenteditable="true"]',
    fileInput: 'input[type="file"]',
    publishButtonRoleName: /^(post|publish|đăng|share)$/i,
  };

  initialUrl(_ctx: BrowserDestinationContext): string {
    return 'https://www.facebook.com/';
  }

  protected async ensureAuthenticatedImpl(
    page: Page,
    _ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const auth = await detectFacebookAuthBlock(page);
    if (auth.blocked) {
      throw new Error(auth.reason || 'facebook_auth_blocked');
    }
    return this.ok('ensureAuthenticated', { url: page.url() });
  }

  async composeStrategy(
    page: Page,
    composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    await composer.click({ timeout: 10_000 }).catch(() => undefined);
    await composer.fill(ctx.body).catch(async () => {
      await page.keyboard.type(ctx.body, { delay: 5 });
    });
    if (ctx.linkUrl) {
      await page.keyboard.type(`\n${ctx.linkUrl}`, { delay: 5 }).catch(() => undefined);
    }
    return this.ok('compose', { bodyLength: ctx.body.length, hasLink: Boolean(ctx.linkUrl) });
  }

  async publishStrategy(
    page: Page,
    _ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const button = page.getByRole('button', { name: this.selectorMap.publishButtonRoleName }).first();
    await button.click({ timeout: 10_000 }).catch(() => undefined);
    await this.wait(2_500);
    return this.ok('publish', { publishedUrl: page.url() });
  }

  async verifyStrategy(
    _page: Page | null,
    _ctx: BrowserDestinationContext,
    state: DestinationActionState,
  ): Promise<BrowserDestinationPhaseResult> {
    return this.ok('verify', { publishedUrl: state.publishedUrl ?? null });
  }
}

export const facebookTimelineAdapter = new FacebookTimelineAdapter();

export function configureFacebookTimelineAdapterRuntime(deps: {
  pageFactory?: DestinationPageFactory;
}): void {
  facebookTimelineAdapter.configureRuntime(deps.pageFactory);
}
