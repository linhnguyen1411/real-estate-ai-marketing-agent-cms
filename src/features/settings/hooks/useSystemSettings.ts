import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../../config/defaults';
import type { AppSettings } from '../../../types';
import {
  fetchAgentSyncStatus,
  flushAgentSync,
  loadSystemSettings,
  persistSystemSettings,
  testAgentSyncConnection,
  testTelegramConnection,
} from '../services/systemSettingsApi';

export type SettingsNotify = (message: string, type?: 'success' | 'error' | 'info') => void;

export function useSystemSettings(onSettingsSaved?: (settings: AppSettings) => void) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSettings(await loadSystemSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được cấu hình.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async (notify: SettingsNotify) => {
    setActionLoading('save-settings');
    try {
      const updated = await persistSystemSettings(settings);
      setSettings(updated);
      onSettingsSaved?.(updated);
      notify('Đã lưu thiết lập cấu hình AI thành công!', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi lưu.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const testTelegram = async (notify: SettingsNotify) => {
    setActionLoading('test-telegram');
    try {
      const json = await testTelegramConnection();
      notify(json.message || 'Đã gửi tin Telegram thử.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Test Telegram thất bại.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const testAgentSync = async (notify: SettingsNotify) => {
    setActionLoading('test-agent-sync');
    try {
      const json = await testAgentSyncConnection({
        agent_sync_vps_url: settings.agent_sync_vps_url,
        agent_sync_key_id: settings.agent_sync_key_id,
        agent_sync_secret: settings.agent_sync_secret,
        agent_sync_timeout_ms: settings.agent_sync_timeout_ms,
      });
      notify(json.message || 'Kết nối VPS OK.', 'success');
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') {
        notify('Server chưa có endpoint test — restart CMS rồi thử lại.', 'info');
      } else {
        notify(e instanceof Error ? e.message : 'Test Đồng bộ VPS thất bại.', 'error');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const syncNow = async (notify: SettingsNotify) => {
    setActionLoading('flush-agent-sync');
    try {
      const json = await flushAgentSync(20);
      const flush = (json.data?.flush || {}) as {
        synced?: number;
        failed?: number;
        processed?: number;
      };
      notify(
        `Sync now: processed ${flush.processed ?? 0}, synced ${flush.synced ?? 0}, failed ${flush.failed ?? 0}`,
        'success',
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Flush thất bại.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const showOutboxStatus = async (notify: SettingsNotify) => {
    setActionLoading('status-agent-sync');
    try {
      const d = await fetchAgentSyncStatus();
      notify(
        `Pending ${d.pending ?? 0} · Failed ${d.failed ?? 0} · Synced ${d.synced ?? 0} · Dead ${d.deadLetter ?? 0}`,
        'info',
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không lấy được status.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return {
    settings,
    setSettings,
    loading,
    error,
    actionLoading,
    save,
    testTelegram,
    testAgentSync,
    syncNow,
    showOutboxStatus,
    reload,
  };
}
