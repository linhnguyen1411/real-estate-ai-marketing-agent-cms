/**
 * Browser destination publishing — platform-agnostic contracts.
 * No Playwright/DOM logic in this layer (Phase A foundation).
 */

/** Registered destination keys (extensible via registry). */
export const DESTINATION_KEYS = [
  'facebook_timeline',
  'facebook_group',
  'facebook_page_web',
] as const;

export type DestinationKey = (typeof DESTINATION_KEYS)[number];

export interface DestinationCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsLinks: boolean;
  supportsScheduling: boolean;
  supportsVerification: boolean;
}

export interface BrowserDestinationContext {
  publishJobId: string;
  draftId: string;
  destinationId: string;
  missionRunId: string;
  workerId?: string | null;
  browserSessionId?: string | null;
  body: string;
  linkUrl?: string | null;
  media: Array<{ type: string; fileUrl: string; sortOrder?: number }>;
  destinationConfig: Record<string, unknown>;
  dryRun: boolean;
}

export interface BrowserDestinationPhaseResult {
  ok: boolean;
  phase: string;
  dryRun?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface BrowserDestinationEvidence {
  publishedUrl?: string;
  postId?: string;
  domHash?: string;
  screenshotBeforePath?: string;
  screenshotAfterPath?: string;
  htmlSnapshotPath?: string;
  durationMs?: number;
  /** Interaction action metadata (reuse publish evidence paths). */
  actionKey?: string;
  result?: string;
  error?: string | null;
}

/**
 * Platform-agnostic browser publisher contract.
 * Facebook-specific adapters implement this in Phase C+.
 */
export interface BrowserDestinationAdapter {
  readonly key: DestinationKey;
  readonly capabilities: DestinationCapabilities;

  prepare(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  uploadMedia(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  fillContent(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  publish(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  verify(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  captureEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence>;
  cleanup(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
}

export interface DestinationRegistration {
  key: DestinationKey;
  label: string;
  adapter: BrowserDestinationAdapter;
  capabilities: DestinationCapabilities;
}
