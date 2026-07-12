/**
 * Facebook navigation state machine for the Group Reader.
 *
 * Single responsibility: know WHERE the scan tab is and guarantee it is on the
 * group feed before every parse/scroll pass. It never scrapes content — it only
 * detects state, opens/closes a post-detail modal, and recovers back to the feed.
 */

import type { Locator, Page } from 'playwright';
import { detectFacebookAuthBlock } from './facebookCheckpointDetector';
import {
  FB_DIALOG_CLOSE_SELECTOR,
  isFacebookFeedContextUrl,
} from './facebookSelectors';
import {
  FB_FEED_ROOT_SELECTOR,
  waitForFacebookGroupFeed,
} from './facebookFeedLocator';

export type FacebookNavigationState =
  | 'group_feed'
  | 'post_detail_modal'
  | 'post_detail_page'
  | 'login_required'
  | 'checkpoint'
  | 'challenge'
  | 'unknown';

/** Scan-flow error codes (recorded on source.lastError; non-retryable). */
export const FACEBOOK_NAV_ERROR_CODES = {
  MODAL_STUCK: 'FACEBOOK_MODAL_STUCK',
  WRONG_SCROLL_TARGET: 'FACEBOOK_WRONG_SCROLL_TARGET',
  FEED_NOT_RECOVERED: 'FACEBOOK_FEED_NOT_RECOVERED',
  NAVIGATION_STATE_UNKNOWN: 'FACEBOOK_NAVIGATION_STATE_UNKNOWN',
} as const;

export type FacebookNavErrorCode =
  (typeof FACEBOOK_NAV_ERROR_CODES)[keyof typeof FACEBOOK_NAV_ERROR_CODES];

/** Scan-flow stop reasons introduced by the navigation guard. */
export const FACEBOOK_NAV_STOP_REASONS = {
  MODAL_STUCK: 'modal_stuck',
  WRONG_SCROLL_TARGET: 'wrong_scroll_target',
  FEED_NOT_RECOVERED: 'feed_not_recovered',
  NAVIGATION_STATE_UNKNOWN: 'navigation_state_unknown',
} as const;

export interface FacebookNavigationSnapshot {
  state: FacebookNavigationState;
  currentUrl: string;
  hasFeed: boolean;
  hasPostDialog: boolean;
}

const POST_DETAIL_URL_PATTERN =
  /\/posts\/|\/permalink\/|story_fbid=|\/photo(\.php|\/)|\/videos\//i;

export function isAuthBlockedState(state: FacebookNavigationState): boolean {
  return (
    state === 'login_required' || state === 'checkpoint' || state === 'challenge'
  );
}

export interface NavigationDecisionInput {
  authKind: 'login' | 'checkpoint' | 'challenge' | 'captcha' | null;
  hasPostDialog: boolean;
  hasFeed: boolean;
  isGroupUrl: boolean;
  isPostDetailUrl: boolean;
}

/**
 * Pure state decision — unit-testable without a live DOM. Auth blocks first,
 * then a post-detail modal, then feed vs. standalone post-detail page.
 */
export function decideFacebookNavigationState(
  input: NavigationDecisionInput,
): FacebookNavigationState {
  if (input.authKind === 'login') return 'login_required';
  if (input.authKind === 'checkpoint') return 'checkpoint';
  if (input.authKind === 'challenge' || input.authKind === 'captcha') {
    return 'challenge';
  }
  if (input.hasPostDialog) return 'post_detail_modal';
  // `isGroupUrl` also covers personal home feed (see detectFacebookNavigationState).
  if (input.hasFeed && input.isGroupUrl) return 'group_feed';
  if (!input.hasFeed && input.isPostDetailUrl) return 'post_detail_page';
  return 'unknown';
}

interface DomProbe {
  hasPostDialog: boolean;
  hasFeed: boolean;
}

// NOTE: must be a STRING script (not a function) — the worker runs under tsx and
// esbuild's keepNames injects a `__name` helper into evaluated functions that is
// undefined in the browser, silently breaking DOM probes.
const PROBE_DOM_SCRIPT = `(() => {
  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  var dialog = document.querySelector('[role="dialog"]');
  var hasPostDialog = false;
  if (dialog && isVisible(dialog)) {
    var article = dialog.querySelector('[role="article"]');
    var permalink = dialog.querySelector('a[href*="/posts/"], a[href*="/permalink"], a[href*="story_fbid"]');
    hasPostDialog = !!(article || permalink);
  }
  var feed = document.querySelector('[role="feed"]');
  return { hasPostDialog: hasPostDialog, hasFeed: isVisible(feed) };
})()`;

