import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type ProviderRow = {
  id: string;
  label: string;
  status: string;
  online: boolean;
  model: string;
  endpoint?: string | null;
  quotaPercent: number | null;
  latencyMs: number | null;
  avgLatencyMs: number | null;
  callsToday: number;
  successRate: number;
  errorRate: number;
  message: string;
  supportsVision: boolean;
  priority?: number;
  cost?: { inputPer1k: number; outputPer1k: number; note: string };
};

function statusClass(status: string) {
  if (status === 'healthy') return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  if (status === 'idle') return 'text-sky-300 border-sky-500/40 bg-sky-500/10';
  if (status === 'degraded') return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  if (status === 'unconfigured') return 'text-slate-400 border-slate-600 bg-slate-800/60';
  return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function AiProvidersPage({ canManage: _canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [briefing, setBriefing] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [provRes, statusRes] = await Promise.all([
        fetch('/api/ai-gateway/providers'),
        fetch('/api/ai-gateway/status'),
      ]);
      const provJson = await provRes.json();
      const statusJson = await statusRes.json();
      if (!provRes.ok || provJson.status !== 'success') {
        throw new Error(provJson.message || 'Load providers failed');
      }
      setRows(provJson.data as ProviderRow[]);
      if (statusRes.ok && statusJson.status === 'success') {
        setBriefing(String(statusJson.data?.text || ''));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !rows.length) return <AgentPanelLoader />;
  if (error && !rows.length) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!rows.length) return <AgentPanelEmpty title="No AI providers" description="Gateway chưa khởi tạo." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">AI Providers</h2>
          <p className="text-sm text-slate-400">
            Gateway cascade: Gemini → Kira → Local → Rule/Keyword
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      ) : null}

      {briefing ? (
        <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
          {briefing}
        </pre>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Quota</th>
              <th className="px-4 py-3">Latency</th>
              <th className="px-4 py-3">Calls Today</th>
              <th className="px-4 py-3">Success Rate</th>
              <th className="px-4 py-3">Model</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {rows.map(row => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-100">
                    {row.id === 'gemini' ? 'Gemini' : row.id === 'kira' ? 'Kira' : 'Local'}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    P{row.priority ?? '—'} · {row.supportsVision ? 'vision' : 'text'} ·{' '}
                    {row.endpoint || '—'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{row.message}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(
                      row.status,
                    )}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {row.quotaPercent != null ? `${Math.round(row.quotaPercent)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-200">
                  {row.latencyMs != null
                    ? `${row.latencyMs}ms`
                    : row.avgLatencyMs != null
                      ? `${Math.round(row.avgLatencyMs)}ms`
                      : '—'}
                </td>
                <td className="px-4 py-3 text-slate-200">{row.callsToday}</td>
                <td className="px-4 py-3 text-slate-200">{pct(row.successRate ?? 1)}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{row.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
