/**
 * Generic DOM Framework — shared browser interaction primitives.
 * Destinations supply selectors / flow / platform rules; framework owns DOM ops.
 */

import type { Page } from 'playwright';

export interface DomSelectorConfig {
  /** CSS for contenteditable composer(s), comma-separated ok */
  composerCss: string;
  /** Role=textbox name patterns for composer */
  composerRoleNames: RegExp[];
  /** Extra CSS candidates for composer (aria-label etc.) */
  composerCssCandidates: string[];
  /** Buttons that open the create-post dialog */
  composerOpenTriggers: RegExp[];
  /** Feed placeholder CSS (non-role buttons) */
  composerFeedPromptCss: string;
  fileInput: string;
  photoButtonRoleName: RegExp;
  publishButtonRoleName: RegExp;
  /** aria-label CSS for publish buttons */
  publishAriaCss: string;
  /** dialog-scoped publish aria CSS */
  publishDialogAriaCss: string;
  closeDialogAriaCss: string;
  /** Links that may carry permalinks after publish */
  permalinkHrefCss: string;
}

export interface DomFlowConfig {
  clickTimeoutMs: number;
  publishClickTimeoutMs: number;
  fileChooserTimeoutMs: number;
  afterOpenWaitMs: number;
  afterFocusWaitMs: number;
  afterTypeKeyDelayMs: number;
  afterUploadWaitMs: number;
  afterPublishWaitMs: number;
  disabledPublishWaitMs: number;
  openRetries: number;
  uploadRetries: number;
  publishRetries: number;
  composeRetries: number;
  retryWaitMs: number;
  openRetryWaitMs: number;
  uploadRetryWaitMs: number;
  publishRetryWaitMs: number;
  composeRetryWaitMs: number;
}

export interface PublishSuccessSignal {
  success: boolean;
  reason: string;
}

export interface PublishTimeoutRecovery {
  recovered: boolean;
  success: boolean;
  reason: string;
}

export interface DomPermalinkResult {
  permalink: string | null;
  postId: string | null;
}

export interface DomPlatformRules {
  /** Hostname / URL must match before treating as platform permalink */
  hostPattern: RegExp;
  /** URL must contain one of these markers to count as permalink */
  permalinkMarkers: RegExp;
  /** Capture group 1 = post id */
  postIdPattern: RegExp;
  /** Extract candidate URLs from HTML/text */
  urlPattern: RegExp;
  parsePublishSuccess(input: {
    currentUrl?: string;
    bodyText?: string;
    toastText?: string;
  }): PublishSuccessSignal;
  recoverAfterPublishClickTimeout(input: {
    timedOut: boolean;
    currentUrl?: string;
    bodyText?: string;
    toastText?: string;
  }): PublishTimeoutRecovery;
}

export interface DomToolkitConfig {
  selectors: DomSelectorConfig;
  flow: DomFlowConfig;
  rules: DomPlatformRules;
}

export type DomPage = Page;

export const DEFAULT_DOM_FLOW: DomFlowConfig = {
  clickTimeoutMs: 10_000,
  publishClickTimeoutMs: 15_000,
  fileChooserTimeoutMs: 8_000,
  afterOpenWaitMs: 600,
  afterFocusWaitMs: 300,
  afterTypeKeyDelayMs: 8,
  afterUploadWaitMs: 1_200,
  afterPublishWaitMs: 2_500,
  disabledPublishWaitMs: 1_500,
  openRetries: 2,
  uploadRetries: 2,
  publishRetries: 2,
  composeRetries: 2,
  retryWaitMs: 500,
  openRetryWaitMs: 700,
  uploadRetryWaitMs: 800,
  publishRetryWaitMs: 600,
  composeRetryWaitMs: 500,
};

export async function domSleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function domWithRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  waitMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await domSleep(waitMs);
    }
  }
  throw lastErr;
}

/** Keep only local file paths (skip remote http(s) URLs). */
export function localMediaPaths(media: Array<{ fileUrl: string }>): string[] {
  return media
    .map(m => m.fileUrl)
    .filter(p => typeof p === 'string' && p.trim().length > 0 && !/^https?:\/\//i.test(p));
}
