import type { SocialChannel } from '@prisma/client';
import { getActivePageAccessToken } from '../../../facebook/facebookDb';
import { decryptAccessToken } from '../../../facebook/tokenCrypto';
import {
  createFeedPost,
  createPhotoPost,
  debugToken,
  DEFAULT_PUBLISH_TIMEOUT_MS,
  getFacebookAppCredentials,
  getPageProfile,
  GRAPH_PUBLISH_SCOPES,
  mapGraphApiError,
} from '../graph/facebookGraphClient';
import type { ChannelHealth, PublishContext, PublishResult, SocialPublisher } from '../types';

function channelConfig(channel: SocialChannel): Record<string, unknown> {
  return (channel.config && typeof channel.config === 'object'
    ? channel.config
    : {}) as Record<string, unknown>;
}

async function resolvePageAccessToken(channel: SocialChannel): Promise<string | null> {
  const cfg = channelConfig(channel);
  const encrypted = cfg.pageAccessTokenEncrypted;
  if (typeof encrypted === 'string' && encrypted.trim()) {
    try {
      return decryptAccessToken(encrypted);
    } catch {
      // fall through
    }
  }
  const plain = cfg.pageAccessToken;
  if (typeof plain === 'string' && plain.trim()) return plain.trim();

  const envToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;

  const pageId = channel.externalId || (typeof cfg.pageId === 'string' ? cfg.pageId : undefined);
  return getActivePageAccessToken(pageId);
}

function resolvePageId(channel: SocialChannel): string {
  return (
    channel.externalId ||
    String(channelConfig(channel).pageId || process.env.FACEBOOK_PAGE_ID || '').trim()
  );
}

function isPublicHttpsImage(url: string): boolean {
  return /^https:\/\//i.test(url) && !/\.(mp4|mov|webm)(\?|$)/i.test(url);
}

function isImageMedia(m: { type: string; fileUrl: string }): boolean {
  return (
    m.type === 'image' ||
    /\.(jpe?g|png|webp)(\?|$)/i.test(m.fileUrl) ||
    /^https?:\/\//i.test(m.fileUrl)
  );
}

/** Re-export wrapper for existing tests — returns PublishResult shape. */
export function mapGraphError(data: {
  error?: { message?: string; code?: number; type?: string; error_subcode?: number };
}): PublishResult {
  const mapped = mapGraphApiError(data);
  return {
    ok: false,
    errorCode: mapped.errorCode,
    errorMessage: mapped.errorMessage,
    raw: data as Record<string, unknown>,
  };
}

export type GraphVerifyDetails = ChannelHealth & {
  connectionState?: string;
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  pageName?: string;
};