async function probeDom(page: Page): Promise<DomProbe> {
  return page
    .evaluate(PROBE_DOM_SCRIPT)
    .then(r => r as DomProbe)
    .catch(() => ({ hasPostDialog: false, hasFeed: false }));
}

/**
 * Detect the current navigation state of the scan tab.
 */
export async function detectFacebookNavigationState(
  page: Page,
  sourceUrl?: string,
): Promise<FacebookNavigationSnapshot> {
  const auth = await detectFacebookAuthBlock(page);
  const currentUrl = auth.currentUrl || page.url();
  const probe = auth.blocked ? { hasPostDialog: false, hasFeed: false } : await probeDom(page);

  const state = decideFacebookNavigationState({
    authKind: auth.kind,
    hasPostDialog: probe.hasPostDialog,
    hasFeed: probe.hasFeed,
    isGroupUrl:
      isFacebookFeedContextUrl(currentUrl) ||
      (sourceUrl ? isFacebookFeedContextUrl(sourceUrl) : false),
    isPostDetailUrl: POST_DETAIL_URL_PATTERN.test(currentUrl),
  });

  return {
    state,
    currentUrl,
    hasFeed: probe.hasFeed,
    hasPostDialog: probe.hasPostDialog,
  };
}

export interface OpenPostDetailResult {
  opened: boolean;
  state: FacebookNavigationState;
}

/**
 * Open a post-detail modal by clicking the post's permalink/timestamp.
 * Provided for completeness/testing — the Reader itself never opens details.
 */
export async function openPostDetail(
  page: Page,
  postLocator: Locator,
): Promise<OpenPostDetailResult> {
  const link = postLocator
    .locator('a[href*="/posts/"], a[href*="/permalink"], a[href*="story_fbid"]')
    .first();
  if (await link.isVisible().catch(() => false)) {
    await link.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
  const snapshot = await detectFacebookNavigationState(page);
  return { opened: snapshot.state === 'post_detail_modal', state: snapshot.state };
}

export interface ClosePostDetailResult {
  closed: boolean;
  method: 'none' | 'close_button' | 'escape' | 'navigate';
  state: FacebookNavigationState;
}

/**
 * Close a post-detail modal and recover to the feed.
 * Order: scoped close button → Escape → navigate sourceUrl. Only reports success
 * when the resulting state is `group_feed` (or no modal was present).
 */
export async function closePostDetail(
  page: Page,
  sourceUrl: string,
  options: { pageTimeoutMs?: number; feedWaitMs?: number } = {},
): Promise<ClosePostDetailResult> {
  const pageTimeoutMs = options.pageTimeoutMs ?? 45_000;
  const feedWaitMs = options.feedWaitMs ?? 6_000;

  let snapshot = await detectFacebookNavigationState(page, sourceUrl);
  if (snapshot.state !== 'post_detail_modal') {
    return { closed: true, method: 'none', state: snapshot.state };
  }

  // 1) scoped close button inside the dialog
  const closeButton = page.locator(FB_DIALOG_CLOSE_SELECTOR).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    snapshot = await detectFacebookNavigationState(page, sourceUrl);
    if (snapshot.state !== 'post_detail_modal') {
      return { closed: true, method: 'close_button', state: snapshot.state };
    }
  }

  // 2) Escape
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(500);
  snapshot = await detectFacebookNavigationState(page, sourceUrl);
  if (snapshot.state !== 'post_detail_modal') {
    return { closed: true, method: 'escape', state: snapshot.state };
  }

  // 3) navigate back to the source feed
  await page
    .goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: pageTimeoutMs })
    .catch(() => undefined);
  await waitForFacebookGroupFeed(page, feedWaitMs);
  snapshot = await detectFacebookNavigationState(page, sourceUrl);
  return {
    closed: snapshot.state !== 'post_detail_modal',
    method: 'navigate',
    state: snapshot.state,
  };
}

