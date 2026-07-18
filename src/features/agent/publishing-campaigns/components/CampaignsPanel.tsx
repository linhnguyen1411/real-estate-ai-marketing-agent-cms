import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Plus, RefreshCw, X } from 'lucide-react';
import {
  createSocialCampaign,
  fetchSocialCampaign,
  fetchSocialCampaigns,
  fetchSocialChannels,
  fetchSocialDrafts,
  refreshSocialCampaignRun,
  startSocialCampaign,
} from '../../../../services/socialPublishingApi';
import type {
  CampaignProgress,
  SocialCampaign,
  SocialCampaignRunDetail,
  SocialCampaignTarget,
  SocialChannel,
  SocialPostDraft,
} from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

function parseChannelIds(raw: SocialCampaign['destinationChannelIds']): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function runStatusClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-200',
    running: 'bg-sky-900/50 text-sky-300',
    completed: 'bg-emerald-900/50 text-emerald-300',
    partial_success: 'bg-amber-900/50 text-amber-300',
    failed: 'bg-rose-900/50 text-rose-300',
    cancelled: 'bg-slate-800 text-slate-500',
  };
  return map[status] || 'bg-slate-800 text-slate-300';
}

function normalizeProgress(raw: CampaignProgress | Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  return {
    total: Number(p.total ?? 0),
    completed: Number(p.completed ?? 0),
    failed: Number(p.failed ?? 0),
    pending: Number(p.pending ?? 0),
    publishing: Number(p.publishing ?? 0),
    skipped: Number(p.skipped ?? 0),
  };
}

