import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchAgentDashboard,
  fetchAgentFindings,
  fetchAgentJobs,
} from '../../services/agentPlatformApi';
import type { AgentDashboardCounts, AgentFinding, AgentJob } from '../../types/agentPlatform';
import {
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  AgentStatCard,
  formatAgentDate,
  JOB_STATUS_COLORS,
} from './AgentPlatformUi';

export default function AgentDashboard() {
  const [counts, setCounts] = useState<AgentDashboardCounts | null>(null);
  const [topFindings, setTopFindings] = useState<AgentFinding[]>([]);
  const [recentJobs, setRecentJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, findingsRes, jobsRes] = await Promise.all([
        fetchAgentDashboard(),
        fetchAgentFindings({ page: 1, limit: 10 }),
        fetchAgentJobs({ page: 1, limit: 10 }),
      ]);
      setCounts(dashboard);
      const sorted = [...findingsRes.data].sort((a, b) => b.score - a.score).slice(0, 10);
      setTopFindings(sorted);
      setRecentJobs(jobsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !counts) return <AgentPanelLoader label="Đang tải dashboard AI Agent..." />;
  if (error && !counts) return <AgentPanelError message={error} onRetry={load} />;

  const sourceScans = counts?.recentSourceScans ?? [];

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="AI Agent Dashboard"
        subtitle="Quan sát hệ thống — incremental scan & job queue"
        onRefresh={load}
        refreshing={loading}
      />

      {counts && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <AgentStatCard label="Nguồn đang hoạt động" value={counts.activeSources} tone="success" />
          <AgentStatCard label="Job đang chờ" value={counts.queuedJobs} />
          <AgentStatCard label="Job đang chạy" value={counts.runningJobs} tone="warning" />
          <AgentStatCard label="Finding mới" value={counts.newFindings} tone="warning" />
          <AgentStatCard label="Thông báo chưa đọc" value={counts.unreadNotifications} />
          <AgentStatCard label="Job lỗi 24h" value={counts.jobsFailed24h} tone="danger" />
          <AgentStatCard label="Nguồn có lỗi" value={counts.sourcesWithError ?? 0} tone="danger" />
          <AgentStatCard label="Bài mới (scan gần)" value={counts.postsNewLastScans ?? 0} tone="success" />
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Nguồn — lần quét gần nhất
        </h3>
        {sourceScans.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-500">
            Chưa có nguồn. Thêm source rồi chạy worker để thấy last/next scan.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">Last scan</th>
                  <th className="px-3 py-2">Next scan</th>
                  <th className="px-3 py-2">Bài mới</th>
                  <th className="px-3 py-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {sourceScans.map(source => (
                  <tr key={source.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">{source.name}</div>
                      <div className="text-xs text-slate-500">{source.type} · {source.status}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {formatAgentDate(source.lastScannedAt)}
                      {source.stoppedReason && (
                        <div className="text-slate-600">{source.stoppedReason}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {formatAgentDate(source.nextScanAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs font-bold text-emerald-300">
                        mới {source.postsNew ?? '—'}
                      </span>
                      {source.findings != null && (
                        <div className="mt-1 text-[11px] text-slate-500">findings {source.findings}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-rose-400 max-w-[220px] truncate" title={source.lastError || ''}>
                      {source.lastError || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Top finding điểm cao
          </h3>
          {topFindings.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-500">
              Chưa có finding mới. Worker sẽ điền sau khi quét nguồn.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Điểm</th>
                    <th className="px-3 py-2">Tiêu đề</th>
                    <th className="px-3 py-2">Nguồn</th>
                    <th className="px-3 py-2">Loại</th>
                  </tr>
                </thead>
                <tbody>
                  {topFindings.map(item => (
                    <tr key={item.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-300">
                          {item.score}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white">{item.title}</td>
                      <td className="px-3 py-2 text-slate-400">{item.source?.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{item.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Job gần nhất
          </h3>
          {recentJobs.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-500">
              Chưa có job trong hàng đợi.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Loại</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2">Nguồn</th>
                    <th className="px-3 py-2">Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(job => (
                    <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{job.type}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.queued}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{job.source?.name || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{formatAgentDate(job.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
