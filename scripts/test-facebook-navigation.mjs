#!/usr/bin/env node
/**
 * Facebook navigation + classifier + scroll-outcome unit tests (no live Facebook).
 * Run: npm run test:facebook-navigation
 */
import {
  classifyFacebookArticle,
  emptyArticleSignals,
} from '../server/agent-worker/facebook/facebookArticleClassifier.ts';
import {
  decideFacebookNavigationState,
  isAuthBlockedState,
  FACEBOOK_NAV_ERROR_CODES,
  FACEBOOK_NAV_STOP_REASONS,
} from '../server/agent-worker/facebook/facebookNavigationState.ts';
import { classifyScrollOutcome } from '../server/agent-worker/facebook/facebookScrollController.ts';

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error('   ', detail || 'assertion failed');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else fail(label, detail);
}

console.log('\n=== Facebook Navigation / Classifier / Scroll — unit tests ===\n');

console.log('Article classifier');
{
  const post = {
    ...emptyArticleSignals(),
    hasPostPermalink: true,
    hasTimestampLink: true,
    hasPostActionBar: true,
    hasLikeAction: true,
    hasShareAction: true,
    hasCommentAction: true,
    textLength: 200,
  };
  assert(classifyFacebookArticle(post) === 'post', 'feed post classified as post');

  const comment = {
    ...emptyArticleSignals(),
    hasReplyAction: true,
    hasAuthorLink: true,
    textLength: 40,
  };
  assert(classifyFacebookArticle(comment) === 'comment', 'reply affordance classified as comment');

  const nestedReply = {
    ...emptyArticleSignals(),
    articleDepth: 2,
    insideCommentsRegion: true,
    textLength: 20,
  };
  assert(classifyFacebookArticle(nestedReply) === 'comment', 'nested reply classified as comment');

  const dialogArticle = {
    ...emptyArticleSignals(),
    insideDialog: true,
    hasPostPermalink: true,
    hasPostActionBar: true,
    hasLikeAction: true,
    hasShareAction: true,
    textLength: 200,
  };
  assert(
    classifyFacebookArticle(dialogArticle) === 'unknown',
    'in-dialog article is not a feed post (unknown)',
  );

  const postWithInlineReply = {
    ...emptyArticleSignals(),
    hasPostPermalink: true,
    hasTimestampLink: true,
    hasShareAction: true,
    hasLikeAction: true,
    hasCommentAction: true,
    hasReplyAction: true, // inline first-comment reply rendered inside the post
    textLength: 150,
  };
  assert(
    classifyFacebookArticle(postWithInlineReply) === 'post',
    'post with inline reply + share still classified as post',
  );

  const weak = { ...emptyArticleSignals(), textLength: 10 };
  assert(classifyFacebookArticle(weak) === 'unknown', 'insufficient signals => unknown');

  const noActionBar = {
    ...emptyArticleSignals(),
    hasPostPermalink: true,
    textLength: 100,
  };
  assert(
    classifyFacebookArticle(noActionBar) === 'unknown',
    'permalink without action bar => unknown (not inserted)',
  );

  const feedCommentCard = {
    ...emptyArticleSignals(),
    isFeedCommentArticle: true,
    hasPostPermalink: true,
    hasShareAction: true,
    hasLikeAction: true,
    hasCommentAction: true,
    textLength: 80,
  };
  assert(
    classifyFacebookArticle(feedCommentCard) === 'comment',
    'top-level comment card with share still classified as comment',
  );
}

console.log('\nNavigation state decision');
{
  assert(
    decideFacebookNavigationState({
      authKind: 'login',
      hasPostDialog: false,
      hasFeed: true,
      isGroupUrl: true,
      isPostDetailUrl: false,
    }) === 'login_required',
    'login auth => login_required',
  );
  assert(
    decideFacebookNavigationState({
      authKind: 'checkpoint',
      hasPostDialog: false,
      hasFeed: false,
      isGroupUrl: false,
      isPostDetailUrl: false,
    }) === 'checkpoint',
    'checkpoint auth => checkpoint',
  );
  assert(
    decideFacebookNavigationState({
      authKind: 'challenge',
      hasPostDialog: false,
      hasFeed: false,
      isGroupUrl: false,
      isPostDetailUrl: false,
    }) === 'challenge',
    'challenge auth => challenge',
  );
  assert(
    decideFacebookNavigationState({
      authKind: null,
      hasPostDialog: true,
      hasFeed: true,
      isGroupUrl: true,
      isPostDetailUrl: false,
    }) === 'post_detail_modal',
    'visible post dialog => post_detail_modal (even over feed)',
  );
  assert(
    decideFacebookNavigationState({
      authKind: null,
      hasPostDialog: false,
      hasFeed: true,
      isGroupUrl: true,
      isPostDetailUrl: false,
    }) === 'group_feed',
    'feed + group url => group_feed',
  );
  assert(
    decideFacebookNavigationState({
      authKind: null,
      hasPostDialog: false,
      hasFeed: false,
      isGroupUrl: false,
      isPostDetailUrl: true,
    }) === 'post_detail_page',
    'no feed + post url => post_detail_page',
  );
  assert(
    decideFacebookNavigationState({
      authKind: null,
      hasPostDialog: false,
      hasFeed: false,
      isGroupUrl: false,
      isPostDetailUrl: false,
    }) === 'unknown',
    'nothing recognizable => unknown',
  );

  assert(isAuthBlockedState('login_required'), 'login_required is auth-blocked');
  assert(isAuthBlockedState('checkpoint'), 'checkpoint is auth-blocked');
  assert(!isAuthBlockedState('group_feed'), 'group_feed is not auth-blocked');
}

