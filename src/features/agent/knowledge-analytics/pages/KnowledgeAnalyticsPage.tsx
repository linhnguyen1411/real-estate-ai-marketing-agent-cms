import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Analytics = {
  score: {
    coverage: number;
    accuracy: number;
    freshness: number;
    approvalRate: number;
    learningRate: number;
    overall: number;
  };
  topRules: Array<{
    keyword: string;
    category: string;
    matched: number;
    qualified: number;
    converted: number;
    accuracy: number;
    roi: string;
    status: string;
  }>;
  deadRules: Array<{ keyword: string; matched: number; lastMatchedAt: string | null }>;
  falsePositives: Array<{ keyword: string; matched: number; accuracy: number }>;
  falseNegatives: Array<{ term: string; count: number; suggestedConcept: string }>;
  topContributors: Array<{ keyword: string; sharePercent: number; qualified: number }>;
  locations: Array<{ label: string; matched: number; qualified: number; won: number }>;
  sources: Array<{
    label: string;
    scanned: number;
    qualified: number;
    roi: string;
    recommendation: string;
  }>;
  missions: Array<{ label: string; keyword: string; buyer: number; won: number; roi: string }>;
  recommendations: Array<{ kind: string; title: string; detail: string }>;
  coverage: {
    scanned: number;
    ruleMatchPercent: number;
    discardPercent: number;
    unknownPercent: number;
  };
  totals: {
    rulesTracked: number;
    deadCount: number;
    unknownCount: number;
    qualifiedTotal: number;
    convertedTotal: number;
  };
};

type Tab = 'score' | 'rules' | 'locations' | 'sources' | 'missions' | 'optimizer';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'score', label: 'Knowledge Score' },
  { id: 'rules', label: 'Rule Accuracy' },
  { id: 'locations', label: 'Locations' },
  { id: 'sources', label: 'Sources' },
  { id: 'missions', label: 'Missions' },
  { id: 'optimizer', label: 'Optimizer' },
];

function roiClass(roi: string) {
  if (roi === 'excellent' || roi === 'high') return 'text-emerald-300';
  if (roi === 'medium') return 'text-amber-300';
  return 'text-rose-300';
}

