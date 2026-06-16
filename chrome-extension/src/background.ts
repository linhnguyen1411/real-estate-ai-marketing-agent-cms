import type { AutoScrollState, DebugState, Settings } from './types';
import { saveLeadsBatch } from './lib/leadApiClient';

type BgResponse =
  | { ok: true; storageAvailable?: boolean; context?: string; data?: unknown }
  | { ok: false; error: string };

const AUTO_SCROLL_KEY = 'autoScrollState';
const PENDING_SAVE_KEY = 'pendingLeadSave';
const LAST_SAVE_KEY = 'lastLeadSaveResult';

async function apiFetch(path: string, body: unknown): Promise<BgResponse> {
  const { token, apiBase } = (await chrome.storage.local.get(['token', 'apiBase'])) as Settings;
  if (!token || !apiBase) {
    return { ok: false, error: 'Chưa đăng nhập — mở popup và login CRM.' };
  }

  const url = `${apiBase.replace(/\/$/, '')}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Server lỗi (${res.status}): ${text.slice(0, 120)}` };
    }
    if (!res.ok || json.status !== 'success') {
      return { ok: false, error: json.message || `API ${path} failed (${res.status})` };
    }
    return { ok: true, data: json.data };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (/JSON|Unexpected token/i.test(msg)) {
      return { ok: false, error: 'Server trả response không hợp lệ — kiểm tra API URL và restart server.' };
    }
    return { ok: false, error: msg };
  }
}

async function handleMessage(message: { type: string; payload?: unknown }): Promise<BgResponse> {
  switch (message.type) {
    case 'STORAGE_PING': {
      await chrome.storage.session.get('__ping');
      return { ok: true, storageAvailable: true, context: 'background' };
    }

    case 'GET_SETTINGS': {
      const data = (await chrome.storage.local.get(['token', 'apiBase', 'email'])) as Settings;
      return { ok: true, data };
    }

    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set(message.payload as Settings);
      return { ok: true };
    }

    case 'API_EXTRACT_BATCH': {
      const { items } = (message.payload || {}) as { items: unknown[] };
      const data = await apiFetch('/api/leads/extract-batch', { items });
      if (!data.ok) return data;
      const batch = data.data as { items?: unknown[] };
      return { ok: true, data: batch?.items ?? [] };
    }

    case 'API_BATCH_SAVE': {
      const { leads, source, slim } = (message.payload || {}) as { leads: unknown[]; source?: string; slim?: boolean };
      const data = await apiFetch('/api/leads/batch-save', {
        leads,
        source: source || 'facebook-feed-auto',
        slim: slim !== false
      });
      if (!data.ok) return data;
      const batch = data.data as { saved_count?: number; duplicate_count?: number };
      return {
        ok: true,
        data: {
          saved_count: batch?.saved_count ?? 0,
          duplicate_count: batch?.duplicate_count ?? 0
        }
      };
    }

    case 'RUN_LEAD_SAVE': {
      const { token, apiBase } = (await chrome.storage.local.get(['token', 'apiBase'])) as Settings;
      if (!token || !apiBase) {
        return { ok: false, error: 'Chưa đăng nhập — mở popup và login CRM.' };
      }

      const stored = await chrome.storage.session.get(PENDING_SAVE_KEY);
      const pending = stored[PENDING_SAVE_KEY] as { leads: Array<Record<string, unknown>>; source?: string } | undefined;
      if (!pending?.leads?.length) {
        return { ok: false, error: 'Không có lead trong hàng đợi lưu.' };
      }

      await chrome.storage.session.remove(PENDING_SAVE_KEY);

      try {
        const result = await saveLeadsBatch(
          apiBase,
          token,
          pending.leads,
          pending.source || 'facebook-feed-auto'
        );
        await chrome.storage.local.set({
          [LAST_SAVE_KEY]: { ok: true, ...result, total: pending.leads.length, at: Date.now() }
        });
        return { ok: true, data: result };
      } catch (err: any) {
        const error = err?.message || String(err);
        await chrome.storage.local.set({
          [LAST_SAVE_KEY]: { ok: false, error, at: Date.now() }
        });
        return { ok: false, error };
      }
    }

    case 'GET_LAST_SAVE_RESULT': {
      const stored = await chrome.storage.local.get(LAST_SAVE_KEY);
      return { ok: true, data: stored[LAST_SAVE_KEY] ?? null };
    }

    case 'GET_AUTO_SCROLL_STATE': {
      const stored = await chrome.storage.session.get(AUTO_SCROLL_KEY);
      return { ok: true, data: (stored[AUTO_SCROLL_KEY] as AutoScrollState) ?? null };
    }

    case 'SAVE_AUTO_SCROLL_STATE': {
      await chrome.storage.session.set({ [AUTO_SCROLL_KEY]: message.payload });
      return { ok: true };
    }

    case 'UPDATE_LEAD_SELECTION': {
      const stored = await chrome.storage.session.get(AUTO_SCROLL_KEY);
      const state = stored[AUTO_SCROLL_KEY] as AutoScrollState | undefined;
      if (!state) return { ok: false, error: 'No scan state' };
      const { dedupKey, selected } = message.payload as { dedupKey: string; selected: boolean };
      state.collectedLeads = state.collectedLeads.map(l =>
        l.dedupKey === dedupKey ? { ...l, selected } : l
      );
      await chrome.storage.session.set({ [AUTO_SCROLL_KEY]: state });
      return { ok: true, data: state };
    }

    case 'CLEAR_AUTO_SCROLL_STATE': {
      await chrome.storage.session.remove(AUTO_SCROLL_KEY);
      return { ok: true };
    }

    case 'GET_COLLECT_TAB_ID': {
      const { collectTabId } = await chrome.storage.session.get('collectTabId');
      return { ok: true, data: collectTabId ?? null };
    }

    case 'SAVE_COLLECT_TAB_ID': {
      await chrome.storage.session.set({ collectTabId: message.payload });
      return { ok: true };
    }

    case 'GET_DEBUG_STATE': {
      const { debugState } = await chrome.storage.session.get('debugState');
      return { ok: true, data: (debugState as DebugState) ?? null };
    }

    case 'SAVE_DEBUG_STATE': {
      await chrome.storage.session.set({ debugState: message.payload });
      return { ok: true };
    }

    case 'SAVE_AUTO_PROGRESS':
    case 'GET_AUTO_PROGRESS':
      return { ok: true, data: null };

    default:
      return { ok: false, error: `Unknown action: ${message.type}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true;
});
