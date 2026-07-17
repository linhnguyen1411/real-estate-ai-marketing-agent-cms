/**
 * DestinationRegistry facade — wraps social-publishing destination registry.
 * Automation Engine entry point; production adapters unchanged.
 */

import {
  getDestinationRegistration,
  listDestinationRegistrations,
  resolveDestinationAdapter,
  resolveDestinationKeyFromChannel,
} from '../social-publishing/browser/destinationRegistry';
import type { DestinationKey } from '../social-publishing/browser/types';

export const DestinationRegistry = {
  list: listDestinationRegistrations,
  get: getDestinationRegistration,
  resolve: resolveDestinationAdapter,
  resolveKeyFromChannel: resolveDestinationKeyFromChannel,
  keys: (): DestinationKey[] => listDestinationRegistrations().map(r => r.key),
};
