import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cleanupAgentJobs, deleteAgentJob, fetchAgentJobs } from '../../../../services/agentPlatformApi';
import type { AgentJob } from '../../../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
  JOB_STATUS_COLORS,
} from '../../shared/AgentPlatformUi';

function readJobMetrics(job: AgentJob) {
  const result = (job.result || {}) as Record<string, unknown>;
  const nested = (result.metrics && typeof result.metrics === 'object'
    ? result.metrics
    : {}) as Record<string, unknown>;

  const num = (...keys: string[]) => {
    for (const key of keys) {
      const raw = nested[key] ?? result[key];
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const stopReason = String(
    result.stopReason ?? result.stoppedReason ?? '—',
  );

  return {
    articlesObserved: num('articlesObserved'),
    uniquePostsObserved: num('uniquePostsObserved', 'postsSeen'),
    newPostsInserted: num('newPostsInserted', 'postsNew'),
    knownFromDatabase: num('knownFromDatabase', 'duplicates'),
    duplicateInSession: num('duplicateInSession'),
    parseFailed: num('parseFailed'),
    analyzed: num('analyzed'),
    findingsCreated: num('findingsCreated', 'findings'),
    notificationsCreated: num('notificationsCreated', 'notifyCount'),
    scrollsCompleted: num('scrollsCompleted', 'scrollsPerformed'),
    durationMs: num('durationMs'),
    stopReason,
  };
}

type Props = { canManage?: boolean };

export default function AgentJobs({ canManage = false }: Props) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentJobs({
        page: 1,
        limit: 50,
        status: statusFilter || undefined,
      });
      setJobs(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được jobs.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteJob = async (job: AgentJob) => {
    if (!canManage || !window.confirm('Xóa job này?')) return;
    setBusyId(job.id);
    setMessage('');
    try {
      await deleteAgentJob(job.id);
      setMessage('Đã xóa job.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Xóa job thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCleanup = async () => {
    if (!canManage || !window.confirm('Dọn toàn bộ job đã completed/failed? (không đụng job đang chạy)')) return;
    setBusyId('cleanup');
    setMessage('');
    try {
      const res = await cleanupAgentJobs();
      setMessage(`Đã dọn ${res.deleted} job.`);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Dọn job thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && jobs.length === 0) return <AgentPanelLoader label="Đang tải job queue..." />;
  if (error && jobs.length === 0) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Job queue"
        subtitle="PostgreSQL job queue — metrics từ lần quét gần nhất"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="queued">queued</option>
              <option value="claimed">claimed</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
            {canManage && (
              <button
                type="button"
                disabled={busyId === 'cleanup'}
                onClick={handleCleanup}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-950/60 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
                title="Xóa toàn bộ job completed/failed"
              >
                <Trash2 className="h-3.5 w-3.5" /> Dọn job xong/lỗi
              </button>
            )}
          </div>
        }
      />

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {jobs.length === 0 ? (
        <AgentPanelEmpty
          title="Hàng đợi trống"
          description="Chạy mission hoặc quét nguồn để tạo job status queued."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Loại</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Nguồn / Mission</th>
                <th className="px-3 py-3">Metrics</th>
                <th className="px-3 py-3">Stop</th>
                <th className="px-3 py-3">Thời gian</th>
                <th className="px-3 py-3">Lỗi</th>
                {canManage && <th className="px-3 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const m = readJobMetrics(job);
                return (
                  <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="px-3 py-3 font-mono text-xs text-slate-300">{job.type}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${JOB_STATUS_COLORS[job.status] || ''}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      <div>{job.source?.name || '—'}</div>
                      <div className="text-slate-600">{job.mission?.name || ''}</div>
                      <div className="text-slate-600">{job.attempts}/{job.maxAttempts} thử</div>
                    </td>
                    <td className="px-3 py-3 text-[11px] leading-relaxed text-slate-400">
                      {job.status === 'completed' && job.result ? (
                        <>
                          <div>obs {m.articlesObserved ?? '—'} · unique {m.uniquePostsObserved ?? '—'}</div>
                          <div className="text-emerald-300">mới {m.newPostsInserted ?? '—'} · known {m.knownFromDatabase ?? '—'}</div>
                          <div>dupSess {m.duplicateInSession ?? '—'} · parseFail {m.parseFailed ?? '—'}</div>
                          <div>AI {m.analyzed ?? '—'} · find {m.findingsCreated ?? '—'} · noti {m.notificationsCreated ?? '—'}</div>
                          <div>scroll {m.scrollsCompleted ?? '—'} · {(m.durationMs != null ? `${Math.round(m.durationMs / 1000)}s` : '—')}</div>
                        </>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-amber-200/90">
                      {job.status === 'completed' ? m.stopReason : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      <div>Tạo: {formatAgentDate(job.createdAt)}</div>
                      {job.startedAt && <div>Bắt đầu: {formatAgentDate(job.startedAt)}</div>}
                      {job.finishedAt && <div>Xong: {formatAgentDate(job.finishedAt)}</div>}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-xs text-rose-300" title={job.errorMessage || ''}>
                      {job.errorMessage || '—'}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={busyId === job.id || job.status === 'running' || job.status === 'claimed'}
                          onClick={() => handleDeleteJob(job)}
                          className="rounded bg-rose-950/60 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/60 disabled:opacity-40"
                          title={job.status === 'running' || job.status === 'claimed' ? 'Không thể xóa job đang chạy' : 'Xóa job'}
                        >
                          <Trash2 className="inline h-3 w-3" />
                        </button>
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
