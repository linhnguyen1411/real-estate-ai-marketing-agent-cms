import { getAuthToken } from './api';
import type {
  ApproveAndScheduleResult,
  ApproveSchedulePayload,
  ConnectSocialChannelPayload,
  ConnectSocialChannelResult,
  CreateSocialChannelPayload,
  CreateSocialDraftPayload,
  PublishNowPayload,
  RetryJobResult,
  ScheduleDraftPayload,
  SocialChannel,
  SocialChannelHealth,
  SocialPostDraft,
  SocialPublishAttempt,
  SocialPublishAuditLog,
  SocialPublishJob,
  SocialSafetySettings,
  UpdateSocialDraftPayload,
} from '../types/socialPublishing';

type ApiStatus = 'success' | 'error';

interface ApiResponse<T> {
  status: ApiStatus;
  data: T;
  message?: string;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return { status: 'error' as const, message: `Server trả về rỗng (${response.status}).` };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'error' as const,
      message: response.ok ? 'Phản hồi không đúng JSON.' : `Lỗi ${response.status}`,
    };
  }
}

async function socialRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = (await parseJsonResponse(response)) as ApiResponse<T>;
  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `API lỗi ${response.status}`);
  }
  return json.data;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    if (typeof value === 'boolean') {
      search.set(key, value ? 'true' : 'false');
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

// ── Channels ──────────────────────────────────────────────

export function fetchSocialChannels(params: {
  type?: string;
  status?: string;
  includeInactive?: boolean;
} = {}) {
  return socialRequest<SocialChannel[]>(
    `/api/social/channels${qs({
      type: params.type,
      status: params.status,
      includeInactive: params.includeInactive ? '1' : undefined,
    })}`,
  );
}

export function createSocialChannel(payload: CreateSocialChannelPayload) {
  return socialRequest<SocialChannel>('/api/social/channels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateSocialChannel(id: string, payload: Partial<CreateSocialChannelPayload>) {
  return socialRequest<SocialChannel>(`/api/social/channels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function testSocialChannel(id: string) {
  return socialRequest<SocialChannelHealth>(`/api/social/channels/${id}/test`, {
    method: 'POST',
  });
}

export function pauseSocialChannel(id: string) {
  return socialRequest<SocialChannel>(`/api/social/channels/${id}/pause`, {
    method: 'POST',
  });
}

export function activateSocialChannel(id: string) {
  return socialRequest<SocialChannel>(`/api/social/channels/${id}/activate`, {
    method: 'POST',
  });
}

export function connectSocialChannel(id: string, payload: ConnectSocialChannelPayload) {
  return socialRequest<ConnectSocialChannelResult>(`/api/social/channels/${id}/connect`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Drafts ────────────────────────────────────────────────

export function fetchSocialDrafts(params: { status?: string } = {}) {
  return socialRequest<SocialPostDraft[]>(`/api/social/drafts${qs(params)}`);
}

export function createSocialDraft(payload: CreateSocialDraftPayload) {
  return socialRequest<SocialPostDraft>('/api/social/drafts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateSocialDraft(id: string, payload: UpdateSocialDraftPayload) {
  return socialRequest<SocialPostDraft>(`/api/social/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function submitSocialDraftReview(id: string) {
  return socialRequest<SocialPostDraft>(`/api/social/drafts/${id}/submit-review`, {
    method: 'POST',
  });
}

export function approveSocialDraft(id: string, payload: ApproveSchedulePayload = {}) {
  return socialRequest<SocialPostDraft | ApproveAndScheduleResult>(
    `/api/social/drafts/${id}/approve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function rejectSocialDraft(id: string, reason?: string) {
  return socialRequest<SocialPostDraft>(`/api/social/drafts/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function scheduleSocialDraft(id: string, payload: ScheduleDraftPayload) {
  return socialRequest<ApproveAndScheduleResult>(`/api/social/drafts/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function publishSocialDraftNow(id: string, payload: PublishNowPayload) {
  return socialRequest<ApproveAndScheduleResult>(`/api/social/drafts/${id}/publish-now`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Jobs ──────────────────────────────────────────────────

export function fetchSocialJobs(params: {
  status?: string;
  channelId?: string;
  draftId?: string;
} = {}) {
  return socialRequest<SocialPublishJob[]>(`/api/social/jobs${qs(params)}`);
}

export function cancelSocialJob(id: string) {
  return socialRequest<SocialPublishJob>(`/api/social/jobs/${id}/cancel`, {
    method: 'POST',
  });
}

export function retrySocialJob(id: string) {
  return socialRequest<RetryJobResult>(`/api/social/jobs/${id}/retry`, {
    method: 'POST',
  });
}

export function fetchJobAttempts(jobId: string) {
  return socialRequest<SocialPublishAttempt[]>(`/api/social/jobs/${jobId}/attempts`);
}

export function fetchSocialAttempts(params: {
  jobId?: string;
  channelId?: string;
  limit?: number;
} = {}) {
  return socialRequest<SocialPublishAttempt[]>(
    `/api/social/attempts${qs({
      jobId: params.jobId,
      channelId: params.channelId,
      limit: params.limit,
    })}`,
  );
}

// ── Audit + settings ──────────────────────────────────────

export function fetchSocialAudit(params: {
  entityType?: string;
  entityId?: string;
} = {}) {
  return socialRequest<SocialPublishAuditLog[]>(`/api/social/audit${qs(params)}`);
}

export function fetchSocialSettings() {
  return socialRequest<SocialSafetySettings>('/api/social/settings');
}
