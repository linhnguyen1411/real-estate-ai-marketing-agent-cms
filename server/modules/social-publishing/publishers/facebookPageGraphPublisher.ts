import type { SocialChannel } from '@prisma/client';
import { getGraphBaseUrl } from '../../../facebook/config';
import { getActivePageAccessToken } from '../../../facebook/facebookDb';
import { decryptAccessToken } from '../../../facebook/tokenCrypto';
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

export function mapGraphError(data: {
  error?: { message?: string; code?: number; type?: string; error_subcode?: number };
}): PublishResult {
  const err = data.error || {};
  const code = err.code;
  if (code === 190) {
    return {
      ok: false,
      errorCode: 'graph_token_expired',
      errorMessage: err.message || 'Page access token expired',
      raw: data as Record<string, unknown>,
    };
  }
  return {
    ok: false,
    errorCode: 'graph_api_error',
    errorMessage: err.message || 'Graph API error',
    raw: data as Record<string, unknown>,
  };
}

export const facebookPageGraphPublisher: SocialPublisher = {
  supports(channel) {
    return channel.type === 'facebook_page' && channel.executionMode === 'graph_api';
  },

  async verifyChannel(channel): Promise<ChannelHealth> {
    const checkedAt = new Date().toISOString();
    const token = await resolvePageAccessToken(channel);
    const pageId =
      channel.externalId ||
      String(channelConfig(channel).pageId || process.env.FACEBOOK_PAGE_ID || '').trim();

    if (!token || !pageId) {
      return {
        ok: false,
        status: 'error',
        checkedAt,
        details: 'Missing pageId or page access token',
        errorCode: 'graph_token_expired',
      };
    }

    const url = `${getGraphBaseUrl()}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
    try {
      const response = await fetch(url);
      const data = (await response.json()) as {
        id?: string;
        name?: string;
        error?: { message?: string; code?: number };
      };
      if (!response.ok || data.error) {
        const mapped = mapGraphError(data);
        return {
          ok: false,
          status: mapped.errorCode === 'graph_token_expired' ? 'needs_login' : 'error',
          checkedAt,
          details: mapped.errorMessage,
          errorCode: mapped.errorCode,
        };
      }
      return {
        ok: true,
        status: 'active',
        checkedAt,
        details: data.name || data.id,
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        checkedAt,
        details: error instanceof Error ? error.message : 'Network error',
        errorCode: 'graph_api_error',
      };
    }
  },

  async publish(ctx: PublishContext): Promise<PublishResult> {
    const { channel, draft } = ctx;
    const token = await resolvePageAccessToken(channel);
    const pageId =
      channel.externalId ||
      String(channelConfig(channel).pageId || process.env.FACEBOOK_PAGE_ID || '').trim();

    if (!token || !pageId) {
      return {
        ok: false,
        errorCode: 'graph_token_expired',
        errorMessage: 'Missing pageId or page access token',
      };
    }

    const media = draft.media || [];
    const photo = media.find(
      m =>
        m.type === 'image' ||
        /\.(jpe?g|png|webp)(\?|$)/i.test(m.fileUrl) ||
        /^https?:\/\//i.test(m.fileUrl),
    );

    // Prefer photo publish when public http(s) image URL available
    if (photo && /^https?:\/\//i.test(photo.fileUrl) && !/\.(mp4|mov|webm)(\?|$)/i.test(photo.fileUrl)) {
      const params = new URLSearchParams({
        url: photo.fileUrl,
        caption: draft.body,
        access_token: token,
        published: 'true',
      });
      if (draft.linkUrl) params.set('link', draft.linkUrl);

      const response = await fetch(
        `${getGraphBaseUrl()}/${encodeURIComponent(pageId)}/photos`,
        { method: 'POST', body: params },
      );
      const data = (await response.json()) as {
        id?: string;
        post_id?: string;
        error?: { message?: string; code?: number };
      };
      if (!response.ok || data.error) return mapGraphError(data);
      const externalPostId = data.post_id || data.id;
      return {
        ok: true,
        externalPostId,
        externalUrl: externalPostId
          ? `https://www.facebook.com/${externalPostId}`
          : undefined,
        raw: data as Record<string, unknown>,
      };
    }

    const params = new URLSearchParams({
      message: draft.body,
      access_token: token,
    });
    if (draft.linkUrl) params.set('link', draft.linkUrl);

    const response = await fetch(
      `${getGraphBaseUrl()}/${encodeURIComponent(pageId)}/feed`,
      { method: 'POST', body: params },
    );
    const data = (await response.json()) as {
      id?: string;
      error?: { message?: string; code?: number };
    };
    if (!response.ok || data.error) return mapGraphError(data);
    return {
      ok: true,
      externalPostId: data.id,
      externalUrl: data.id ? `https://www.facebook.com/${data.id}` : undefined,
      raw: data as Record<string, unknown>,
    };
  },
};
