/**
 * Facebook Group — selector map, flow config, platform rules only.
 * DOM operations live in browser/dom framework.
 */

import {
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
} from '../../publishers/facebookProfileBrowserPublisher';
import {
  DEFAULT_DOM_FLOW,
  type DomFlowConfig,
  type DomPlatformRules,
  type DomSelectorConfig,
  type DomToolkitConfig,
} from '../dom';

/** All Group DOM selectors — single source of truth */
export const FACEBOOK_GROUP_SELECTORS: DomSelectorConfig = {
  composerCss:
    '[role="dialog"] [contenteditable="true"][role="textbox"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]',
  composerRoleNames: [
    /write something|viết gì đó|create a public post|tạo bài viết|what.?s on your mind|bạn đang nghĩ gì/i,
  ],
  composerCssCandidates: [
    '[aria-label*="Write something" i][contenteditable="true"]',
    '[aria-label*="Viết gì đó" i][contenteditable="true"]',
    '[aria-label*="Create a public post" i][contenteditable="true"]',
    '[aria-label*="Tạo bài viết" i][contenteditable="true"]',
    '[aria-label*="What" i][contenteditable="true"]',
    '[aria-label*="nghĩ gì" i][contenteditable="true"]',
    '[role="dialog"] [contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ],
  composerOpenTriggers: [
    /write something/i,
    /viết gì đó/i,
    /create a public post/i,
    /tạo bài viết/i,
    /what.?s on your mind/i,
    /bạn đang nghĩ gì/i,
  ],
  composerFeedPromptCss:
    '[role="button"]:has-text("Write something"), [role="button"]:has-text("Viết gì đó"), [role="button"]:has-text("Create a public post"), [role="button"]:has-text("Tạo bài viết"), [role="button"]:has-text("What\'s on your mind"), [role="button"]:has-text("Bạn đang nghĩ gì")',
  fileInput: 'input[type="file"]',
  photoButtonRoleName: /photo|video|ảnh|hình|image|media/i,
  publishButtonRoleName: /^(post|publish|đăng|share)$/i,
  publishAriaCss: '[aria-label="Post"], [aria-label="Đăng"], [aria-label="Publish"]',
  publishDialogAriaCss:
    '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"]',
  closeDialogAriaCss: '[aria-label="Close"], [aria-label="Đóng"], [aria-label="Cancel"]',
  permalinkHrefCss:
    'a[href*="/groups/"][href*="/posts/"], a[href*="story_fbid"], a[href*="/posts/"], a[href*="permalink"], a[href*="story.php"]',
};

export const FACEBOOK_GROUP_FLOW: DomFlowConfig = {
  ...DEFAULT_DOM_FLOW,
  // Groups can be slower to open composer / upload
  afterOpenWaitMs: 800,
  afterUploadWaitMs: 1_500,
  afterPublishWaitMs: 3_000,
};

export const FACEBOOK_GROUP_RULES: DomPlatformRules = {
  hostPattern: /facebook\.com/i,
  permalinkMarkers:
    /(?:\/groups\/[^/]+\/posts\/\d+|story_fbid=|\/posts\/\d+|permalink\.php|story\.php|\/activity\/\d+)/i,
  postIdPattern:
    /(?:\/groups\/[^/]+\/posts\/|story_fbid=|\/posts\/|\/activity\/|fbid=)(\d{3,})/i,
  urlPattern: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
};

export const FACEBOOK_GROUP_DOM: DomToolkitConfig = {
  selectors: FACEBOOK_GROUP_SELECTORS,
  flow: FACEBOOK_GROUP_FLOW,
  rules: FACEBOOK_GROUP_RULES,
};

/** Resolve group URL from destination config (open Group). */
export function resolveFacebookGroupUrl(config: Record<string, unknown>): string {
  for (const key of ['groupUrl', 'url', 'profileUrl', 'pageUrl'] as const) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  throw new Error('facebook_group missing groupUrl in destinationConfig');
}
