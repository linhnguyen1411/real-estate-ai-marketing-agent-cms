import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Snapshot = {
  weekly: {
    buyerAccuracy: number;
    ruleImproved: number;
    ruleRemoved: number;
    campaignImproved: number;
    topSource: string | null;
    worstSource: string | null;
    eventsThisWeek: number;
  };
  knowledgeEvolution: Array<{
    concept: string;
    category: string;
    trust: number;
    weight: number;
    action: string;
  }>;
  sourceEvolution: Array<{
    label: string;
    buyers: number;
    spam: number;
    roiScore: number;
    suggestedFrequency: string;
    frequencyMultiplier: number;
  }>;
  missionEvolution: Array<{
    label: string;
    buyers: number;
    priorityScore: number;
    suggestedPriority: string;
  }>;
  contentEvolution: Array<{ label: string; contentScore: number; won: number; buyers: number }>;
  campaignEvolution: Array<{
    label: string;
    pipeline: number;
    won: number;
    revenue: number;
    roi: number;
    rank: number;
  }>;
  autoTune: Array<{ concept: string; kind: string; detail: string }>;
  recentEvents: Array<{ outcome: string; keywords: string[]; at: string }>;
};

type Tab =
  | 'overview'
  | 'rules'
  | 'knowledge'
  | 'sources'
  | 'missions'
  | 'campaigns'
  | 'content';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Weekly' },
  { id: 'rules', label: 'Rule Evolution' },
  { id: 'knowledge', label: 'Knowledge Trust' },
  { id: 'sources', label: 'Source Evolution' },
  { id: 'missions', label: 'Mission Evolution' },
  { id: 'campaigns', label: 'Campaign Evolution' },
  { id: 'content', label: 'Content Evolution' },
];

export default function FeedbackCenterPage({ canManage }: { canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState({
    outcome: 'won',
    keywords: 'cần mua, mai đăng chơn',
    sourceLabel: 'Group B',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/knowledge/feedback/snapshot');
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

  const sendOutcome = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      const res = await fetch('/api/knowledge/feedback/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: probe.outcome,
          keywords: probe.keywords.split(',').map(s => s.trim()).filter(Boolean),
          sourceId: `src_${probe.sourceLabel.replace(/\s+/g, '_').toLowerCase()}`,
          sourceLabel: probe.sourceLabel,
          campaignKey: 'Mai Đăng Chơn',
          missionId: 'mis_mdc',
          missionLabel: 'Mai Đăng Chơn',
          contentId: 'content_demo',
          revenue: probe.outcome === 'won' ? 1 : 0,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Feedback failed');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Feedback failed');
    } finally {
      setBusy(false);
    }
  };

  if (!snap && !error) return <AgentPanelLoader />;
  if (error && !snap) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return <AgentPanelEmpty title="Feedback Center" description="Chưa có feedback." />;

  const w = snap.weekly;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Feedback Center</h2>
          <p className="text-sm text-slate-400">
            Continuous learning từ Won/Lost/Spam · không thêm AI/Scanner/Rule
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Buyer Accuracy', `${w.buyerAccuracy}%`],
              ['Rule Improved', w.ruleImproved],
              ['Rule Removed', w.ruleRemoved],
              ['Campaign Improved', w.campaignImproved],
              ['Top Source', w.topSource || '—'],
              ['Worst Source', w.worstSource || '—'],
              ['Events / week', w.eventsThisWeek],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>

          {canManage ? (
            <div className="rounded-xl border border-slate-800 p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-200">Inject outcome (test / CRM hook)</div>
              <div className="grid gap-2 sm:grid-cols-4">
                <select
                  value={probe.outcome}
                  onChange={e => setProbe(p => ({ ...p, outcome: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                >
                  {['won', 'lost', 'spam', 'buyer', 'qualified', 'discarded'].map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <input
                  value={probe.keywords}
                  onChange={e => setProbe(p => ({ ...p, keywords: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 sm:col-span-2"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendOutcome()}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
                >
                  Apply feedback
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-800 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-2">Auto Tune</div>
            {snap.autoTune.map((a, i) => (
              <div key={`${a.concept}-${i}`} className="text-sm text-slate-300 py-1">
                <span className="text-rose-300">{a.kind}</span> · {a.concept} — {a.detail}
              </div>
            ))}
            {!snap.autoTune.length ? (
              <div className="text-sm text-slate-500">Chưa có auto-tune signal.</div>
            ) : null}
          </div>
        </div>
      )}

      {(tab === 'rules' || tab === 'knowledge') && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Concept</th>
                <th className="px-3 py-2 text-left">Trust</th>
                <th className="px-3 py-2 text-left">Weight</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {snap.knowledgeEvolution.map(r => (
                <tr key={`${r.concept}-${r.category}`}>
                  <td className="px-3 py-2 text-slate-100">
                    {r.concept}
                    <div className="text-xs text-slate-500">{r.category}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-100">{r.trust}</td>
                  <td className="px-3 py-2 text-slate-300">{r.weight}</td>
                  <td className="px-3 py-2 text-slate-400">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sources' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Buyers</th>
                <th className="px-3 py-2 text-left">Spam</th>
                <th className="px-3 py-2 text-left">ROI</th>
                <th className="px-3 py-2 text-left">Frequency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {snap.sourceEvolution.map(s => (
                <tr key={s.label}>
                  <td className="px-3 py-2 text-slate-100">{s.label}</td>
                  <td className="px-3 py-2">{s.buyers}</td>
                  <td className="px-3 py-2">{s.spam}</td>
                  <td className="px-3 py-2">{s.roiScore}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {s.suggestedFrequency} ×{s.frequencyMultiplier.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'missions' && (
        <div className="space-y-2">
          {snap.missionEvolution.map(m => (
            <div key={m.label} className="rounded-xl border border-slate-800 px-4 py-3 text-sm">
              <div className="text-slate-100 font-semibold">{m.label}</div>
              <div className="text-slate-400">
                Buyers {m.buyers} · Priority {m.priorityScore} · {m.suggestedPriority}
              </div>
            </div>
          ))}
          {!snap.missionEvolution.length ? (
            <div className="text-sm text-slate-500">Chưa có mission feedback.</div>
          ) : null}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Campaign</th>
                <th className="px-3 py-2 text-left">Rank</th>
                <th className="px-3 py-2 text-left">Pipeline</th>
                <th className="px-3 py-2 text-left">Won</th>
                <th className="px-3 py-2 text-left">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {snap.campaignEvolution.map(c => (
                <tr key={c.label}>
                  <td className="px-3 py-2 text-slate-100">{c.label}</td>
                  <td className="px-3 py-2">#{c.rank}</td>
                  <td className="px-3 py-2">{c.pipeline}</td>
                  <td className="px-3 py-2">{c.won}</td>
                  <td className="px-3 py-2">{c.roi}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'content' && (
        <div className="space-y-2">
          {snap.contentEvolution.map(c => (
            <div key={c.label} className="rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300">
              {c.label} · score {c.contentScore} · buyers {c.buyers} · won {c.won}
            </div>
          ))}
          {!snap.contentEvolution.length ? (
            <div className="text-sm text-slate-500">Chưa có content feedback.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
