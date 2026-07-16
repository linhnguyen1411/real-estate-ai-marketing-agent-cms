import type { SocialChannel } from '@prisma/client';
import type { ChannelHealth, PublishContext, PublishResult, SocialPublisher } from '../types';
import {
  createFacebookProfileBrowserPublisher,
  type BrowserPublishDeps,
} from './facebookProfileBrowserPublisher';

/**
 * Optional thin adapter: Facebook Page via browser automation.
 * Only used when channel.executionMode === 'browser' for facebook_page.
 */
export function createFacebookPageBrowserPublisher(
  deps: BrowserPublishDeps,
): SocialPublisher {
  const profilePublisher = createFacebookProfileBrowserPublisher(deps);
  return {
    supports(channel: SocialChannel) {
      return channel.type === 'facebook_page' && channel.executionMode === 'browser';
    },
    verifyChannel(channel: SocialChannel): Promise<ChannelHealth> {
      return profilePublisher.verifyChannel(channel);
    },
    publish(ctx: PublishContext): Promise<PublishResult> {
      return profilePublisher.publish(ctx);
    },
  };
}

export const facebookPageBrowserPublisher: SocialPublisher = {
  supports(channel) {
    return channel.type === 'facebook_page' && channel.executionMode === 'browser';
  },
  async verifyChannel() {
    return {
      ok: false,
      status: 'error',
      checkedAt: new Date().toISOString(),
      details: 'Page browser publisher not configured (inject page factory in worker)',
      errorCode: 'unknown',
    };
  },
  async publish() {
    return {
      ok: false,
      errorCode: 'unknown',
      errorMessage: 'not configured — set executionMode=graph_api or inject browser factory',
    };
  },
};
