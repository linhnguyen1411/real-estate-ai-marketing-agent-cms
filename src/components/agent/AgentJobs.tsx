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
        subtitle="PostgreSQL job queue — worker claim ở phase sau"
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
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Loại</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Nguồn / Mission</th>
                <th className="px-3 py-3">Thử</th>
                <th className="px-3 py-3">Thời gian</th>
                <th className="px-3 py-3">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
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
                  </td>
                  <td className="px-3 py-3 text-slate-400">{job.attempts}/{job.maxAttempts}</td>
                  <td className="px-3 py-3 text-xs text-slate-500">
                    <div>Tạo: {formatAgentDate(job.createdAt)}</div>
                    {job.startedAt && <div>Bắt đầu: {formatAgentDate(job.startedAt)}</div>}
                    {job.finishedAt && <div>Xong: {formatAgentDate(job.finishedAt)}</div>}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-xs text-rose-300" title={job.errorMessage || ''}>
                    {job.errorMessage || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
