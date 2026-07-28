/**
 * Link verification adapter — HTTP check before Telegram send.
 * No browser; no window.location.
 */

import { isEphemeralUrl, isDegradedFacebookUrl, isSolidFacebookPermalink, toMobileFriendlyFacebookUrl } from './normalize';
import type { LinkVerifyResult, NormalizedSocialLinks, VerifiedSocialLinks } from './types';

export type FetchLike = (
  input: string,
  init?: { method?: string; redirect?: RequestRedirect; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; url: string }>;

const DEFAULT_TIMEOUT_MS = 8_000;

function defaultFetch(): FetchLike {
  return async (input, init) => {
    const res = await fetch(input, {
      method: init?.method || 'HEAD',
      redirect: init?.redirect || 'follow',
      signal: init?.signal,
      headers: {
        // Mobile-ish UA helps some CDNs; still no browser automation
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36',
        Accept: 'text/html,*/*',
      },
    });
    return { ok: res.ok, status: res.status, url: res.url };
  };
}

export function isMobileFriendlyUrl(url: string | null | undefined): boolean {
  const s = String(url || '').trim();
  if (!s || isEphemeralUrl(s)) return false;
  if (!/^https:\/\//i.test(s)) return false;
  // Absolute https permalinks open in Telegram in-app browser / FB app deep links
  return Boolean(toMobileFriendlyFacebookUrl(s) || /^https:\/\//i.test(s));
}

/**
 * Verify a single URL is openable. Falls back HEAD → GET on 405/403 method issues.
 */
export async function verifyOpenableUrl(
  url: string,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<LinkVerifyResult> {
  const mobile = toMobileFriendlyFacebookUrl(url) || (isMobileFriendlyUrl(url) ? url : null);
  if (!mobile) {
    return {
      url,
      ok: false,
      status: null,
      finalUrl: null,
      error: 'ephemeral_or_invalid',
      mobileFriendly: false,
    };
  }

  const fetchImpl = options?.fetchImpl || defaultFetch();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    let res = await fetchImpl(mobile, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller?.signal,
    });
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetchImpl(mobile, {
        method: 'GET',
        redirect: 'follow',
        signal: controller?.signal,
      });
    }
    const ok = res.status >= 200 && res.status < 400;
    return {
      url: mobile,
      ok,
      status: res.status,
      finalUrl: res.url || mobile,
      error: ok ? undefined : `http_${res.status}`,
      mobileFriendly: isMobileFriendlyUrl(res.url || mobile),
    };
  } catch (error) {
    return {
      url: mobile,
      ok: false,
      status: null,
      finalUrl: null,
      error: error instanceof Error ? error.message : String(error),
      mobileFriendly: false,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Prefer verified post URL; fallback to group URL.
 * Never rewrite a solid Facebook permalink to a login/checkpoint finalUrl.
 */
export async function verifySocialLinks(
  links: NormalizedSocialLinks,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number; skipVerify?: boolean },
): Promise<VerifiedSocialLinks> {
  const preferOpen = (): string | null => {
    if (links.postUrl && isSolidFacebookPermalink(links.postUrl)) {
      return toMobileFriendlyFacebookUrl(links.postUrl) || links.postUrl;
    }
    if (links.postUrl && !isDegradedFacebookUrl(links.postUrl)) {
      return toMobileFriendlyFacebookUrl(links.postUrl) || links.postUrl;
    }
    if (links.groupUrl && !isDegradedFacebookUrl(links.groupUrl)) {
      return toMobileFriendlyFacebookUrl(links.groupUrl) || links.groupUrl;
    }
    return null;
  };

  if (options?.skipVerify) {
    const openUrl = preferOpen();
    return {
      ...links,
      verified: Boolean(openUrl),
      mobileVerified: isMobileFriendlyUrl(openUrl),
      openUrl,
      verify: openUrl
        ? {
            url: openUrl,
            ok: true,
            status: 200,
            finalUrl: openUrl,
            mobileFriendly: isMobileFriendlyUrl(openUrl),
          }
        : null,
    };
  }

  const candidates = [links.postUrl, links.groupUrl].filter(
    (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i,
  );

  if (candidates.length === 0) {
    return {
      ...links,
      verified: false,
      mobileVerified: false,
      openUrl: null,
      verify: null,
    };
  }

  let last: LinkVerifyResult | null = null;
  for (const candidate of candidates) {
    const normalized = toMobileFriendlyFacebookUrl(candidate) || candidate;
    const result = await verifyOpenableUrl(normalized, options);
    last = result;

    // Solid permalink: keep ORIGINAL even if HTTP follow landed on login wall.
    if (isSolidFacebookPermalink(normalized)) {
      const openUrl = normalized;
      const httpOk = result.ok && !isDegradedFacebookUrl(result.finalUrl);
      return {
        ...links,
        postUrl: links.postUrl,
        groupUrl: links.groupUrl,
        canonicalUrl: openUrl,
        verified: true,
        mobileVerified: isMobileFriendlyUrl(openUrl),
        openUrl,
        verify: {
          ...result,
          ok: true,
          finalUrl: httpOk ? result.finalUrl || openUrl : openUrl,
          error: httpOk ? result.error : result.error || 'login_wall_ignored',
        },
      };
    }

    if (result.ok && !isDegradedFacebookUrl(result.finalUrl)) {
      const openUrl = result.finalUrl || normalized;
      return {
        ...links,
        postUrl: links.postUrl,
        groupUrl: links.groupUrl,
        canonicalUrl: openUrl,
        verified: true,
        mobileVerified: result.mobileFriendly,
        openUrl,
        verify: result,
      };
    }
  }

  // Last resort: solid original post URL without successful HTTP (FB often blocks bots)
  const fallback = preferOpen();
  if (fallback && isSolidFacebookPermalink(fallback)) {
    return {
      ...links,
      verified: true,
      mobileVerified: isMobileFriendlyUrl(fallback),
      openUrl: fallback,
      verify: last
        ? { ...last, ok: true, finalUrl: fallback, error: last.error || 'soft_permalink' }
        : {
            url: fallback,
            ok: true,
            status: null,
            finalUrl: fallback,
            mobileFriendly: true,
            error: 'soft_permalink',
          },
    };
  }

  return {
    ...links,
    verified: false,
    mobileVerified: false,
    openUrl: null,
    verify: last,
  };
}
