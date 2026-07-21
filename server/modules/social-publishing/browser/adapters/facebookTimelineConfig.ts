/**
 * Facebook Timeline — selector map, flow config, platform rules only.
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

/** Selector map for DestinationActionHost + Dom framework */
export const FACEBOOK_TIMELINE_SELECTORS: DomSelectorConfig = {
  composerCss:
    '[role="dialog"] [contenteditable="true"][role="textbox"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]',
  composerRoleNames: [
    /what.?s on your mind|bạn đang nghĩ gì|create a post|tạo bài viết/i,
  ],
  composerCssCandidates: [
    '[aria-label*="What" i][contenteditable="true"]',
    '[aria-label*="nghĩ gì" i][contenteditable="true"]',
    '[role="dialog"] [contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ],
  composerOpenTriggers: [
    /what.?s on your mind/i,
    /bạn đang nghĩ gì/i,
    /create a post/i,
    /tạo bài viết/i,
  ],
  composerFeedPromptCss:
    '[role="button"]:has-text("What\'s on your mind"), [role="button"]:has-text("Bạn đang nghĩ gì"), [role="button"]:has-text("bạn đang nghĩ gì"), [role="button"]:has-text("đang nghĩ gì")',
  fileInput: 'input[type="file"]',
  photoButtonRoleName: /photo|video|ảnh|hình|image|media/i,
  // VN UI often uses "Đăng bài viết" / "Đăng" — avoid ^$ anchors.
  publishButtonRoleName: /post|publish|đăng|share|chia sẻ|đăng bài|post now/i,
  publishAriaCss:
    '[aria-label="Post"], [aria-label="Đăng"], [aria-label="Publish"], [aria-label*="Đăng" i], [aria-label*="Post" i]',
  publishDialogAriaCss:
    '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"], [role="dialog"] [aria-label*="Đăng" i], [role="dialog"] [aria-label*="Post" i]',
  closeDialogAriaCss: '[aria-label="Close"], [aria-label="Đóng"], [aria-label="Cancel"]',
  permalinkHrefCss:
    'a[href*="story_fbid"], a[href*="/posts/"], a[href*="permalink"], a[href*="story.php"]',
};

export const FACEBOOK_TIMELINE_FLOW: DomFlowConfig = {
  ...DEFAULT_DOM_FLOW,
};

export const FACEBOOK_TIMELINE_RULES: DomPlatformRules = {
  hostPattern: /facebook\.com/i,
  permalinkMarkers:
    /(?:story_fbid=|\/posts\/\d+|permalink\.php|story\.php|\/activity\/\d+)/i,
  postIdPattern: /(?:story_fbid=|\/posts\/|\/activity\/|fbid=)(\d{3,})/i,
  urlPattern: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
  parsePublishSuccess,
  recoverAfterPublishClickTimeout,
};

export const FACEBOOK_TIMELINE_DOM: DomToolkitConfig = {
  selectors: FACEBOOK_TIMELINE_SELECTORS,
  flow: FACEBOOK_TIMELINE_FLOW,
  rules: FACEBOOK_TIMELINE_RULES,
};

export const FACEBOOK_TIMELINE_HOME = 'https://www.facebook.com/';
