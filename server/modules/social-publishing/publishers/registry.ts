import type { SocialChannel } from '@prisma/client';
import type { SocialPublisher } from '../types';
import { facebookPageBrowserPublisher } from './facebookPageBrowserPublisher';
import { facebookPageGraphPublisher } from './facebookPageGraphPublisher';
import { facebookProfileBrowserPublisher } from './facebookProfileBrowserPublisher';

function isGraphPublishEnabled(): boolean {
  return process.env.SOCIAL_ALLOW_GRAPH_PUBLISH === '1';
}

function buildDefaultPublishers(): SocialPublisher[] {
  const publishers: SocialPublisher[] = [
    facebookProfileBrowserPublisher,
    facebookPageBrowserPublisher,
  ];
  if (isGraphPublishEnabled()) {
    publishers.unshift(facebookPageGraphPublisher);
  }
  return publishers;
}

let runtimePublishers: SocialPublisher[] = buildDefaultPublishers();

/** Worker can replace/augment publishers with browser-capable instances. */
export function setPublisherRegistry(publishers: SocialPublisher[]): void {
  runtimePublishers = publishers.length ? publishers : buildDefaultPublishers();
}

export function resetPublisherRegistry(): void {
  runtimePublishers = buildDefaultPublishers();
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
