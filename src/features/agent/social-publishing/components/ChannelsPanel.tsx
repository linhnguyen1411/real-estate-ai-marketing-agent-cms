import React, { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Plus, ShieldCheck } from 'lucide-react';
import {
  activateSocialChannel,
  createSocialChannel,
  fetchSocialChannels,
  pauseSocialChannel,
  testSocialChannel,
} from '../../../../services/socialPublishingApi';
import type { SocialChannel, SocialChannelHealth } from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

const EMPTY_FORM = {
  name: '',
  type: 'facebook_profile' as 'facebook_profile' | 'facebook_page',
  executionMode: 'browser' as 'browser' | 'graph_api',
  profileUrl: '',
  externalId: '',
  browserSessionId: '',
};

function channelStatusClass(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-900/50 text-emerald-300',
    paused: 'bg-amber-900/50 text-amber-300',
    needs_login: 'bg-rose-900/50 text-rose-300',
    error: 'bg-rose-900/50 text-rose-300',
  };
  return map[status] || 'bg-slate-800 text-slate-300';
}

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function ChannelsPanel({ canManage, onMessage }: Props) {
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastHealth, setLastHealth] = useState<Record<string, SocialChannelHealth>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSocialChannels({ includeInactive: true });
      setChannels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được kênh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTypeChange = (type: 'facebook_profile' | 'facebook_page') => {
    setForm(f => ({
      ...f,
      type,
      executionMode: type === 'facebook_page' ? 'graph_api' : 'browser',
    }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setBusyId('create');
    try {
      await createSocialChannel({
        name: form.name.trim(),
        type: form.type,
        executionMode: form.executionMode,
        profileUrl: form.profileUrl.trim() || null,
        externalId: form.externalId.trim() || null,
        browserSessionId: form.browserSessionId.trim() || null,
      });
      onMessage('Đã tạo kênh.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Tạo kênh thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (channel: SocialChannel) => {
    if (!canManage) return;
    setBusyId(channel.id);
    try {
      const health = await testSocialChannel(channel.id);
      setLastHealth(prev => ({ ...prev, [channel.id]: health }));
      onMessage(
        health.ok
          ? `Kết nối OK: ${health.details || health.status}`
          : `Kết nối lỗi: ${health.details || health.errorCode || health.status}`,
      );
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Test thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePauseToggle = async (channel: SocialChannel) => {
    if (!canManage) return;
    setBusyId(channel.id);
    try {
      if (channel.status === 'paused' || !channel.isActive) {
        await activateSocialChannel(channel.id);
        onMessage('Đã kích hoạt kênh.');
      } else {
        await pauseSocialChannel(channel.id);
        onMessage('Đã tạm dừng kênh.');
      }
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Đổi trạng thái thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && channels.length === 0) {
    return <AgentPanelLoader label="Đang tải kênh..." />;
  }
  if (error && channels.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Kênh đăng"
        subtitle="facebook_profile (browser) hoặc facebook_page (graph_api)"
        onRefresh={load}
        refreshing={loading}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm kênh
            </button>
          ) : undefined
        }
      />

      {showForm && canManage && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Tên kênh
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Loại
              <select
                value={form.type}
                onChange={e =>
                  handleTypeChange(e.target.value as 'facebook_profile' | 'facebook_page')
                }
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="facebook_profile">facebook_profile (browser)</option>
                <option value="facebook_page">facebook_page (graph_api)</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Execution mode
              <select
                value={form.executionMode}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    executionMode: e.target.value as 'browser' | 'graph_api',
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="browser">browser</option>
                <option value="graph_api">graph_api</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Profile URL
              <input
                value={form.profileUrl}
                onChange={e => setForm(f => ({ ...f, profileUrl: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="https://www.facebook.com/me"
              />
            </label>
            <label className="block text-xs text-slate-400">
              External / Page ID
              <input
                value={form.externalId}
                onChange={e => setForm(f => ({ ...f, externalId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Browser session ID
              <input
                value={form.browserSessionId}
                onChange={e => setForm(f => ({ ...f, browserSessionId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Tạo kênh
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {channels.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có kênh"
          description="Tạo facebook_profile (browser) hoặc facebook_page (graph_api)."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Tên</th>
                <th className="px-3 py-3">Loại / Mode</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Health</th>
                <th className="px-3 py-3">Failures</th>
                <th className="px-3 py-3">Cập nhật</th>
                {canManage && <th className="px-3 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {channels.map(channel => {
                const health = lastHealth[channel.id];
                return (
                  <tr key={channel.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-200">{channel.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {channel.externalId || channel.profileUrl || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {channel.type}
                      <div className="text-slate-600">{channel.executionMode}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${channelStatusClass(channel.status)}`}
                      >
                        {channel.status}
                      </span>
                      {!channel.isActive && (
                        <span className="ml-1 text-[10px] text-slate-500">inactive</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {health
                        ? `${health.ok ? 'OK' : 'FAIL'} — ${health.details || health.status}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-400">
                      {channel.consecutiveFailures}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {formatAgentDate(channel.updatedAt)}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busyId === channel.id}
                            onClick={() => handleTest(channel)}
                            className="inline-flex items-center gap-1 rounded border border-sky-800 px-2 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-950/40 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3 w-3" /> Test
                          </button>
                          <button
                            type="button"
                            disabled={busyId === channel.id}
                            onClick={() => handlePauseToggle(channel)}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                          >
                            {channel.status === 'paused' || !channel.isActive ? (
                              <>
                                <Play className="h-3 w-3" /> Activate
                              </>
                            ) : (
                              <>
                                <Pause className="h-3 w-3" /> Pause
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