function latestRun(campaign: SocialCampaign): SocialCampaignRunDetail | null {
  const runs = campaign.runs || [];
  if (runs.length === 0) return null;
  return [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
}

const EMPTY_FORM = {
  name: '',
  draftId: '',
  channelIds: [] as string[],
};

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function CampaignsPanel({ canManage, onMessage }: Props) {
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
  const [drafts, setDrafts] = useState<SocialPostDraft[]>([]);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SocialCampaign | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const channelById = useMemo(() => new Map(channels.map(c => [c.id, c])), [channels]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignList, draftList, channelList] = await Promise.all([
        fetchSocialCampaigns({}),
        fetchSocialDrafts({}),
        fetchSocialChannels({ includeInactive: false }),
      ]);
      setCampaigns(campaignList);
      setDrafts(
        draftList.filter(d => !['archived', 'rejected'].includes(String(d.status))),
      );
      setChannels(channelList.filter(c => c.status === 'active' || c.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (campaignId: string) => {
    setDetailId(campaignId);
    setDetailLoading(true);
    try {
      const data = await fetchSocialCampaign(campaignId);
      setDetail(data);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Không tải chi tiết campaign.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
  };

  const toggleChannel = (channelId: string) => {
    setForm(f => ({
      ...f,
      channelIds: f.channelIds.includes(channelId)
        ? f.channelIds.filter(id => id !== channelId)
        : [...f.channelIds, channelId],
    }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!form.draftId || form.channelIds.length === 0) {
      onMessage('Chọn bản nháp và ít nhất một kênh.');
      return;
    }
    setBusyId('create');
    try {
      await createSocialCampaign({
        name: form.name.trim() || 'Untitled campaign',
        draftId: form.draftId,
        channelIds: form.channelIds,
      });
      onMessage('Đã tạo campaign.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Tạo campaign thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStart = async (campaign: SocialCampaign) => {
    if (!canManage) return;
    if (!window.confirm(`Start campaign "${campaign.name}"?`)) return;
    setBusyId(campaign.id);
    try {
      await startSocialCampaign(campaign.id);
      onMessage('Đã start campaign.');
      await load();
      if (detailId === campaign.id) await openDetail(campaign.id);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Start campaign thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRefreshRun = async (runId: string) => {
    if (!canManage) return;
    setBusyId(runId);
    try {
      await refreshSocialCampaignRun(runId);
      onMessage('Đã refresh run progress.');
      await load();
      if (detailId) await openDetail(detailId);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Refresh thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const renderTargetRow = (target: SocialCampaignTarget) => {
    const channel = channelById.get(target.channelId);
    return (
      <tr key={target.id} className="border-t border-slate-800/80">
        <td className="px-2 py-2 text-slate-300">
          {channel?.name || target.channelId.slice(0, 8)}
          <div className="text-[10px] text-slate-500">{target.destinationKey || channel?.type}</div>
        </td>
        <td className="px-2 py-2">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${runStatusClass(target.status)}`}
          >
            {target.status}
          </span>
        </td>
        <td className="px-2 py-2 text-[10px] text-slate-400">
          {target.publishJobId ? target.publishJobId.slice(0, 8) + '…' : '—'}
        </td>
        <td className="px-2 py-2 text-[10px]">
          {target.permalink ? (
            <a
              href={target.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline"
            >
              View
            </a>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="max-w-[140px] px-2 py-2 text-[10px] text-rose-300">
          {target.errorCode || target.errorMessage || '—'}
        </td>
      </tr>
    );
  };

  if (loading && campaigns.length === 0) {
    return <AgentPanelLoader label="Đang tải campaigns..." />;
  }
  if (error && campaigns.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  const detailRun = detail ? latestRun(detail) : null;
  const detailProgress = normalizeProgress(detailRun?.progress);

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Campaigns"
        subtitle="Một bản nháp → nhiều kênh — theo dõi run & targets"
        onRefresh={load}
        refreshing={loading}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo campaign
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
              Tên campaign
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Campaign name"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Bản nháp
              <select
                required
                value={form.draftId}
                onChange={e => setForm(f => ({ ...f, draftId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="">— Chọn draft —</option>
                {drafts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.title || d.id.slice(0, 8)} ({d.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="rounded-lg border border-slate-800 p-3">
            <legend className="px-1 text-xs text-slate-400">Kênh đích (multi-select)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {channels.length === 0 ? (
                <span className="text-xs text-slate-500">Chưa có kênh active.</span>
              ) : (
                channels.map(ch => (
                  <label
                    key={ch.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                      form.channelIds.includes(ch.id)
                        ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.channelIds.includes(ch.id)}
                      onChange={() => toggleChannel(ch.id)}
                      className="rounded border-slate-700"
                    />
                    {ch.name} ({ch.type})
                  </label>
                ))
              )}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Tạo campaign
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

      {campaigns.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có campaign"
          description="Tạo campaign để đăng một bản nháp lên nhiều kênh."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Tên</th>
                <th className="px-3 py-3">Draft</th>
                <th className="px-3 py-3">Kênh</th>
                <th className="px-3 py-3">Latest run</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3">Cập nhật</th>
                {canManage && <th className="px-3 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => {
                const run = latestRun(campaign);
                const progress = normalizeProgress(run?.progress);
                const channelIds = parseChannelIds(campaign.destinationChannelIds);

                return (
                  <tr key={campaign.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="px-3 py-3 font-medium text-slate-200">{campaign.name}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {campaign.draft?.title || campaign.draftId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{channelIds.length}</td>
                    <td className="px-3 py-3">
                      {run ? (
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${runStatusClass(run.status)}`}
                        >
                          {run.status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-400">
                      {progress ? (
                        <span>
                          {progress.completed}/{progress.total} ok
                          {progress.failed > 0 && (
                            <span className="ml-1 text-rose-400">· {progress.failed} fail</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {formatAgentDate(campaign.updatedAt)}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(campaign.id)}
                            className="rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800"
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            disabled={busyId === campaign.id}
                            onClick={() => handleStart(campaign)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-800 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" /> Start
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

      {detailId && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {detail?.name || `Campaign ${detailId.slice(0, 8)}…`}
              </h3>
              {detailRun && (
                <p className="mt-1 text-xs text-slate-500">
                  Run {detailRun.id.slice(0, 8)}… · {detailRun.status}
                  {detailRun.startedAt && ` · started ${formatAgentDate(detailRun.startedAt)}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {detailLoading ? (
            <p className="text-xs text-slate-500">Đang tải chi tiết…</p>
          ) : !detail ? (
            <p className="text-xs text-slate-500">Không có dữ liệu.</p>
          ) : (
            <div className="space-y-4">
              {detailProgress && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-white">
                      {detailProgress.total}
                    </div>
                    <div className="text-[10px] text-slate-500">Total</div>
                  </div>
                  <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-emerald-300">
                      {detailProgress.completed}
                    </div>
                    <div className="text-[10px] text-slate-500">Completed</div>
                  </div>
                  <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-rose-300">
                      {detailProgress.failed}
                    </div>
                    <div className="text-[10px] text-slate-500">Failed</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-slate-300">
                      {detailProgress.pending + detailProgress.publishing}
                    </div>
                    <div className="text-[10px] text-slate-500">Pending</div>
                  </div>
                </div>
              )}

              {detailRun && canManage && (
                <button
                  type="button"
                  disabled={busyId === detailRun.id}
                  onClick={() => handleRefreshRun(detailRun.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busyId === detailRun.id ? 'animate-spin' : ''}`} />
                  Refresh run
                </button>
              )}

              {(detailRun?.targets || []).length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Kênh</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Job</th>
                        <th className="px-2 py-2">Permalink</th>
                        <th className="px-2 py-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>{detailRun!.targets!.map(renderTargetRow)}</tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Chưa có targets — start campaign để tạo run.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
