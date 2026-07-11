import React, { useCallback, useEffect, useState } from 'react';
import { fetchAgentJobs } from '../../services/agentPlatformApi';
import type { AgentJob } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
  JOB_STATUS_COLORS,
} from './AgentPlatformUi';

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

export default function AgentJobs() {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
        }
      />

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
