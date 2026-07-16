import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, XCircle } from 'lucide-react';
import {
  cancelSocialJob,
  fetchSocialJobs,
  retrySocialJob,
} from '../../../../services/socialPublishingApi';
import type { SocialPublishJob } from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

function jobStatusClass(status: string) {
  const map: Record<string, string> = {
    queued: 'bg-slate-700 text-slate-200',
    claimed: 'bg-indigo-900/50 text-indigo-300',
    preparing: 'bg-indigo-900/50 text-indigo-300',
    publishing: 'bg-sky-900/50 text-sky-300',
    published: 'bg-emerald-900/50 text-emerald-300',
    failed: 'bg-rose-900/50 text-rose-300',
    cancelled: 'bg-slate-800 text-slate-500',
    skipped: 'bg-slate-800 text-slate-400',
  };
  return map[status] || 'bg-slate-800 text-slate-300';
}

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function CalendarQueuePanel({ canManage, onMessage }: Props) {
  const [jobs, setJobs] = useState<SocialPublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSocialJobs({
        status: statusFilter || undefined,
      });
      const sorted = [...data].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
      setJobs(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch đăng.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (job: SocialPublishJob) => {
    if (!canManage || !window.confirm('Hủy job này?')) return;
    setBusyId(job.id);
    try {
      await cancelSocialJob(job.id);
      onMessage('Đã hủy job.');
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Hủy thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (job: SocialPublishJob) => {
    if (!canManage) return;
    setBusyId(job.id);
    try {
      const res = await retrySocialJob(job.id);
      onMessage(
        res.skipped
          ? `Bỏ qua retry (${res.reason || 'already_published'}).`
          : 'Đã xếp lại hàng đợi.',
      );
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Retry thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && jobs.length === 0) {
    return <AgentPanelLoader label="Đang tải lịch đăng..." />;
  }
  if (error && jobs.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Lịch / Queue"
        subtitle="Jobs theo scheduledAt — hủy hoặc retry khi lỗi"
        onRefresh={load}
        refreshing={loading}
        actions={
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">Tất cả</option>
            <option value="queued">queued</option>
            <option value="publishing">publishing</option>
            <option value="published">published</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </select>
        }
      />

      {jobs.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có job trong lịch"
          description="Approve + schedule một bản nháp để tạo job."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Lịch đăng</th>
                <th className="px-3 py-3">Draft</th>
                <th className="px-3 py-3">Kênh</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Attempts</th>
                <th className="px-3 py-3">Lỗi</th>
                {canManage && <th className="px-3 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="px-3 py-3 text-xs text-slate-300">
                    {formatAgentDate(job.scheduledAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-slate-200">
                      {job.draft?.title || job.draftId.slice(0, 8)}
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                      {job.draft?.body || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-400">
                    {job.channel?.name || job.channelId.slice(0, 8)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${jobStatusClass(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums text-slate-400">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs text-rose-300">
                    {job.errorCode || job.errorMessage || '—'}
                  </td>
                  {canManage && (
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {['queued', 'failed', 'skipped'].includes(job.status) && (
                          <button
                            type="button"
                            disabled={busyId === job.id}
                            onClick={() => handleCancel(job)}
                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Hủy
                          </button>
                        )}
                        {['failed', 'skipped'].includes(job.status) && (
                          <button
                            type="button"
                            disabled={busyId === job.id}
                            onClick={() => handleRetry(job)}
                            className="inline-flex items-center gap-1 rounded border border-amber-800 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
