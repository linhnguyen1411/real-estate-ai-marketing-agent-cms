import { getAuthToken } from './api';
import type {
  AgentDashboardCounts,
  AgentFinding,
  AgentJob,
  AgentListMeta,
  AgentMission,
  AgentNotification,
  AgentSource,
  BrowserSession,
  EnqueueMissionResult,
  EnqueueSourceResult,
} from '../types/agentPlatform';

type ApiStatus = 'success' | 'error';

interface ApiResponse<T> {
  status: ApiStatus;
  data: T;
  message?: string;
  meta?: AgentListMeta & Record<string, unknown>;
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

async function agentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = await parseJsonResponse(response) as ApiResponse<T>;
  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `API lỗi ${response.status}`);
  }
  return json.data;
}

async function agentListRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T[]; meta?: AgentListMeta }> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = await parseJsonResponse(response) as ApiResponse<T[]>;
  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `API lỗi ${response.status}`);
  }
  return { data: json.data, meta: json.meta as AgentListMeta | undefined };
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function fetchAgentDashboard() {
  return agentRequest<AgentDashboardCounts>('/api/agent/dashboard');
}

export function fetchAgentSources(params: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
} = {}) {
  return agentListRequest<AgentSource>(`/api/agent/sources${qs(params)}`);
}

export function createAgentSource(payload: {
  name: string;
  type: string;
  url: string;
  status?: string;
  priority?: number;
  scanIntervalMinutes?: number;
  config?: Record<string, unknown>;
}) {
  return agentRequest<AgentSource>('/api/agent/sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAgentSource(id: string, payload: Record<string, unknown>) {
  return agentRequest<AgentSource>(`/api/agent/sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAgentSource(id: string) {
  return agentRequest<AgentSource>(`/api/agent/sources/${id}`, { method: 'DELETE' });
}

export function runAgentSource(sourceId: string, missionId?: string) {
  return agentRequest<EnqueueSourceResult>(`/api/agent/sources/${sourceId}/run`, {
    method: 'POST',
    body: JSON.stringify(missionId ? { missionId } : {}),
  });
}

export async function enqueueSourceScan(source: AgentSource) {
  return runAgentSource(source.id);
}

export function fetchAgentMissions(params: { page?: number; limit?: number; status?: string } = {}) {
  return agentListRequest<AgentMission>(`/api/agent/missions${qs(params)}`);
}

export function createAgentMission(payload: {
  name: string;
  objective: string;
  status?: string;
  rules?: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
}) {
  return agentRequest<AgentMission>('/api/agent/missions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAgentMission(id: string, payload: Record<string, unknown>) {
  return agentRequest<AgentMission>(`/api/agent/missions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function runAgentMission(id: string) {
  return agentRequest<EnqueueMissionResult>(`/api/agent/missions/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchAgentJobs(params: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  sourceId?: string;
  missionId?: string;
} = {}) {
  return agentListRequest<AgentJob>(`/api/agent/jobs${qs(params)}`);
}

export function fetchAgentFindings(params: {
  page?: number;
  limit?: number;
  minScore?: number;
  status?: string;
  type?: string;
  sourceId?: string;
} = {}) {
  return agentListRequest<AgentFinding>(`/api/agent/findings${qs(params)}`);
}

export function updateAgentFinding(
  id: string,
  payload: { status: string; promotedLeadId?: string | null },
) {
  return agentRequest<AgentFinding>(`/api/agent/findings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function fetchAgentNotifications(params: {
  page?: number;
  limit?: number;
  status?: string;
} = {}) {
  return agentListRequest<AgentNotification>(`/api/agent/notifications${qs(params)}`);
}

export function markAgentNotificationRead(id: string) {
  return agentRequest<AgentNotification>(`/api/agent/notifications/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export function fetchAgentSessions(params: {
  page?: number;
  limit?: number;
  status?: string;
} = {}) {
  return agentListRequest<BrowserSession>(`/api/agent/sessions${qs(params)}`);
}
