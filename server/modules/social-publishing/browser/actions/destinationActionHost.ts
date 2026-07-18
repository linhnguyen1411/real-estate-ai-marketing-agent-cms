/**
 * Host surface that Destination adapters expose to Actions.
 * Actions must not own browser connection; they use this host.
 */

import type { Locator, Page } from 'playwright';
import type {
  BrowserDestinationContext,
  BrowserDestinationEvidence,
  BrowserDestinationPhaseResult,
  DestinationCapabilities,
  DestinationKey,
} from '../types';
import type { AutomationActionKey } from './types';
import type { InteractionSelectorMap } from './interactionSelectors';

/** Destination selector surface — Action chooses which keys to use. */
export interface SelectorMap {
  composer: string;
  fileInput: string;
  publishButtonRoleName: RegExp;
}

export type DestinationActionState = {
  startedAt: number;
  page?: Page;
  evidenceDir?: string;
  screenshotBeforePath?: string;
  screenshotAfterPath?: string;
  htmlSnapshotPath?: string;
  publishedUrl?: string;
  domHash?: string;
  lastActionKey?: AutomationActionKey;
  lastActionResult?: 'success' | 'failed' | 'skipped' | 'awaiting_approval' | 'unknown';
  lastActionError?: string | null;
  lastActionData?: Record<string, unknown>;
};

/**
 * Destination-only surface: selectors, navigation helpers, capabilities,
 * and platform-specific strategy hooks (DOM). No publish orchestration here.
 */
export interface DestinationActionHost {
  readonly key: DestinationKey;
  readonly capabilities: DestinationCapabilities;
  readonly selectorMap: SelectorMap;

  ok(phase: string, data?: Record<string, unknown>): BrowserDestinationPhaseResult;
  wait(ms: number): Promise<void>;
  mapError(error: unknown, phase: string): Error;
  stateFor(ctx: BrowserDestinationContext): DestinationActionState;
  ensurePage(ctx: BrowserDestinationContext): Promise<Page | null>;
  initialUrl(ctx: BrowserDestinationContext): string;
  navigate(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
  ensureAuthenticated(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;

  /** Platform DOM: compose body into editor */
  composeStrategy(
    page: Page,
    composer: Locator,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;

  /** Platform DOM: click publish/post */
  publishStrategy(
    page: Page,
    ctx: BrowserDestinationContext,
  ): Promise<BrowserDestinationPhaseResult>;

  /** Platform DOM: verify after publish */
  verifyStrategy(
    page: Page | null,
    ctx: BrowserDestinationContext,
    state: DestinationActionState,
  ): Promise<BrowserDestinationPhaseResult>;

  /** Shared evidence capture (browser utilities) */
  captureBrowserEvidence(ctx: BrowserDestinationContext): Promise<BrowserDestinationEvidence>;

  /** Optional phased screenshot (before/after action). */
  captureScreenshotPhase?(
    ctx: BrowserDestinationContext,
    phase: 'before' | 'after',
  ): Promise<void>;

  /** Destination-owned interaction CSS / aria candidates (DOM strategy only). */
  getInteractionSelectors(): InteractionSelectorMap;

  /** Release locks / clear per-job state */
  cleanupHost(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;

  /** Init evidence paths / timers */
  prepareHost(ctx: BrowserDestinationContext): Promise<BrowserDestinationPhaseResult>;
}