console.log('\nScroll outcome classifier');
{
  assert(
    classifyScrollOutcome({
      feedScrollTopBefore: 0,
      feedScrollTopAfter: 1200,
      feedScrollHeightBefore: 5000,
      feedScrollHeightAfter: 5000,
      documentScrollTopBefore: 0,
      documentScrollTopAfter: 0,
      commentScrollTopBefore: 0,
      commentScrollTopAfter: 0,
      fingerprintChanged: false,
    }) === 'success',
    'feed scrollTop increase => success',
  );
  assert(
    classifyScrollOutcome({
      feedScrollTopBefore: 0,
      feedScrollTopAfter: 0,
      feedScrollHeightBefore: 5000,
      feedScrollHeightAfter: 8000,
      documentScrollTopBefore: 0,
      documentScrollTopAfter: 0,
      commentScrollTopBefore: 0,
      commentScrollTopAfter: 0,
      fingerprintChanged: false,
    }) === 'success',
    'feed height increase => success',
  );
  assert(
    classifyScrollOutcome({
      feedScrollTopBefore: 0,
      feedScrollTopAfter: 0,
      feedScrollHeightBefore: 5000,
      feedScrollHeightAfter: 5000,
      documentScrollTopBefore: 0,
      documentScrollTopAfter: 0,
      commentScrollTopBefore: 0,
      commentScrollTopAfter: 0,
      fingerprintChanged: true,
    }) === 'success',
    'accepted-post fingerprint change => success',
  );
  assert(
    classifyScrollOutcome({
      feedScrollTopBefore: 0,
      feedScrollTopAfter: 0,
      feedScrollHeightBefore: 5000,
      feedScrollHeightAfter: 5000,
      documentScrollTopBefore: 0,
      documentScrollTopAfter: 0,
      commentScrollTopBefore: 0,
      commentScrollTopAfter: 900,
      fingerprintChanged: false,
    }) === 'wrong_target',
    'only comment scroll advanced => wrong_target',
  );
  assert(
    classifyScrollOutcome({
      feedScrollTopBefore: 0,
      feedScrollTopAfter: 0,
      feedScrollHeightBefore: 5000,
      feedScrollHeightAfter: 5000,
      documentScrollTopBefore: 0,
      documentScrollTopAfter: 0,
      commentScrollTopBefore: 0,
      commentScrollTopAfter: 0,
      fingerprintChanged: false,
    }) === 'no_change',
    'nothing moved => no_change',
  );
}

console.log('\nError codes + stop reasons registered');
{
  assert(FACEBOOK_NAV_ERROR_CODES.MODAL_STUCK === 'FACEBOOK_MODAL_STUCK', 'FACEBOOK_MODAL_STUCK');
  assert(
    FACEBOOK_NAV_ERROR_CODES.WRONG_SCROLL_TARGET === 'FACEBOOK_WRONG_SCROLL_TARGET',
    'FACEBOOK_WRONG_SCROLL_TARGET',
  );
  assert(
    FACEBOOK_NAV_ERROR_CODES.FEED_NOT_RECOVERED === 'FACEBOOK_FEED_NOT_RECOVERED',
    'FACEBOOK_FEED_NOT_RECOVERED',
  );
  assert(
    FACEBOOK_NAV_ERROR_CODES.NAVIGATION_STATE_UNKNOWN === 'FACEBOOK_NAVIGATION_STATE_UNKNOWN',
    'FACEBOOK_NAVIGATION_STATE_UNKNOWN',
  );
  assert(FACEBOOK_NAV_STOP_REASONS.MODAL_STUCK === 'modal_stuck', 'modal_stuck reason');
  assert(
    FACEBOOK_NAV_STOP_REASONS.WRONG_SCROLL_TARGET === 'wrong_scroll_target',
    'wrong_scroll_target reason',
  );
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
