import { DESTINATION_CAPABILITY_PRESETS } from '../capabilities';
import type { DestinationKey } from '../types';
import { StubBrowserDestinationAdapter } from './stubDestinationAdapter';

function makeStub(key: DestinationKey, label: string) {
  return class extends StubBrowserDestinationAdapter {
    readonly key = key;
    readonly capabilities = DESTINATION_CAPABILITY_PRESETS[key];
    static readonly label = label;
  };
}

export const FacebookTimelineStubAdapter = makeStub('facebook_timeline', 'Facebook Timeline');
export const FacebookGroupStubAdapter = makeStub('facebook_group', 'Facebook Group');
export const FacebookPageWebStubAdapter = makeStub('facebook_page_web', 'Facebook Page (Web)');