export const facebookPageGraphPublisher: SocialPublisher = {
  supports(channel) {
    return channel.type === 'facebook_page' && channel.executionMode === 'graph_api';
  },

  async verifyChannel(channel): Promise<GraphVerifyDetails> {
    const checkedAt = new Date().toISOString();
    const token = await resolvePageAccessToken(channel);
    const pageId = resolvePageId(channel);

    if (!token || !pageId) {
      return {
        ok: false,
        status: 'error',
        checkedAt,
        details: 'Missing pageId or page access token',
        errorCode: 'channel_disconnected',
        connectionState: 'disconnected',
        tokenExpiresAt: null,
      };
    }

    let tokenExpiresAt: Date | null = null;
    let scopes: string[] = [];
    const creds = getFacebookAppCredentials();

    if (creds) {
      const debug = await debugToken(token, creds.appId, creds.appSecret);
      if (debug.error && !debug.isValid) {
        return {
          ok: false,
          status: 'needs_login',
          checkedAt,
          details: debug.error,
          errorCode: 'graph_token_expired',
          connectionState: 'expired',
          tokenExpiresAt: debug.expiresAt,
          scopes: debug.scopes,
        };
      }
      tokenExpiresAt = debug.expiresAt;
      scopes = debug.scopes;
      if (!debug.isValid) {
        return {
          ok: false,
          status: 'needs_login',
          checkedAt,
          details: 'Token is not valid',
          errorCode: 'graph_token_expired',
          connectionState: 'expired',
          tokenExpiresAt,
          scopes,
        };
      }
      if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now()) {
        return {
          ok: false,
          status: 'needs_login',
          checkedAt,
          details: 'Page access token expired',
          errorCode: 'graph_token_expired',
          connectionState: 'expired',
          tokenExpiresAt,
          scopes,
        };
      }
    }

    const profile = await getPageProfile(pageId, token);
    if ('error' in profile) {
      const isPerm =
        profile.error.errorCode === 'graph_permission_denied' ||
        profile.error.errorCode === 'graph_token_expired';
      return {
        ok: false,
        status: profile.error.errorCode === 'graph_token_expired' ? 'needs_login' : 'error',
        checkedAt,
        details: profile.error.errorMessage,
        errorCode: profile.error.errorCode,
        connectionState: isPerm
          ? profile.error.errorCode === 'graph_token_expired'
            ? 'expired'
            : 'permission_error'
          : 'disconnected',
        tokenExpiresAt,
        scopes,
      };
    }

    const required = GRAPH_PUBLISH_SCOPES[0]; // pages_manage_posts
    const alt = 'pages_manage_engagement';
    if (scopes.length > 0) {
      const hasPublishScope = scopes.includes(required) || scopes.includes(alt);
      if (!hasPublishScope) {
        return {
          ok: false,
          status: 'error',
          checkedAt,
          details: `Missing publish scope (${required}). Have: ${scopes.join(', ') || 'none'}`,
          errorCode: 'graph_permission_denied',
          connectionState: 'permission_error',
          tokenExpiresAt,
          scopes,
          pageName: profile.name,
        };
      }
    }

    return {
      ok: true,
      status: 'active',
      checkedAt,
      details:
        scopes.length === 0
          ? `${profile.name} (scopes not verified — app credentials missing or empty)`
          : profile.name || profile.id,
      connectionState: 'connected',
      tokenExpiresAt,
      scopes,
      pageName: profile.name,
    };
  },

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const { channel, draft } = ctx;
    const token = await resolvePageAccessToken(channel);
    const pageId = resolvePageId(channel);
    const timeoutMs =
      Number(process.env.SOCIAL_PUBLISH_TIMEOUT_MS) || DEFAULT_PUBLISH_TIMEOUT_MS;

    if (!token || !pageId) {
      return {
        ok: false,
        errorCode: 'channel_disconnected',
        errorMessage: 'Missing pageId or page access token',
      };
    }

    const media = [...(draft.media || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const images = media.filter(isImageMedia);
    const videos = media.filter(
      m => m.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(m.fileUrl),
    );

    if (videos.length > 0) {
      return {
        ok: false,
        errorCode: 'media_invalid',
        errorMessage: 'Video publish is not supported in MVP',
      };
    }

    if (images.length > 1) {
      return {
        ok: false,
        errorCode: 'media_invalid',
        errorMessage: 'MVP supports single image only',
      };
    }

    if (images.length === 1) {
      const photo = images[0];
      if (!isPublicHttpsImage(photo.fileUrl)) {
        return {
          ok: false,
          errorCode: 'media_invalid',
          errorMessage: 'Image must be a public https URL',
        };
      }

      const posted = await createPhotoPost({
        pageId,
        token,
        imageUrl: photo.fileUrl,
        caption: draft.body,
        timeoutMs,
      });
      if (!posted.ok) {
        return {
          ok: false,
          errorCode: posted.errorCode,
          errorMessage: posted.errorMessage,
          latencyMs: posted.latencyMs,
          request: posted.request,
          response: posted.response,
          raw: posted.response,
        };
      }
      const facebookPostId = posted.postId || posted.id;
      const facebookPostUrl = facebookPostId
        ? `https://www.facebook.com/${facebookPostId}`
        : undefined;
      return {
        ok: true,
        externalPostId: facebookPostId,
        externalUrl: facebookPostUrl,
        facebookPostId,
        facebookPostUrl,
        latencyMs: posted.latencyMs,
        request: posted.request,
        response: posted.response,
        raw: posted.response,
      };
    }

    const posted = await createFeedPost({
      pageId,
      token,
      message: draft.body,
      link: draft.linkUrl,
      timeoutMs,
    });
    if (!posted.ok) {
      return {
        ok: false,
        errorCode: posted.errorCode,
        errorMessage: posted.errorMessage,
        latencyMs: posted.latencyMs,
        request: posted.request,
        response: posted.response,
        raw: posted.response,
      };
    }
    const facebookPostId = posted.id;
    const facebookPostUrl = facebookPostId
      ? `https://www.facebook.com/${facebookPostId}`
      : undefined;
    return {
      ok: true,
      externalPostId: facebookPostId,
      externalUrl: facebookPostUrl,
      facebookPostId,
      facebookPostUrl,
      latencyMs: posted.latencyMs,
      request: posted.request,
      response: posted.response,
      raw: posted.response,
    };
  },
};
