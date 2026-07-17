/**
 * Facebook Group adapter — config + orchestration only.
 * Reuses DomConfiguredDestinationAdapter + Dom Framework (no Timeline copy).
 */

import type { Page } from 'playwright';
import { detectFacebookAuthBlock } from '../../../../agent-worker/facebook/facebookCheckpointDetector';
import { DESTINATION_CAPABILITY_PRESETS } from '../capabilities';
import type {
  BrowserDestinationContext,
  BrowserDestinationPhaseResult,
} from '../types';
import {
  createDomToolkit,
  localMediaPaths,
} from '../dom';
import {
  type DestinationPageFactory,
} from './genericBrowserDestinationAdapter';
import { DomConfiguredDestinationAdapter } from './domConfiguredDestinationAdapter';
import {
  FACEBOOK_GROUP_DOM,
  resolveFacebookGroupUrl,
} from './facebookGroupConfig';

export class FacebookGroupAdapter extends DomConfiguredDestinationAdapter {
  readonly key = 'facebook_group' as const;
  readonly capabilities = DESTINATION_CAPABILITY_PRESETS.facebook_group;

  constructor() {
    super(FACEBOOK_GROUP_DOM);
  }

  /** Open the target Group (discussion surface). */
  initialUrl(ctx: BrowserDestinationContext): string {
    return resolveFacebookGroupUrl(ctx.destinationConfig);
  }

  protected async ensureAuthenticatedImpl(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult> {
    const auth = await detectFacebookAuthBlock(page);
    if (auth.blocked) {
      throw new Error(auth.reason || 'facebook_auth_blocked');
    }

    const url = page.url();
    const expected = resolveFacebookGroupUrl(ctx.destinationConfig);
    const onGroup =
      /facebook\.com\/groups\//i.test(url) ||
      (expected && url.includes(expected.replace(/\/$/, '').split('/').pop() || ''));

    return this.ok('ensureAuthenticated', {
      url,
      onGroup: Boolean(onGroup),
      groupUrl: expected,
    });
  }
}

export const facebookGroupAdapter = new FacebookGroupAdapter();

export function configureFacebookGroupAdapterRuntime(deps: {
  pageFactory?: DestinationPageFactory;
}): void {
  facebookGroupAdapter.configureRuntime(deps.pageFactory);
}

/** Test helpers — Group platform rules via DomVerifier */
const _groupDom = createDomToolkit(FACEBOOK_GROUP_DOM);

export function extractFacebookGroupPermalink(input: {
  currentUrl?: string | null;
  hrefs?: string[];
  html?: string | null;
  bodyText?: string | null;
}) {
  return _groupDom.verifier.extractPermalink(input);
}

export function extractFacebookGroupPostId(url: string) {
  return _groupDom.verifier.extractPostIdFromUrl(url);
}

export { localMediaPaths, resolveFacebookGroupUrl };
