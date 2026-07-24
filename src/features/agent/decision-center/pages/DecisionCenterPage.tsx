import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Metrics = {
  scanned: number;
  discarded: number;
  rulePassed: number;
  aiReviewed: number;
  qualified: number;
  converted: number;
  manualReview: number;
  cacheHits: number;
  aiSavingPercent: number;
};

type Rule = {
  id: string;
  group: string;
  keyword: string;
  weight: number;
  category: string;
  enabled: boolean;
  priority: number;
};

type Recent = {
  findingId: string;
  title: string;
  ruleScore: number;
  intent: string;
  decision: string;
  aiUsed: boolean;
  reason: string;
  matchedRules: string[];
  at: string;
};

type Snapshot = {
  metrics: Metrics;
  rules: Rule[];
  recent: Recent[];
};

type Tab = 'overview' | 'decisions' | 'rules';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'rules', label: 'Rule Library' },
];

function decisionClass(d: string) {
  if (d === 'qualified_candidate') return 'text-emerald-300';
  if (d === 'ai_review') return 'text-sky-300';
  if (d === 'manual_review') return 'text-amber-300';
  return 'text-rose-300';
}

export default function DecisionCenterPage({ canManage }: { canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [probe, setProbe] = useState('Cầnnnnnnnn muaaaaa nhà Mai Đăng Chơn tài chính sẵn');
  const [probeResult, setProbeResult] = useState<string>('');
  const [draft, setDraft] = useState({ keyword: '', weight: 20, group: 'Custom', category: 'buyer' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/decision-center/snapshot');
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Load failed');
      setSnap(json.data as Snapshot);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const r of snap?.rules || []) {
      const list = map.get(r.group) || [];
      list.push(r);
      map.set(r.group, list);
    }
    return [...map.entries()];
  }, [snap]);

  const runProbe = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/decision-center/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: probe }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Evaluate failed');
      const d = json.data;
      setProbeResult(
        [
          `Score ${d.ruleScore} · ${d.decision} · intent=${d.intent}`,
          `AI allowed: ${d.aiAllowed ? 'yes' : 'no'} · cache=${d.cacheHit ? 'hit' : 'miss'}`,
          `Normalized: ${d.normalizedText}`,
          `Rules: ${(d.matchedRules || []).map((m: { keyword: string; weight: number }) => `${m.keyword}(${m.weight})`).join(', ') || '—'}`,
          d.campaign ? `Campaign: ${d.campaign.campaignName}` : 'Campaign: —',
          `Reason: ${d.reason}`,
        ].join('\n'),
      );
    } catch (e: unknown) {
      setProbeResult(e instanceof Error ? e.message : 'Evaluate failed');
    } finally {
      setBusy(false);
    }
  };

  const saveRule = async () => {
    if (!canManage || !draft.keyword.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/decision-center/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Save failed');
      setDraft({ keyword: '', weight: 20, group: 'Custom', category: 'buyer' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const exportRules = async () => {
    const res = await fetch('/api/decision-center/rules/export');
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decision-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetRules = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      await fetch('/api/decision-center/rules/reset', { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!snap && !error) return <AgentPanelLoader />;
  if (error && !snap) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return <AgentPanelEmpty title="Decision Center" description="Chưa có dữ liệu." />;

  const m = snap.metrics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Decision Center</h2>
          <p className="text-sm text-slate-400">
            Rule-first · AI chỉ khi score 60–79 · Token saving {m.aiSavingPercent}%
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === t.id ? 'bg-rose-500/15 text-rose-300' : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Scanned', m.scanned],
              ['Passed Rules', m.rulePassed],
              ['AI Reviewed', m.aiReviewed],
              ['Qualified', m.qualified],
              ['Converted', m.converted],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-500">Discarded</div>
              <div className="text-xl text-slate-100">{m.discarded}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-500">Manual Review</div>
              <div className="text-xl text-slate-100">{m.manualReview}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs text-slate-500">AI Saving</div>
              <div className="text-xl text-emerald-300">{m.aiSavingPercent}%</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-200">Probe</div>
            <textarea
              value={probe}
              onChange={e => setProbe(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runProbe()}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
            >
              Evaluate
            </button>
            {probeResult ? (
              <pre className="whitespace-pre-wrap text-xs text-slate-300">{probeResult}</pre>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'decisions' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Decision</th>
                <th className="px-3 py-2">AI?</th>
                <th className="px-3 py-2">Matched</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {snap.recent.map(row => (
                <tr key={`${row.findingId}-${row.at}`}>
                  <td className="px-3 py-2 text-slate-200">{row.title || row.findingId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-slate-100">{row.ruleScore}</td>
                  <td className="px-3 py-2 text-slate-300">{row.intent}</td>
                  <td className={`px-3 py-2 font-semibold ${decisionClass(row.decision)}`}>
                    {row.decision}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{row.aiUsed ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {(row.matchedRules || []).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!snap.recent.length ? (
            <div className="p-4 text-sm text-slate-500">Chưa có decision nào.</div>
          ) : null}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportRules()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
            >
              Export
            </button>
            {canManage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetRules()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
              >
                Reset defaults
              </button>
            ) : null}
          </div>

          {canManage ? (
            <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-5">
              <input
                value={draft.keyword}
                onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))}
                placeholder="keyword"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 sm:col-span-2"
              />
              <input
                type="number"
                value={draft.weight}
                onChange={e => setDraft(d => ({ ...d, weight: Number(e.target.value) }))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
              <input
                value={draft.group}
                onChange={e => setDraft(d => ({ ...d, group: e.target.value }))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveRule()}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
              >
                Add rule
              </button>
            </div>
          ) : null}

          {groups.map(([group, rules]) => (
            <div key={group} className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-800">
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td className="px-3 py-2 text-slate-100">{rule.keyword}</td>
                      <td className="px-3 py-2 text-slate-300">{rule.weight}</td>
                      <td className="px-3 py-2 text-slate-400">{rule.category}</td>
                      <td className="px-3 py-2 text-slate-400">{rule.enabled ? 'Enable' : 'Off'}</td>
                      <td className="px-3 py-2 text-slate-500">P{rule.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
