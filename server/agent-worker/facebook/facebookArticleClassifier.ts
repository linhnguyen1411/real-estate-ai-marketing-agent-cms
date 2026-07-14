/**
 * Facebook article classifier.
 *
 * Facebook renders BOTH top-level posts and comments as `[role="article"]`.
 * Signals are collected in the browser context (see facebookDomParser) and the
 * pure `classifyFacebookArticle` decides post vs. comment vs. unknown here so the
 * rules can be unit-tested without a live DOM.
 *
 * Only `post` may be inserted into ScannedContent. `comment` and `unknown` only
 * increment metrics.
 */

export type FacebookArticleKind = 'post' | 'comment' | 'unknown';

export interface FacebookArticleSignals {
  /** Number of ancestor `[role="article"]` nodes (0 = top-level feed article) */
  articleDepth: number;
  /** Inside a `[role="dialog"]` (post-detail modal / lightbox) */
  insideDialog: boolean;
  /** Inside a comments region (aria comments, ul comment list, etc.) */
  insideCommentsRegion: boolean;
  hasPostPermalink: boolean;
  hasStoryFbid: boolean;
  hasAuthorLink: boolean;
  hasTimestampLink: boolean;
  /** A top-level post action bar (like + comment + share cluster) is present */
  hasPostActionBar: boolean;
  hasLikeAction: boolean;
  hasCommentAction: boolean;
  hasShareAction: boolean;
  /** A "Reply / Trả lời" affordance — strong comment signal */
  hasReplyAction: boolean;
  /** A comment composer/box scoped to this node */
  hasCommentComposer: boolean;
  /**
   * Top-level feed `[role="article"]` that is actually a comment card
   * (Facebook aria: "Bình luận dưới tên …" / "Comment by …").
   */
  isFeedCommentArticle: boolean;
  textLength: number;
}

export function emptyArticleSignals(): FacebookArticleSignals {
  return {
    articleDepth: 0,
    insideDialog: false,
    insideCommentsRegion: false,
    hasPostPermalink: false,
    hasStoryFbid: false,
    hasAuthorLink: false,
    hasTimestampLink: false,
    hasPostActionBar: false,
    hasLikeAction: false,
    hasCommentAction: false,
    hasShareAction: false,
    hasReplyAction: false,
    hasCommentComposer: false,
    isFeedCommentArticle: false,
    textLength: 0,
  };
}

/**
 * Classification rules (precedence matters):
 *
 * 1. comment — a reply affordance, a comments-region ancestor, or a nested
 *    article (depth > 0) means we are looking at a comment/reply.
 * 2. unknown — anything still inside a dialog is not a feed post (the reader
 *    never scans post-detail modals; they are closed and recovered instead).
 * 3. post — top-level feed article with a trustworthy identity (permalink /
 *    story_fbid / timestamp link) AND a real post action bar.
 * 4. unknown — insufficient signals.
 */
export function classifyFacebookArticle(
  signals: FacebookArticleSignals,
): FacebookArticleKind {
  // The reader never scans post-detail modals.
  if (signals.insideDialog) {
    return 'unknown';
  }

  // Facebook renders some comments as their own top-level feed articles.
  if (signals.isFeedCommentArticle) {
    return 'comment';
  }

  const hasIdentity =
    signals.hasPostPermalink || signals.hasStoryFbid || signals.hasTimestampLink;

  // Strong post marker: only top-level posts can be shared (comments cannot).
  // On the live feed the first comment is often rendered INSIDE the post article
  // without its own [role="article"], so a bare "Reply" affordance is NOT enough
  // to demote a genuine post — the Share action + a post identity wins.
  const strongPost = signals.hasShareAction && hasIdentity;

  if (
    !strongPost &&
    (signals.insideCommentsRegion || signals.articleDepth > 0 || signals.hasReplyAction)
  ) {
    return 'comment';
  }

  const hasActionBar =
    signals.hasPostActionBar || signals.hasShareAction || signals.hasLikeAction;

  if (hasIdentity && hasActionBar) {
    return 'post';
  }

  // Nested / comments-region node without post identity is a comment.
  if (signals.insideCommentsRegion || signals.articleDepth > 0 || signals.hasReplyAction) {
    return 'comment';
  }

  return 'unknown';
}
