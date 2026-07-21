import type { DestinationCapabilities, DestinationKey } from './types';

export const DEFAULT_CAPABILITIES: DestinationCapabilities = {
  supportsText: true,
  supportsImage: true,
  /** H0.5 — Video upload is Experimental; do not block stable release. */
  supportsVideo: false,
  supportsLinks: true,
  supportsScheduling: false,
  supportsVerification: true,
};

/**
 * H0.5 Facebook publish maturity:
 * - Timeline/Group: text + multi-image + upload retry + evidence + verify = Stable
 * - Video: Experimental (not enabled)
 */
export const FACEBOOK_PUBLISH_MATURITY = {
  timeline: 'stable' as const,
  group: 'stable' as const,
  multiImage: 'stable' as const,
  uploadRetry: 'stable' as const,
  evidence: 'stable' as const,
  verification: 'stable' as const,
  video: 'experimental' as const,
};

/** Capability presets per registered destination (UI + workflow read-only). */
export const DESTINATION_CAPABILITY_PRESETS: Record<DestinationKey, DestinationCapabilities> = {
  facebook_timeline: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false, // Experimental — not in v0.9 stable surface
    supportsLinks: true,
    supportsScheduling: false,
    supportsVerification: true,
  },
  facebook_group: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false, // Experimental — not in v0.9 stable surface
    supportsLinks: true,
    supportsScheduling: false,
    supportsVerification: true,
  },
  facebook_page_web: {
    supportsText: true,
    supportsImage: true,
    supportsVideo: false, // Experimental — not in v0.9 stable surface
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