/** @deprecated use closePostDetail — retained for the adapter's finally cleanup. */
export async function closeFacebookModalIfOpen(page: Page): Promise<boolean> {
  const snapshot = await detectFacebookNavigationState(page);
  if (snapshot.state !== 'post_detail_modal') return false;
  const result = await closePostDetail(page, snapshot.currentUrl);
  return result.closed && result.state !== 'post_detail_modal';
}

export interface EnsureGroupFeedInput {
  page: Page;
  sourceUrl: string;
  /** True when the scan tab is worker-owned (allows navigation recovery) */
  ownedByWorker: boolean;
  pageTimeoutMs?: number;
  feedWaitMs?: number;
}

export interface EnsureGroupFeedResult {
  ok: boolean;
  state: FacebookNavigationState;
  /** Modal closed and/or navigated back to the feed */
  recovered: boolean;
  modalDetected: boolean;
  modalClosed: boolean;
  modalCloseFailed: boolean;
  errorCode?: FacebookNavErrorCode;
  stopReason?: string;
}

/**
 * Guarantee the tab is on the group feed before a parse/scroll pass.
 */
export async function ensureGroupFeedState(
  input: EnsureGroupFeedInput,
): Promise<EnsureGroupFeedResult> {
  const { page, sourceUrl, ownedByWorker } = input;
  const pageTimeoutMs = input.pageTimeoutMs ?? 45_000;
  const feedWaitMs = input.feedWaitMs ?? 6_000;

  let snapshot = await detectFacebookNavigationState(page, sourceUrl);
  let recovered = false;
  let modalDetected = false;
  let modalClosed = false;

  if (isAuthBlockedState(snapshot.state)) {
    return {
      ok: false,
      state: snapshot.state,
      recovered,
      modalDetected,
      modalClosed,
      modalCloseFailed: false,
    };
  }

  if (snapshot.state === 'post_detail_modal') {
    modalDetected = true;
    const close = await closePostDetail(page, sourceUrl, { pageTimeoutMs, feedWaitMs });
    modalClosed = close.closed && close.state !== 'post_detail_modal';
    recovered = recovered || modalClosed;
    snapshot = await detectFacebookNavigationState(page, sourceUrl);

    if (snapshot.state === 'post_detail_modal') {
      return {
        ok: false,
        state: snapshot.state,
        recovered,
        modalDetected,
        modalClosed: false,
        modalCloseFailed: true,
        errorCode: FACEBOOK_NAV_ERROR_CODES.MODAL_STUCK,
        stopReason: FACEBOOK_NAV_STOP_REASONS.MODAL_STUCK,
      };
    }
    if (isAuthBlockedState(snapshot.state)) {
      return {
        ok: false,
        state: snapshot.state,
        recovered,
        modalDetected,
        modalClosed,
        modalCloseFailed: false,
      };
    }
  }

  if (snapshot.state !== 'group_feed' && ownedByWorker) {
    await page
      .goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: pageTimeoutMs })
      .catch(() => undefined);
    await waitForFacebookGroupFeed(page, feedWaitMs);
    recovered = true;
    snapshot = await detectFacebookNavigationState(page, sourceUrl);
  }

  if (snapshot.state === 'group_feed') {
    return { ok: true, state: snapshot.state, recovered, modalDetected, modalClosed, modalCloseFailed: false };
  }

  if (isAuthBlockedState(snapshot.state)) {
    return { ok: false, state: snapshot.state, recovered, modalDetected, modalClosed, modalCloseFailed: false };
  }

  const unknownState = snapshot.state === 'unknown';
  return {
    ok: false,
    state: snapshot.state,
    recovered,
    modalDetected,
    modalClosed,
    modalCloseFailed: false,
    errorCode: unknownState
      ? FACEBOOK_NAV_ERROR_CODES.NAVIGATION_STATE_UNKNOWN
      : FACEBOOK_NAV_ERROR_CODES.FEED_NOT_RECOVERED,
    stopReason: unknownState
      ? FACEBOOK_NAV_STOP_REASONS.NAVIGATION_STATE_UNKNOWN
      : FACEBOOK_NAV_STOP_REASONS.FEED_NOT_RECOVERED,
  };
}

export { FB_FEED_ROOT_SELECTOR };