export default function KnowledgeAnalyticsPage({ canManage: _canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('score');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/knowledge/analytics');
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Load failed');
      setData(json.data as Analytics);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && !error) return <AgentPanelLoader />;
  if (error && !data) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!data) return <AgentPanelEmpty title="Knowledge Analytics" description="Chưa có dữ liệu đo." />;

  const s = data.score;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Knowledge Analytics</h2>
          <p className="text-sm text-slate-400">
            Đo hiệu quả Rule · không thêm AI · Overall {s.overall}
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

      {tab === 'score' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Coverage', `${s.coverage}%`],
              ['Accuracy', `${s.accuracy}%`],
              ['Freshness', `${s.freshness}%`],
              ['Approval Rate', `${s.approvalRate}%`],
              ['Learning Rate', `${s.learningRate}%`],
              ['Overall', s.overall],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-xs text-slate-500">Scanned</div>
              <div className="text-xl text-slate-100">{data.coverage.scanned}</div>
            </div>
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-xs text-slate-500">Rule Match</div>
              <div className="text-xl text-emerald-300">{data.coverage.ruleMatchPercent}%</div>
            </div>
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-xs text-slate-500">Dead Rules</div>
              <div className="text-xl text-rose-300">{data.totals.deadCount}</div>
            </div>
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-xs text-slate-500">Unknown</div>
              <div className="text-xl text-amber-300">{data.totals.unknownCount}</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-2">
              Top Contributors (≈80% buyer signal)
            </div>
            <div className="space-y-1 text-sm">
              {data.topContributors.slice(0, 20).map(r => (
                <div key={r.keyword} className="flex justify-between text-slate-300">
                  <span>{r.keyword}</span>
                  <span>
                    {r.qualified} · {r.sharePercent}%
                  </span>
                </div>
              ))}
              {!data.topContributors.length ? (
                <div className="text-slate-500">Chưa đủ dữ liệu — chạy Decision Engine để đo.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Rule</th>
                <th className="px-3 py-2 text-left">Matched</th>
                <th className="px-3 py-2 text-left">Qualified</th>
                <th className="px-3 py-2 text-left">Converted</th>
                <th className="px-3 py-2 text-left">Accuracy</th>
                <th className="px-3 py-2 text-left">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.topRules.map(r => (
                <tr key={`${r.category}-${r.keyword}`}>
                  <td className="px-3 py-2 text-slate-100">
                    <div>{r.keyword}</div>
                    <div className="text-xs text-slate-500">{r.category}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-200">{r.matched}</td>
                  <td className="px-3 py-2 text-slate-200">{r.qualified}</td>
                  <td className="px-3 py-2 text-slate-200">{r.converted}</td>
                  <td className="px-3 py-2 text-slate-100">{r.accuracy}%</td>
                  <td className={`px-3 py-2 font-semibold capitalize ${roiClass(r.roi)}`}>{r.roi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'locations' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-left">Matched</th>
                <th className="px-3 py-2 text-left">Qualified</th>
                <th className="px-3 py-2 text-left">Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.locations.map(l => (
                <tr key={l.label}>
                  <td className="px-3 py-2 text-slate-100">{l.label}</td>
                  <td className="px-3 py-2">{l.matched}</td>
                  <td className="px-3 py-2">{l.qualified}</td>
                  <td className="px-3 py-2">{l.won}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.locations.length ? <div className="p-4 text-slate-500 text-sm">Chưa có location stats.</div> : null}
        </div>
      )}

      {tab === 'sources' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Scanned</th>
                <th className="px-3 py-2 text-left">Qualified</th>
                <th className="px-3 py-2 text-left">ROI</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.sources.map(srow => (
                <tr key={srow.label}>
                  <td className="px-3 py-2 text-slate-100">{srow.label}</td>
                  <td className="px-3 py-2">{srow.scanned}</td>
                  <td className="px-3 py-2">{srow.qualified}</td>
                  <td className={`px-3 py-2 capitalize ${roiClass(srow.roi)}`}>{srow.roi}</td>
                  <td className="px-3 py-2 text-slate-400">{srow.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.sources.length ? <div className="p-4 text-slate-500 text-sm">Chưa có source stats.</div> : null}
        </div>
      )}

      {tab === 'missions' && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Mission / Keyword</th>
                <th className="px-3 py-2 text-left">Buyer</th>
                <th className="px-3 py-2 text-left">Won</th>
                <th className="px-3 py-2 text-left">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.missions.map(m => (
                <tr key={m.label}>
                  <td className="px-3 py-2 text-slate-100">
                    <div>{m.label}</div>
                    <div className="text-xs text-slate-500">{m.keyword}</div>
                  </td>
                  <td className="px-3 py-2">{m.buyer}</td>
                  <td className="px-3 py-2">{m.won}</td>
                  <td className={`px-3 py-2 capitalize ${roiClass(m.roi)}`}>{m.roi}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.missions.length ? <div className="p-4 text-slate-500 text-sm">Chưa có mission stats.</div> : null}
        </div>
      )}

      {tab === 'optimizer' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-2">Recommendations</div>
            {data.recommendations.map((r, i) => (
              <div key={`${r.title}-${i}`} className="border-b border-slate-800 py-2 last:border-0">
                <div className="text-sm text-slate-100">{r.title}</div>
                <div className="text-xs text-slate-500">{r.detail}</div>
              </div>
            ))}
            {!data.recommendations.length ? (
              <div className="text-sm text-slate-500">Chưa có đề xuất — cần thêm traffic Decision.</div>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-sm font-semibold text-rose-200 mb-2">Dead Rules</div>
              {data.deadRules.slice(0, 15).map(r => (
                <div key={r.keyword} className="text-sm text-slate-300">
                  {r.keyword}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-800 p-4">
              <div className="text-sm font-semibold text-amber-200 mb-2">False Positives</div>
              {data.falsePositives.slice(0, 15).map(r => (
                <div key={r.keyword} className="text-sm text-slate-300">
                  {r.keyword} · {r.matched} match · {r.accuracy}%
                </div>
              ))}
              <div className="text-sm font-semibold text-sky-200 mt-3 mb-2">False Negatives</div>
              {data.falseNegatives.slice(0, 10).map(r => (
                <div key={r.term} className="text-sm text-slate-300">
                  {r.term} ×{r.count} → {r.suggestedConcept}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
