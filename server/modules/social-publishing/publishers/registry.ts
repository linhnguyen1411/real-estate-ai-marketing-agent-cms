import type { SocialChannel } from '@prisma/client';
import type { SocialPublisher } from '../types';
import { facebookPageBrowserPublisher } from './facebookPageBrowserPublisher';
import { facebookPageGraphPublisher } from './facebookPageGraphPublisher';
import { facebookProfileBrowserPublisher } from './facebookProfileBrowserPublisher';

const DEFAULT_PUBLISHERS: SocialPublisher[] = [
  facebookPageGraphPublisher,
  facebookProfileBrowserPublisher,
  facebookPageBrowserPublisher,
];

let runtimePublishers: SocialPublisher[] = [...DEFAULT_PUBLISHERS];

/** Worker can replace/augment publishers with browser-capable instances. */
export function setPublisherRegistry(publishers: SocialPublisher[]): void {
  runtimePublishers = publishers.length ? publishers : [...DEFAULT_PUBLISHERS];
}

export function resetPublisherRegistry(): void {
  runtimePublishers = [...DEFAULT_PUBLISHERS];
}

export function resolvePublisher(channel: SocialChannel): SocialPublisher {
  const found = runtimePublishers.find(p => p.supports(channel));
  if (!found) {
    throw new Error(
      `No publisher for channel type=${channel.type} mode=${channel.executionMode}`,
    );
  }
  return found;
}

export { facebookPageGraphPublisher, facebookProfileBrowserPublisher, facebookPageBrowserPublisher };
