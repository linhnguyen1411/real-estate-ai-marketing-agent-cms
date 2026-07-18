/**
 * Facebook Timeline adapter — config + auth/URL only.
 * Orchestration via DomConfiguredDestinationAdapter + Dom Framework.
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
import { type DestinationPageFactory } from './genericBrowserDestinationAdapter';
import { DomConfiguredDestinationAdapter } from './domConfiguredDestinationAdapter';
import {
  FACEBOOK_TIMELINE_DOM,
  FACEBOOK_TIMELINE_HOME,
} from './facebookTimelineConfig';

export class FacebookTimelineAdapter extends DomConfiguredDestinationAdapter {
  readonly key = 'facebook_timeline' as const;
  readonly capabilities = DESTINATION_CAPABILITY_PRESETS.facebook_timeline;

  constructor() {
    super(FACEBOOK_TIMELINE_DOM);
  }

  initialUrl(ctx: BrowserDestinationContext): string {
    const configured = ctx.destinationConfig?.profileUrl;
    if (typeof configured === 'string' && configured.trim()) return configured.trim();
    return FACEBOOK_TIMELINE_HOME;
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
}

export const facebookTimelineAdapter = new FacebookTimelineAdapter();

export function configureFacebookTimelineAdapterRuntime(deps: {
  pageFactory?: DestinationPageFactory;
}): void {
  facebookTimelineAdapter.configureRuntime(deps.pageFactory);
}

/** Test helpers — platform rules via DomVerifier */
const _timelineDom = createDomToolkit(FACEBOOK_TIMELINE_DOM);

export function extractFacebookPermalink(input: {
  currentUrl?: string | null;
  hrefs?: string[];
  html?: string | null;
  bodyText?: string | null;
}) {
  return _timelineDom.verifier.extractPermalink(input);
}

export function extractPostIdFromUrl(url: string) {
  return _timelineDom.verifier.extractPostIdFromUrl(url);
}

export { localMediaPaths };
