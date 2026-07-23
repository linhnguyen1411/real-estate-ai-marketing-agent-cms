/**
 * Canonical social link metadata — used by Telegram Smart Ops + Publish Evidence.
 * No browser / runtime dependency.
 */

export type SocialLinkIds = {
  postId: string | null;
  groupId: string | null;
};

export type NormalizedSocialLinks = SocialLinkIds & {
  /** Raw inputs after trim (may be ephemeral) */
  rawPostUrl: string | null;
  rawGroupUrl: string | null;
  /** Stable permalink for the post (preferred) */
  postUrl: string | null;
  /** Stable group permalink */
  groupUrl: string | null;
  /** Best single URL to open (post → group fallback) */
  canonicalUrl: string | null;
  /** Rejected as temporary / non-permalink */
  rejected: string[];
};

export type LinkVerifyResult = {
  url: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  error?: string;
  /** Suitable for Android / iOS / Telegram in-app / Facebook app deep-link */
  mobileFriendly: boolean;
};

export type VerifiedSocialLinks = NormalizedSocialLinks & {
  verified: boolean;
  mobileVerified: boolean;
  openUrl: string | null;
  verify: LinkVerifyResult | null;
};
