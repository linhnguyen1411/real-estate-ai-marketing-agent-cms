import {
  FacebookGroupStubAdapter,
  FacebookPageWebStubAdapter,
} from './adapters/facebookStubs';
import { FacebookTimelineAdapter } from './adapters/facebookTimelineAdapter';
import { getCapabilitiesForDestination } from './capabilities';
import type {
  BrowserDestinationAdapter,
  DestinationKey,
  DestinationRegistration,
} from './types';

const registrations = new Map<DestinationKey, DestinationRegistration>();

function register(reg: DestinationRegistration): void {
  registrations.set(reg.key, reg);
}

function bootstrapDefaults(): void {
  if (registrations.size > 0) return;

  const stubs: Array<{ key: DestinationKey; label: string; Adapter: new () => BrowserDestinationAdapter }> =
    [
      { key: 'facebook_timeline', label: 'Facebook Timeline', Adapter: FacebookTimelineAdapter },
      { key: 'facebook_group', label: 'Facebook Group', Adapter: FacebookGroupStubAdapter },
      { key: 'facebook_page_web', label: 'Facebook Page (Web)', Adapter: FacebookPageWebStubAdapter },
    ];

  for (const { key, label, Adapter } of stubs) {
    const adapter = new Adapter();
    register({
      key,
      label,
      adapter,
      capabilities: getCapabilitiesForDestination(key),
    });
  }
}

/** Map SocialChannel.type + executionMode → destination registry key. */
export function resolveDestinationKeyFromChannel(input: {
  type: string;
  executionMode?: string | null;
  config?: unknown;
}): DestinationKey | null {
  const cfg =
    input.config && typeof input.config === 'object'
      ? (input.config as Record<string, unknown>)
      : {};
  const explicit = cfg.destinationKey;
  if (typeof explicit === 'string' && isDestinationKey(explicit)) {
    return explicit;
  }

  if (input.type === 'facebook_profile') return 'facebook_timeline';
  if (input.type === 'facebook_group') return 'facebook_group';
  if (input.type === 'facebook_page' && input.executionMode === 'browser') {
    return 'facebook_page_web';
  }
  return null;
}

export function isDestinationKey(value: string): value is DestinationKey {
  bootstrapDefaults();
  return registrations.has(value as DestinationKey);
}

export function listDestinationRegistrations(): DestinationRegistration[] {
  bootstrapDefaults();
  return [...registrations.values()];
}

export function getDestinationRegistration(key: DestinationKey): DestinationRegistration | undefined {
  bootstrapDefaults();
  return registrations.get(key);
}

export function resolveDestinationAdapter(key: DestinationKey): BrowserDestinationAdapter {
  const reg = getDestinationRegistration(key);
  if (!reg) {
    throw new Error(`No browser destination registered for key: ${key}`);
  }
  return reg.adapter;
}

export function resolveDestinationAdapterForChannel(channel: {
  type: string;
  executionMode?: string | null;
  config?: unknown;
}): BrowserDestinationAdapter {
  const key = resolveDestinationKeyFromChannel(channel);
  if (!key) {
    throw new Error(
      `No browser destination mapping for channel type=${channel.type} mode=${channel.executionMode}`,
    );
  }
  return resolveDestinationAdapter(key);
}

/** Test-only: reset registry (re-bootstrap on next access). */
export function _resetDestinationRegistryForTests(): void {
  registrations.clear();
}
