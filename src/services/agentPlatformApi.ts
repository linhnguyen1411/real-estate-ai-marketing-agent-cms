import { getAuthToken } from './api';
import type {
  AgentActionAuditLog,
  AgentActionCopyResult,
  AgentActionProposal,
  AgentDashboardCounts,
  AgentDailyReport,
  AgentFinding,
  AgentJob,
  AgentListMeta,
  AgentMission,
  AgentMissionTemplate,
  AgentNotification,
  AgentSource,
  BrowserSession,
  EnqueueMissionResult,
  EnqueueSourceResult,
  ExternalInventoryItem,
  ScannedContentItem,
  AgentSpamRule,
  AutomationRuntimeSnapshot,
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
    const looksHtml = /^\s*</.test(text) || /<!doctype html/i.test(text);
    return {
      status: 'error' as const,
      message: looksHtml
        ? `API trả HTML thay vì JSON (${response.status}). Restart server — endpoint mới có thể chưa được đăng ký.`
        : response.ok
          ? 'Phản hồi không đúng JSON.'
          : `Lỗi ${response.status}`,
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

async function agentRequestWithMeta<T, M>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: M }> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const json = await parseJsonResponse(response) as ApiResponse<T> & { meta?: M };
  if (!response.ok || json.status !== 'success') {
    throw new Error(json.message || `API lỗi ${response.status}`);
  }
  return { data: json.data, meta: json.meta };
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

export type DeleteAgentSourceResult = {
  record: AgentSource;
  meta: {
    deleted: { jobs: number; scannedContents: number; findings: number };
    message: string;
  };
};

export function deleteAgentSource(id: string) {
  return agentRequestWithMeta<AgentSource, DeleteAgentSourceResult['meta']>(
    `/api/agent/sources/${id}`,
    { method: 'DELETE' },
  ).then(res => ({
    record: res.data,
    meta: res.meta ?? {
      deleted: { jobs: 0, scannedContents: 0, findings: 0 },
      message: 'Đã xóa nguồn.',
    },
  }));
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

export function fetchAgentMissionTemplates() {
  return agentRequest<AgentMissionTemplate[]>('/api/agent/missions/templates');
}

export function createAgentMissionFromTemplate(payload: {
  templateId: string;
  sourceIds?: string[];
  name?: string;
  objective?: string;
  status?: string;
}) {
  return agentRequest<AgentMission>('/api/agent/missions/from-template', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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

export function fetchAgentMissionRuns(missionId: string, params: { page?: number; limit?: number } = {}) {
  return agentListRequest<{ id: string; status: string; triggerType: string; createdAt: string; completedAt?: string | null }>(
    `/api/agent/missions/${missionId}/runs${qs(params)}`,
  );
}

export function fetchAgentMissionRunDetail(runId: string) {
  return agentRequest<import('../types/agentPlatform').AgentMissionRunDetail>(
    `/api/agent/mission-runs/${runId}`,
  );
}

export function cancelAgentMissionRun(runId: string) {
  return agentRequest<{ id: string; status: string }>(`/api/agent/mission-runs/${runId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function retryFailedAgentMissionRun(runId: string) {
  return agentRequest<{ retried: number }>(`/api/agent/mission-runs/${runId}/retry-failed`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function pauseAgentMission(id: string) {
  return agentRequest<AgentMission>(`/api/agent/missions/${id}/pause`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function activateAgentMission(id: string) {
  return agentRequest<AgentMission>(`/api/agent/missions/${id}/activate`, {
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

export function deleteAgentJob(id: string) {
  return agentRequest<{ id: string }>(`/api/agent/jobs/${id}`, { method: 'DELETE' });
}

export function cleanupAgentJobs(payload: { sourceId?: string; statuses?: string[] } = {}) {
  return agentRequest<{ deleted: number }>('/api/agent/jobs/cleanup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAgentFindings(params: {
  page?: number;
  limit?: number;
  classification?: string;
  intent?: string;
  actorRole?: string;
  status?: string;
  priority?: string;
  hasPhone?: boolean;
  hasBudget?: boolean;
  location?: string;
  propertyType?: string;
  minScore?: number;
  maxScore?: number;
  sourceId?: string;
  dedupeStatus?: string;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  includeSupplySignals?: boolean;
  includeDismissed?: boolean;
  needsReview?: boolean;
  dismissReason?: string;
  includeManualApproved?: boolean;
  promoted?: boolean;
  externalInventorySaved?: boolean;
  scoreStatus?: string;
  type?: string;
} = {}) {
  return agentListRequest<AgentFinding>(`/api/agent/findings${qs(params)}`);
}

export function promoteAgentFinding(id: string, preferInvestorLeadPath = false) {
  const path = preferInvestorLeadPath
    ? `/api/agent/findings/${id}/promote-investor-lead`
    : `/api/agent/findings/${id}/promote`;
  return agentRequest<{
    outcome: 'created' | 'merged';
    leadId: string;
    leadName: string;
    phone: string;
    duplicateReason: string | null;
    findingId: string;
  }>(path, {
    method: 'POST',
    body: JSON.stringify({}),
  }).catch(async err => {
    // Fallback: try the alternate promote path if the preferred one is missing.
    if (!preferInvestorLeadPath) {
      try {
        return await agentRequest<{
          outcome: 'created' | 'merged';
          leadId: string;
          leadName: string;
          phone: string;
          duplicateReason: string | null;
          findingId: string;
        }>(`/api/agent/findings/${id}/promote-investor-lead`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch {
        throw err;
      }
    }
    throw err;
  });
}

export function saveFindingExternalInventory(id: string, force = false) {
  return (async () => {
    const token = getAuthToken();
    const response = await fetch(`/api/agent/findings/${id}/save-external-inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ force }),
    });
    const json = (await parseJsonResponse(response)) as {
      status: string;
      data: {
        outcome: 'created' | 'existing';
        itemId: string;
        duplicateReason: string | null;
        requiresConfirmation?: boolean;
        warning?: string;
      };
      message?: string;
    };
    if (response.status === 409 || json.status === 'confirm_required') {
      return {
        outcome: 'existing' as const,
        itemId: '',
        duplicateReason: null,
        requiresConfirmation: true,
        warning: json.data?.warning,
      };
    }
    if (!response.ok || json.status !== 'success') {
      throw new Error(json.message || `API lỗi ${response.status}`);
    }
    return json.data;
  })();
}

