import { getFacebookConfig, getGraphBaseUrl } from '../../../facebook/config';

export const GRAPH_PUBLISH_SCOPES = ['pages_manage_posts', 'pages_read_engagement'] as const;
export const DEFAULT_PUBLISH_TIMEOUT_MS = 90_000;

const TOKEN_KEYS = new Set(['access_token', 'accessToken', 'pageAccessToken', 'fb_exchange_token']);

export type GraphFetchResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
  latencyMs: number;
};

export async function graphFetch(
  url: string,
  options?: {
    method?: string;
    body?: BodyInit | null;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<GraphFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options?.method || 'GET',
      body: options?.body,
      headers: options?.headers,
      signal: controller.signal,
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    return {
      ok: response.ok && !json.error,
      status: response.status,
      json,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const aborted =
      error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
    return {
      ok: false,
      status: 0,
      json: {
        error: {
          message: aborted
            ? `Graph request timed out after ${timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : 'Network error',
          code: aborted ? 'publish_timeout' : 'network_error',
        },
      },
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeGraphPayload(obj: unknown): Record<string, unknown> {
  if (obj == null || typeof obj !== 'object') {
    return { value: obj as unknown };
  }
  if (Array.isArray(obj)) {
    return { items: obj.map(item => sanitizeGraphPayload(item)) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (TOKEN_KEYS.has(key) || /access[_-]?token/i.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = sanitizeGraphPayload(value);
    } else if (typeof value === 'string' && value.length > 40 && /EAA[A-Za-z0-9]+/.test(value)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function mapGraphApiError(data: {
  error?: { message?: string; code?: number | string; type?: string; error_subcode?: number };
}): { errorCode: string; errorMessage: string } {
  const err = data.error || {};
  const code = typeof err.code === 'string' ? Number(err.code) : err.code;
  if (code === 190 || err.code === 'publish_timeout') {
    if (err.code === 'publish_timeout') {
      return {
        errorCode: 'publish_timeout',
        errorMessage: err.message || 'Graph request timed out',
      };
    }
    return {
      errorCode: 'graph_token_expired',
      errorMessage: err.message || 'Page access token expired',
    };
  }
  if (code === 10 || code === 200) {
    return {
      errorCode: 'graph_permission_denied',
      errorMessage: err.message || 'Graph permission denied',
    };
  }
  return {
    errorCode: 'graph_api_error',
    errorMessage: err.message || 'Graph API error',
  };
}

export async function debugToken(
  inputToken: string,
  appId: string,
  appSecret: string,
): Promise<{
  isValid: boolean;
  expiresAt: Date | null;
  scopes: string[];
  error?: string;
}> {
  const appToken = `${appId}|${appSecret}`;
  const url =
    `${getGraphBaseUrl()}/debug_token` +
    `?input_token=${encodeURIComponent(inputToken)}` +
    `&access_token=${encodeURIComponent(appToken)}`;
  const result = await graphFetch(url, { timeoutMs: 30_000 });
  if (!result.ok || result.json.error) {
    const mapped = mapGraphApiError(result.json as { error?: { message?: string; code?: number } });
    return { isValid: false, expiresAt: null, scopes: [], error: mapped.errorMessage };
  }
  const data = (result.json.data || {}) as {
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: Array<{ scope?: string }>;
  };
  const scopes = Array.isArray(data.scopes)
    ? data.scopes
    : (data.granular_scopes || [])
        .map(s => s.scope)
        .filter((s): s is string => Boolean(s));
  const expiresAt =
    typeof data.expires_at === 'number' && data.expires_at > 0
      ? new Date(data.expires_at * 1000)
      : null;
  return {
    isValid: Boolean(data.is_valid),
    expiresAt,
    scopes,
  };
}

export async function getPageProfile(
  pageId: string,
  token: string,
): Promise<{ id: string; name: string } | { error: { errorCode: string; errorMessage: string }; raw: Record<string, unknown> }> {
  const url =
    `${getGraphBaseUrl()}/${encodeURIComponent(pageId)}` +
    `?fields=id,name&access_token=${encodeURIComponent(token)}`;
  const result = await graphFetch(url, { timeoutMs: 30_000 });
  if (!result.ok || result.json.error) {
    return {
      error: mapGraphApiError(result.json as { error?: { message?: string; code?: number } }),
      raw: sanitizeGraphPayload(result.json),
    };
  }
  const id = String(result.json.id || '');
  const name = String(result.json.name || id);
  if (!id) {
    return {
      error: { errorCode: 'graph_api_error', errorMessage: 'Page profile missing id' },
      raw: sanitizeGraphPayload(result.json),
    };
  }
  return { id, name };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<{ accessToken: string; expiresIn?: number } | { error: string }> {
  const url =
    `${getGraphBaseUrl()}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
  const result = await graphFetch(url, { timeoutMs: 30_000 });
  if (!result.ok || result.json.error) {
    const mapped = mapGraphApiError(result.json as { error?: { message?: string; code?: number } });
    return { error: mapped.errorMessage };
  }
  const accessToken = String(result.json.access_token || '');
  if (!accessToken) return { error: 'Exchange returned no access_token' };
  return {
    accessToken,
    expiresIn:
      typeof result.json.expires_in === 'number' ? (result.json.expires_in as number) : undefined,
  };
}

export async function createFeedPost(input: {
  pageId: string;
  token: string;
  message: string;
  link?: string | null;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  id?: string;
  latencyMs: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}> {
  const params = new URLSearchParams({
    message: input.message,
    access_token: input.token,
  });
  if (input.link) params.set('link', input.link);

  const request = sanitizeGraphPayload({
    endpoint: `/${input.pageId}/feed`,
    method: 'POST',
    message: input.message,
    link: input.link || null,
    access_token: input.token,
  });

  const result = await graphFetch(
    `${getGraphBaseUrl()}/${encodeURIComponent(input.pageId)}/feed`,
    {
      method: 'POST',
      body: params,
      timeoutMs: input.timeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS,
    },
  );
  const response = sanitizeGraphPayload(result.json);
  if (!result.ok || result.json.error) {
    const mapped = mapGraphApiError(result.json as { error?: { message?: string; code?: number } });
    return {
      ok: false,
      latencyMs: result.latencyMs,
      request,
      response,
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    };
  }
  return {
    ok: true,
    id: result.json.id ? String(result.json.id) : undefined,
    latencyMs: result.latencyMs,
    request,
    response,
  };
}

export async function createPhotoPost(input: {
  pageId: string;
  token: string;
  imageUrl: string;
  caption?: string | null;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  id?: string;
  postId?: string;
  latencyMs: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}> {
  const params = new URLSearchParams({
    url: input.imageUrl,
    access_token: input.token,
    published: 'true',
  });
  if (input.caption) params.set('caption', input.caption);

  const request = sanitizeGraphPayload({
    endpoint: `/${input.pageId}/photos`,
    method: 'POST',
    url: input.imageUrl,
    caption: input.caption || null,
    published: true,
    access_token: input.token,
  });

  const result = await graphFetch(
    `${getGraphBaseUrl()}/${encodeURIComponent(input.pageId)}/photos`,
    {
      method: 'POST',
      body: params,
      timeoutMs: input.timeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS,
    },
  );
  const response = sanitizeGraphPayload(result.json);
  if (!result.ok || result.json.error) {
    const mapped = mapGraphApiError(result.json as { error?: { message?: string; code?: number } });
    return {
      ok: false,
      latencyMs: result.latencyMs,
      request,
      response,
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    };
  }
  return {
    ok: true,
    id: result.json.id ? String(result.json.id) : undefined,
    postId: result.json.post_id ? String(result.json.post_id) : undefined,
    latencyMs: result.latencyMs,
    request,
    response,
  };
}

export function getFacebookAppCredentials(): { appId: string; appSecret: string } | null {
  const cfg = getFacebookConfig();
  if (!cfg.appId || !cfg.appSecret) return null;
  return { appId: cfg.appId, appSecret: cfg.appSecret };
}
