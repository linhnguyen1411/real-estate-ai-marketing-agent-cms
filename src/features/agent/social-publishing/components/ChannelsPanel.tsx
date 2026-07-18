import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pause, Play, Plus, ShieldCheck } from 'lucide-react';
import {
  activateSocialChannel,
  connectSocialChannel,
  createSocialChannel,
  fetchSocialChannels,
  fetchSocialDestinations,
  fetchSocialJobs,
  pauseSocialChannel,
  testSocialChannel,
} from '../../../../services/socialPublishingApi';
import type {
  SocialChannel,
  SocialChannelHealth,
  SocialChannelType,
  SocialDestinationInfo,
  SocialPublishJob,
} from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

type ChannelFormType = SocialChannelType;

const EMPTY_FORM = {
  name: '',
  type: 'facebook_profile' as ChannelFormType,
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

function resolveConnectionBadge(channel: SocialChannel): {
  label: string;
  className: string;
} {
  const state = channel.connectionState;
  if (state === 'connected' || (!state && channel.status === 'active')) {
    return { label: 'Connected', className: 'bg-emerald-900/50 text-emerald-300' };
  }
  if (state === 'expired') {
    return { label: 'Expired', className: 'bg-amber-900/50 text-amber-300' };
  }
  if (state === 'permission_error') {
    return { label: 'Permission Error', className: 'bg-rose-900/50 text-rose-300' };
  }
  return { label: 'Disconnected', className: 'bg-slate-800 text-slate-400' };
}

function isGraphPageChannel(channel: SocialChannel) {
  return channel.type === 'facebook_page' && channel.executionMode === 'graph_api';
}

function resolveDestinationKey(channel: SocialChannel): string | null {
  if (channel.type === 'facebook_profile') return 'facebook_timeline';
  if (channel.type === 'facebook_group') return 'facebook_group';
  if (channel.type === 'facebook_page' && channel.executionMode === 'browser') {
    return 'facebook_page_web';
  }
  return null;
}

function formatCapabilities(caps: SocialDestinationInfo['capabilities'] | undefined) {
  if (!caps) return '—';
  const parts: string[] = [];
  if (caps.supportsText) parts.push('text');
  if (caps.supportsImage) parts.push('image');
  if (caps.supportsVideo) parts.push('video');
  if (caps.supportsLinks) parts.push('links');
  if (caps.supportsScheduling) parts.push('schedule');
  if (caps.supportsVerification) parts.push('verify');
  return parts.length ? parts.join(', ') : '—';
}

function channelTypeLabel(type: string) {
  const map: Record<string, string> = {
    facebook_profile: 'Timeline',
    facebook_group: 'Group',
    facebook_page: 'Page',
  };
  return map[type] || type;
}

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function ChannelsPanel({ canManage, onMessage }: Props) {
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [destinations, setDestinations] = useState<SocialDestinationInfo[]>([]);
  const [lastPublishByChannel, setLastPublishByChannel] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastHealth, setLastHealth] = useState<Record<string, SocialChannelHealth>>({});
  const [connectOpenId, setConnectOpenId] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState('');
  const [connectPageId, setConnectPageId] = useState('');

  const destinationByKey = useMemo(
    () => new Map(destinations.map(d => [d.key, d])),
    [destinations],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [channelData, publishedJobs, destResult] = await Promise.all([
        fetchSocialChannels({ includeInactive: true }),
        fetchSocialJobs({ status: 'published' }),
        fetchSocialDestinations().then(
          data => ({ ok: true as const, data }),
          err => ({
            ok: false as const,
            message: err instanceof Error ? err.message : 'Không tải destinations',
          }),
        ),
      ]);
      setChannels(channelData);
      if (destResult.ok) {
        setDestinations(destResult.data);
      } else {
        setDestinations([]);
        const msg = 'message' in destResult ? destResult.message : 'Không tải destinations';
        onMessage(`Capabilities: ${msg}`);
      }

      const byChannel: Record<string, string> = {};
      for (const job of publishedJobs as SocialPublishJob[]) {
        const at = job.completedAt || job.updatedAt;
        if (!at) continue;
        const prev = byChannel[job.channelId];
        if (!prev || new Date(at).getTime() > new Date(prev).getTime()) {
          byChannel[job.channelId] = at;
        }
      }
      setLastPublishByChannel(byChannel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được kênh.');
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTypeChange = (type: ChannelFormType) => {
    setForm(f => ({
      ...f,
      type,
      executionMode:
        type === 'facebook_page' ? (f.type === 'facebook_page' ? f.executionMode : 'graph_api') : 'browser',
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

  const handleConnect = async (channel: SocialChannel) => {
    if (!canManage) return;
    const token = connectToken.trim();
    if (!token) {
      onMessage('Page Access Token bắt buộc.');
      return;
    }
    setBusyId(channel.id);
    try {
      const result = await connectSocialChannel(channel.id, {
        pageAccessToken: token,
        pageId: connectPageId.trim() || undefined,
      });
      if (result.health) {
        setLastHealth(prev => ({ ...prev, [channel.id]: result.health! }));
      }
      onMessage(
        result.health?.ok
          ? `Đã kết nối & verify OK: ${result.health.details || result.channel.name}`
          : `Đã lưu token${result.health ? ` — verify: ${result.health.details || result.health.errorCode}` : ''}.`,
      );
      setConnectToken('');
      setConnectPageId('');
      setConnectOpenId(null);
      try {
        const health = await testSocialChannel(channel.id);
        setLastHealth(prev => ({ ...prev, [channel.id]: health }));
      } catch {
        // connect already succeeded
      }
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Connect thất bại.');
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
        subtitle="facebook_profile / facebook_group (browser) · facebook_page (browser hoặc graph_api)"
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
                onChange={e => handleTypeChange(e.target.value as ChannelFormType)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="facebook_profile">facebook_profile (Timeline)</option>
                <option value="facebook_group">facebook_group</option>
                <option value="facebook_page">facebook_page</option>
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
                disabled={form.type !== 'facebook_page'}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                <option value="browser">browser</option>
                <option value="graph_api">graph_api</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Profile / Group URL
              <input
                value={form.profileUrl}
                onChange={e => setForm(f => ({ ...f, profileUrl: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="https://www.facebook.com/..."
              />
            </label>
            <label className="block text-xs text-slate-400">
              External / Page / Group ID
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
          description="Tạo kênh Timeline, Group hoặc Page để bắt đầu đăng bài."
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Tên</th>
                  <th className="px-3 py-3">Loại / Mode</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Connection</th>
                  <th className="px-3 py-3">Capabilities</th>
                  <th className="px-3 py-3">Last publish</th>
                  <th className="px-3 py-3">Health</th>
                  <th className="px-3 py-3">Failures</th>
                  {canManage && <th className="px-3 py-3">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {channels.map(channel => {
                  const health = lastHealth[channel.id];
                  const badge = resolveConnectionBadge(channel);
                  const graphPage = isGraphPageChannel(channel);
                  const destKey = resolveDestinationKey(channel);
                  const destInfo = destKey ? destinationByKey.get(destKey) : undefined;
                  const lastPublish = lastPublishByChannel[channel.id];

                  return (
                    <React.Fragment key={channel.id}>
                      <tr className="border-t border-slate-800 hover:bg-slate-900/40">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-200">{channel.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {channel.externalId || channel.profileUrl || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">
                          {channelTypeLabel(channel.type)}
                          <div className="text-slate-600">
                            {channel.type} · {channel.executionMode}
                          </div>
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
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">
                          {destInfo ? (
                            <div>
                              <div className="font-medium text-slate-300">{destInfo.label}</div>
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {formatCapabilities(destInfo.capabilities)}
                              </div>
                            </div>
                          ) : graphPage ? (
                            <span className="text-slate-500">Graph API</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">
                          {lastPublish ? formatAgentDate(lastPublish) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">
                          {health
                            ? `${health.ok ? 'OK' : 'FAIL'} — ${health.details || health.status}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-400">
                          {channel.consecutiveFailures}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {graphPage && (
                                <button
                                  type="button"
                                  disabled={busyId === channel.id}
                                  onClick={() => {
                                    setConnectOpenId(id =>
                                      id === channel.id ? null : channel.id,
                                    );
                                    setConnectPageId(channel.externalId || '');
                                    setConnectToken('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-violet-800 px-2 py-1 text-[10px] font-bold text-violet-300 hover:bg-violet-950/40 disabled:opacity-50"
                                >
                                  <KeyRound className="h-3 w-3" />{' '}
                                  {channel.connectionState === 'connected' ||
                                  (!channel.connectionState && channel.status === 'active')
                                    ? 'Reconnect'
                                    : 'Graph Connect'}
                                </button>
                              )}
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
                                    <Play className="h-3 w-3" /> Enable
                                  </>
                                ) : (
                                  <>
                                    <Pause className="h-3 w-3" /> Disable
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {canManage && connectOpenId === channel.id && graphPage && (
                        <tr className="border-t border-slate-800/60 bg-slate-950/60">
                          <td colSpan={canManage ? 9 : 8} className="px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <label className="block min-w-0 flex-1 text-xs text-slate-400">
                                Page Access Token
                                <input
                                  type="password"
                                  value={connectToken}
                                  onChange={e => setConnectToken(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                                  placeholder="EAA..."
                                  autoComplete="off"
                                />
                              </label>
                              <label className="block w-full text-xs text-slate-400 sm:w-48">
                                Page ID (optional)
                                <input
                                  value={connectPageId}
                                  onChange={e => setConnectPageId(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                                  placeholder={channel.externalId || 'page id'}
                                />
                              </label>
                              <button
                                type="button"
                                disabled={busyId === channel.id || !connectToken.trim()}
                                onClick={() => handleConnect(channel)}
                                className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                              >
                                Connect & Test
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