export function matchAgentFinding(id: string) {
  return agentRequest<{
    official: Array<Record<string, unknown>>;
    external: Array<Record<string, unknown>>;
    missingReason: string | null;
  }>(`/api/agent/findings/${id}/match`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchAgentFindingMatches(id: string) {
  return agentRequest<{
    official: Array<Record<string, unknown>>;
    external: Array<Record<string, unknown>>;
    missingReason: string | null;
  }>(`/api/agent/findings/${id}/matches`);
}

export function markFindingReviewed(id: string) {
  return updateAgentFinding(id, { status: 'reviewed' });
}

export function dismissAgentFinding(
  id: string,
  payload: { dismissReason?: string; dismissNote?: string },
) {
  return updateAgentFinding(id, {
    status: 'dismissed',
    dismissReason: payload.dismissReason,
    dismissNote: payload.dismissNote,
  });
}

export function fetchExternalInventory(params: {
  page?: number;
  limit?: number;
  transactionType?: string;
  propertyType?: string;
  city?: string;
  hasPhone?: boolean;
  verificationStatus?: string;
  status?: string;
  search?: string;
} = {}) {
  return agentListRequest<ExternalInventoryItem>(`/api/agent/external-inventory${qs(params)}`);
}

export function fetchExternalInventoryItem(id: string) {
  return agentRequest<ExternalInventoryItem>(`/api/agent/external-inventory/${id}`);
}

export function patchExternalInventoryItem(
  id: string,
  payload: { status?: string; verificationStatus?: string; note?: string },
) {
  return agentRequest<ExternalInventoryItem>(`/api/agent/external-inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function fetchScannedContents(params: {
  page?: number;
  limit?: number;
  sourceId?: string;
  status?: string;
  search?: string;
} = {}) {
  return agentListRequest<ScannedContentItem>(`/api/agent/scanned-contents${qs(params)}`);
}

export function patchScannedContent(
  id: string,
  payload: { status?: string; action?: string; note?: string },
) {
  return agentRequest<ScannedContentItem & {
    findingId?: string;
    created?: boolean;
    syncEnqueued?: boolean;
  }>(`/api/agent/scanned-contents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function approveScannedContentAsFinding(id: string, note?: string) {
  return agentRequest<{
    contentId: string;
    findingId: string;
    created: boolean;
    syncEnqueued: boolean;
    telegramSent?: boolean;
    telegramReason?: string | null;
    classification?: string;
    actorRole?: string;
    inboxHint?: string;
  }>(`/api/agent/scanned-contents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'approve_finding', note }),
  });
}

export function deleteScannedContent(id: string) {
  return agentRequest<{ id: string; deleted?: boolean }>(
    `/api/agent/scanned-contents/${id}?confirm=true`,
    {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    },
  );
}

export function callExternalInventoryItem(
  id: string,
  payload: {
    verificationStatus?: string;
    status?: string;
    note?: string;
    callbackAt?: string;
  },
) {
  return agentRequest<{
    itemId: string;
    verificationStatus: string;
    callCount: number | null;
  }>(`/api/agent/external-inventory/${id}/call`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function convertExternalInventoryToOfficial(id: string) {
  return agentRequest<{
    itemId: string;
    propertyId: string;
    outcome?: string;
  }>(`/api/agent/external-inventory/${id}/convert-to-official`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function updateAgentFinding(
  id: string,
  payload: {
    status: string;
    promotedLeadId?: string | null;
    dismissReason?: string;
    dismissNote?: string;
  },
) {
  return agentRequest<AgentFinding>(`/api/agent/findings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function bulkActionAgentFindings(payload: {
  action: 'reviewed' | 'dismissed' | 'reanalyze';
  findingIds: string[];
  reason?: string;
  note?: string;
}) {
  return agentRequest<{ updated: number; action: string }>('/api/agent/findings/bulk-action', {
    method: 'POST',
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

export function fetchAgentNotificationUnreadCount() {
  return agentRequest<{ unread: number }>('/api/agent/notifications/unread-count');
}

export function markAgentNotificationRead(id: string) {
  return agentRequest<AgentNotification>(`/api/agent/notifications/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export function markAllAgentNotificationsRead() {
  return agentRequest<{ updated: number }>('/api/agent/notifications/read-all', {
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

export function fetchAutomationRuntime(params: { refresh?: boolean } = {}) {
  const q = params.refresh ? '?refresh=1' : '';
  return agentRequest<AutomationRuntimeSnapshot>(`/api/agent/runtime${q}`);
}

export function fetchOperationsMetrics(params: { refresh?: boolean } = {}) {
  const q = params.refresh ? '?refresh=1' : '';
  return agentRequest<import('../types/agentPlatform').OperationsMetricsSnapshot>(
    `/api/agent/operations${q}`,
  );
}

export function fetchFleetState() {
  return agentRequest<{
    state: unknown;
    browsers: unknown[];
  }>('/api/agent/fleet');
}

export function fetchControlPlaneReport(params: {
  kind?: string;
  date?: string;
} = {}) {
  return agentRequest<Record<string, unknown>>(
    `/api/agent/reports/control-plane${qs({
      kind: params.kind,
      date: params.date,
    })}`,
  );
}

export function fetchAgentDailyReport(params: {
  date?: string;
  includeAiSummary?: boolean;
} = {}) {
  return agentRequest<AgentDailyReport>(
    `/api/agent/reports/daily${qs({
      date: params.date,
      includeAiSummary:
        params.includeAiSummary === undefined
          ? undefined
          : params.includeAiSummary
            ? 'true'
            : 'false',
    })}`,
  );
}

export function createFindingActionProposals(
  findingId: string,
  payload: { actionType?: string; count?: number } = {},
) {
  return agentRequest<AgentActionProposal[]>(`/api/agent/findings/${findingId}/action-proposals`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAgentActionProposals(params: {
  page?: number;
  limit?: number;
  status?: string;
  findingId?: string;
  actionType?: string;
} = {}) {
  return agentListRequest<AgentActionProposal>(`/api/agent/action-proposals${qs(params)}`);
}

export function fetchAgentActionProposal(id: string) {
  return agentRequest<AgentActionProposal>(`/api/agent/action-proposals/${id}`);
}

export function updateAgentActionProposal(
  id: string,
  payload: {
    draftText?: string;
    rationale?: string;
    riskLevel?: string;
    actionType?: string;
  },
) {
  return agentRequest<AgentActionProposal>(`/api/agent/action-proposals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function approveAgentActionProposal(id: string) {
  return agentRequest<AgentActionProposal>(`/api/agent/action-proposals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function rejectAgentActionProposal(id: string, reason?: string) {
  return agentRequest<AgentActionProposal>(`/api/agent/action-proposals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function copyAgentActionProposal(id: string, markApproved = false) {
  return agentRequest<AgentActionCopyResult>(`/api/agent/action-proposals/${id}/copy`, {
    method: 'POST',
    body: JSON.stringify({ markApproved }),
  });
}

export function fetchAgentActionProposalAudits(id: string) {
  return agentRequest<AgentActionAuditLog[]>(`/api/agent/action-proposals/${id}/audits`);
}

// ─── Spam & Block Rules ───────────────────────────────────────────────

export function fetchSpamRules(params: {
  page?: number;
  limit?: number;
  type?: string;
  action?: string;
  sourceId?: string;
  active?: boolean | string;
  expired?: boolean | string;
  search?: string;
}) {
  return agentListRequest<AgentSpamRule>(`/api/agent/spam-rules${qs(params)}`);
}

export function createSpamRule(payload: {
  type: string;
  action: string;
  rawValue: string;
  label?: string;
  reason?: string;
  sourceId?: string | null;
  expiresAt?: string | null;
  priority?: number;
  isActive?: boolean;
}) {
  return agentRequest<AgentSpamRule>('/api/agent/spam-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function patchSpamRule(id: string, payload: Record<string, unknown>) {
  return agentRequest<AgentSpamRule>(`/api/agent/spam-rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteSpamRule(id: string) {
  return agentRequest<AgentSpamRule>(`/api/agent/spam-rules/${id}`, {
    method: 'DELETE',
  });
}

export function normalizeSpamPhone(phone: string) {
  return agentRequest<{ rawValue: string; normalizedValue: string; e164Value: string; valid: boolean }>(
    '/api/agent/spam-rules/normalize-phone',
    { method: 'POST', body: JSON.stringify({ phone }) },
  );
}

export function testSpamPolicy(payload: {
  contentText: string;
  authorName?: string;
  authorUrl?: string;
  sourceId?: string;
  classification?: string;
}) {
  return agentRequest<{
    decision: {
      decision: string;
      primaryReason: string | null;
      hardGate: boolean;
      scorePenalty: number;
      explanations: string[];
    };
    rulesLoaded: number;
  }>('/api/agent/spam-rules/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function blockScannedContent(id: string, payload: {
  type?: string;
  rawValue?: string;
  phone?: string;
  reason?: string;
  label?: string;
  action?: string;
}) {
  return agentRequest<{ rule: AgentSpamRule; contentId: string; status: string }>(
    `/api/agent/scanned-contents/${id}/block`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function blockFinding(id: string, payload: {
  type?: string;
  rawValue?: string;
  phone?: string;
  reason?: string;
  label?: string;
}) {
  return agentRequest<{ rule: AgentSpamRule; findingId: string; dismissed: boolean }>(
    `/api/agent/findings/${id}/block`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
