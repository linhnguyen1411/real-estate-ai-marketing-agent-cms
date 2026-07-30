/**
 * Link Normalization + Verification public API.
 */

export type {
  NormalizedSocialLinks,
  VerifiedSocialLinks,
  LinkVerifyResult,
  SocialLinkIds,
} from './types';

export {
  normalizeSocialLinks,
  isEphemeralUrl,
  isDegradedFacebookUrl,
  isSolidFacebookPermalink,
  unwrapFacebookRedirect,
  toMobileFriendlyFacebookUrl,
  extractFacebookPostId,
  extractFacebookGroupId,
  buildGroupUrl,
  buildPostPermalink,
  canonicalizeFacebookPostUrl,
  isSolidFacebookPostUrl,
  resolveOpenableFacebookPostUrl,
  parseFacebookContentUrl,
} from './normalize';

export {
  verifyOpenableUrl,
  verifySocialLinks,
  isMobileFriendlyUrl,
  type FetchLike,
} from './verify';
