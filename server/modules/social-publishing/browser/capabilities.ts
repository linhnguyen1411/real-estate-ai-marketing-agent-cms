import type { DestinationCapabilities, DestinationKey } from './types';

export const DEFAULT_CAPABILITIES: DestinationCapabilities = {
  supportsText: true,
  supportsImage: true,
  supportsVideo: false,
  supportsLinks: true,
  supportsScheduling: false,
  supportsVerification: true,
};

/** Capability presets per registered destination (UI + workflow read-only). */
export const DESTINATION_CAPABILITY_PRESETS: Record<DestinationKey, DestinationCapabilities> = {
  facebook_timeline: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false,
    supportsLinks: true,
    supportsScheduling: false,
    supportsVerification: true,
  },
  facebook_group: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false,
    supportsLinks: true,
    supportsScheduling: false,
    supportsVerification: true,
  },
  facebook_page_web: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false,
    supportsLinks: true,
    supportsScheduling: false,
    supportsVerification: true,
  },
};

export function getCapabilitiesForDestination(key: DestinationKey): DestinationCapabilities {
  return { ...DESTINATION_CAPABILITY_PRESETS[key] };
}

export function assertCapability(
  caps: DestinationCapabilities,
  need: keyof DestinationCapabilities,
): { ok: true } | { ok: false; reason: string } {
  if (!caps[need]) {
    return { ok: false, reason: `Destination does not support ${need}` };
  }
  return { ok: true };
}
