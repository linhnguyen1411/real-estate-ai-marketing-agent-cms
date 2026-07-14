import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAgentDailyReport } from '../../services/agentPlatformApi';
import type { AgentDailyReport } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  AgentStatCard,
  formatAgentDate,
} from './AgentPlatformUi';

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AgentReports() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayLocalYmd);
  const [includeAi, setIncludeAi] = useState(true);
  const [report, setReport] = useState<AgentDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAgentDailyReport({
        date,
        includeAiSummary: includeAi,
      });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được báo cáo.');
    } finally {
      setLoading(false);
    }
  }, [date, includeAi]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = report?.metrics;
  const statusEntries = useMemo(
    () => Object.entries(metrics?.browserSessionHealth.byStatus ?? {}),
    [metrics],
  );

  if (loading && !report) return <AgentPanelLoader label="Đang tổng hợp báo cáo ngày..." />;
  if (error && !report) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Báo cáo cuối ngày"
        subtitle="Số liệu từ database — AI chỉ viết tóm tắt từ metrics đã truy vấn"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={includeAi}
                onChange={e => setIncludeAi(e.target.checked)}
                className="rounded border-slate-700"
              />
              Tóm tắt AI
            </label>
          </div>
        }
      />

      {metrics && (
        <>
          <p className="text-[11px] text-slate-600">
            Ngày {metrics.date} ({metrics.timezone}) · nguồn dữ liệu: {report?.dataSource} ·{' '}
            {formatAgentDate(metrics.rangeStart)} → {formatAgentDate(metrics.rangeEnd)}
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <AgentStatCard label="Nguồn đã quét" value={metrics.sourcesScanned} tone="success" />
            <AgentStatCard label="Bài mới" value={metrics.postsNew} />
            <AgentStatCard label="Findings" value={metrics.findingsTotal} tone="warning" />
            <AgentStatCard label="Lead nóng (≥75)" value={metrics.findingsByScore.hot} tone="danger" />
            <AgentStatCard label="Job lỗi" value={metrics.failedJobs.length} tone="danger" />
            <AgentStatCard label="Session healthy" value={metrics.browserSessionHealth.healthy} tone="success" />
            <AgentStatCard label="Needs login" value={metrics.browserSessionHealth.needsLogin} tone="warning" />
            <AgentStatCard label="Mất heartbeat" value={metrics.browserSessionHealth.staleHeartbeat} tone="danger" />
          </div>

          {(report?.aiSummary || report?.aiSummaryError) && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tóm tắt AI</h3>
              {report.aiSummary ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                  {report.aiSummary}
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-400/90">
                  Không có tóm tắt AI{report.aiSummaryError ? `: ${report.aiSummaryError}` : '.'}
                </p>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Findings theo score</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {metrics.findingsByScore.buckets.map(bucket => (
                <div key={bucket.label} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[11px] text-slate-500">{bucket.label}</p>
                  <p className="text-lg font-bold text-white">{bucket.count}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600">
              Hot ≥75: {metrics.findingsByScore.hot} · Warm 50–74: {metrics.findingsByScore.warm} · Cool &lt;50:{' '}
              {metrics.findingsByScore.cool}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Top lead</h3>
            {metrics.topLeads.length === 0 ? (
              <AgentPanelEmpty title="Chưa có lead" description="Không có finding trong ngày đã chọn." />
            ) : (
              <ul className="space-y-2">
                {metrics.topLeads.map(lead => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/agents/findings')}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-left hover:border-rose-900/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{lead.title}</p>
                        <span className="shrink-0 rounded bg-rose-900/40 px-2 py-0.5 text-xs font-bold text-rose-300">
                          {lead.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{lead.summary}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {lead.sourceName || '—'}
                        {lead.missionName ? ` · ${lead.missionName}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Nguồn hiệu quả nhất
              </h3>
              {metrics.mostEffectiveSources.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có finding theo nguồn.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.mostEffectiveSources.map(src => (
                    <li
                      key={src.sourceId}
                      className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-200">{src.sourceName}</p>
                        <p className="text-[11px] text-slate-600">
                          {src.sourceType} · bài mới {src.postsNew}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{src.findingsCount} findings</p>
                        <p>avg {src.avgScore}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Nhóm nhu cầu nổi bật
              </h3>
              {metrics.demandThemes.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa gom được theme từ finding.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {metrics.demandThemes.map(theme => (
                    <span
                      key={theme.theme}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300"
                    >
                      {theme.theme}{' '}
                      <span className="text-slate-500">×{theme.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Job lỗi</h3>
              {metrics.failedJobs.length === 0 ? (
                <p className="text-sm text-emerald-500/80">Không có job failed trong ngày.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.failedJobs.map(job => (
                    <li key={job.id} className="rounded-lg border border-rose-900/30 bg-rose-950/10 px-3 py-2">
                      <p className="text-xs font-semibold text-rose-300">
                        {job.type}
                        {job.sourceName ? ` · ${job.sourceName}` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                        {job.errorMessage || 'Không có errorMessage'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Browser session health
              </h3>
              <p className="text-sm text-slate-400">
                Tổng {metrics.browserSessionHealth.total} session
              </p>
              {statusEntries.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có session.</p>
              ) : (
                <ul className="space-y-1">
                  {statusEntries.map(([status, count]) => (
                    <li key={status} className="flex justify-between text-xs text-slate-400">
                      <span className="uppercase">{status}</span>
                      <span className="font-bold text-slate-200">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
