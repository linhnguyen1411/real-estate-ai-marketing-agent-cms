import { getAuthToken, getSettings, saveSettings } from '../../../services/api';
import type { AppSettings } from '../../../types';
import { cacheInvalidate } from '../../../services/queryCache';

export async function loadSystemSettings(): Promise<AppSettings> {
  cacheInvalidate('settings');
  return getSettings();
}

export async function persistSystemSettings(settings: AppSettings): Promise<AppSettings> {
  const updated = await saveSettings(settings);
  cacheInvalidate('settings');
  cacheInvalidate('dashboard');
  return updated;
}

async function postJson(path: string, body?: unknown) {
  const token = getAuthToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (response.status === 404) {
    const err = new Error('NOT_FOUND') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || `API lỗi ${response.status}`);
  }
  return json as { message?: string; data?: Record<string, unknown> };
}

export function testTelegramConnection() {
  return postJson('/api/settings/telegram/test', {});
}

export function testAgentSyncConnection(payload: {
  agent_sync_vps_url?: string;
  agent_sync_key_id?: string;
  agent_sync_secret?: string;
  agent_sync_timeout_ms?: number;
}) {
  return postJson('/api/settings/agent-sync/test', payload);
}

export function flushAgentSync(limit = 20) {
  return postJson('/api/settings/agent-sync/flush', { limit });
}

export async function fetchAgentSyncStatus() {
  const token = getAuthToken();
  const response = await fetch('/api/settings/agent-sync/status', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((json as { message?: string }).message || `API lỗi ${response.status}`);
  }
  return ((json as { data?: Record<string, unknown> }).data || {}) as Record<string, unknown>;
}
