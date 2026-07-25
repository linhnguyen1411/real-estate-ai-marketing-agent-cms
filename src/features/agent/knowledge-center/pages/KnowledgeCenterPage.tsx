import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Concept = {
  id: string;
  category: string;
  concept: string;
  aliases: string[];
  synonyms: string[];
  weight: number;
  campaignMapping: string | null;
  enabled: boolean;
  hitCount: number;
};

type UnknownTerm = {
  id: string;
  term: string;
  count: number;
  sampleTexts: string[];
};

type Suggestion = {
  id: string;
  term: string;
  proposedCategory: string;
  proposedConceptName: string;
  confidence: number;
  occurrences: number;
  reason: string;
};

type Snapshot = {
  concepts: Concept[];
  unknownTerms: UnknownTerm[];
  suggestions: Suggestion[];
  health: {
    buyerConcepts: number;
    sellerConcepts: number;
    locationAliases: number;
    propertyConcepts: number;
    unknownQueue: number;
    approvalPending: number;
    coveragePercent: number;
    totalConcepts: number;
    totalAliases: number;
  };
  coverage: {
    scanned: number;
    ruleMatchPercent: number;
    aiNeededPercent: number;
    discardPercent: number;
    unknownPercent: number;
  };
};

type Tab = 'overview' | 'concepts' | 'unknown' | 'suggestions';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Health' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'unknown', label: 'Unknown Terms' },
  { id: 'suggestions', label: 'Approve' },
];

export default function KnowledgeCenterPage({ canManage }: { canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    concept: '',
    category: 'buyer',
    aliases: '',
    weight: 30,
    campaignMapping: '',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/knowledge/snapshot');
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

  const saveConcept = async () => {
    if (!canManage || !draft.concept.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/knowledge/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: draft.concept,
          category: draft.category,
          aliases: draft.aliases.split(',').map(s => s.trim()).filter(Boolean),
          weight: draft.weight,
          campaignMapping: draft.campaignMapping || null,
          source: 'admin',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Save failed');
      setDraft({ concept: '', category: 'buyer', aliases: '', weight: 30, campaignMapping: '' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const mapUnknown = async (id: string, category: string) => {
    if (!canManage) return;
    setBusy(true);
    try {
      await fetch(`/api/knowledge/unknown/${id}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const resolveSug = async (id: string, action: 'approve' | 'reject') => {
    if (!canManage) return;
    setBusy(true);
    try {
      await fetch(`/api/knowledge/suggestions/${id}/${action}`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const exportLib = async () => {
    const res = await fetch('/api/knowledge/export');
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'knowledge-base.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!snap && !error) return <AgentPanelLoader />;
  if (error && !snap) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return <AgentPanelEmpty title="Knowledge Center" description="Chưa có knowledge." />;

  const h = snap.health;
  const c = snap.coverage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Knowledge Center</h2>
          <p className="text-sm text-slate-400">
            Self-learning Rule Engine · Rules compile from Knowledge · AI chỉ đề xuất
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void exportLib()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
          >
            Refresh
          </button>
        </div>
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
              ['Buyer Concepts', h.buyerConcepts],
              ['Seller Concepts', h.sellerConcepts],
              ['Location Aliases', h.locationAliases],
              ['Property Concepts', h.propertyConcepts],
              ['Unknown Queue', h.unknownQueue],
              ['Approval Pending', h.approvalPending],
              ['Coverage %', `${h.coveragePercent}%`],
              ['Total Aliases', h.totalAliases],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-2">Rule Coverage</div>
            <div className="grid gap-2 sm:grid-cols-5 text-sm">
              <div>
                <div className="text-slate-500">Scanned</div>
                <div className="text-slate-100">{c.scanned}</div>
              </div>
              <div>
                <div className="text-slate-500">Rule Match</div>
                <div className="text-emerald-300">{c.ruleMatchPercent}%</div>
              </div>
              <div>
                <div className="text-slate-500">AI Needed</div>
                <div className="text-sky-300">{c.aiNeededPercent}%</div>
              </div>
              <div>
                <div className="text-slate-500">Discard</div>
                <div className="text-rose-300">{c.discardPercent}%</div>
              </div>
              <div>
                <div className="text-slate-500">Unknown</div>
                <div className="text-amber-300">{c.unknownPercent}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'concepts' && (
        <div className="space-y-4">
          {canManage ? (
            <div className="grid gap-2 rounded-xl border border-slate-800 p-4 sm:grid-cols-6">
              <input
                value={draft.concept}
                onChange={e => setDraft(d => ({ ...d, concept: e.target.value }))}
                placeholder="Concept"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 sm:col-span-2"
              />
              <select
                value={draft.category}
                onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              >
                {['buyer', 'seller', 'broker', 'rent', 'spam', 'location', 'property', 'investor', 'signal'].map(
                  cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ),
                )}
              </select>
              <input
                value={draft.aliases}
                onChange={e => setDraft(d => ({ ...d, aliases: e.target.value }))}
                placeholder="aliases, comma-separated"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 sm:col-span-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveConcept()}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200"
              >
                Add
              </button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Concept</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Weight</th>
                  <th className="px-3 py-2 text-left">Aliases / Synonyms</th>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Hits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {snap.concepts.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-slate-100">{row.concept}</td>
                    <td className="px-3 py-2 text-slate-300">{row.category}</td>
                    <td className="px-3 py-2 text-slate-200">{row.weight}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {[...row.aliases, ...row.synonyms].join(', ')}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{row.campaignMapping || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{row.hitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'unknown' && (
        <div className="space-y-2">
          {snap.unknownTerms.map(term => (
            <div
              key={term.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
            >
              <div>
                <div className="font-semibold text-slate-100">
                  {term.term} <span className="text-xs text-slate-500">×{term.count}</span>
                </div>
                <div className="text-xs text-slate-500">{term.sampleTexts[0] || ''}</div>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-1">
                  {['buyer', 'seller', 'investor', 'location', 'property'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      disabled={busy}
                      onClick={() => void mapUnknown(term.id, cat)}
                      className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-rose-500/40"
                    >
                      → {cat}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!snap.unknownTerms.length ? (
            <div className="text-sm text-slate-500">Unknown queue trống.</div>
          ) : null}
        </div>
      )}

      {tab === 'suggestions' && (
        <div className="space-y-2">
          {snap.suggestions.map(s => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
            >
              <div className="text-sm text-slate-200">
                Đã phát hiện <span className="font-semibold text-rose-300">"{s.term}"</span> ·{' '}
                {s.occurrences} lần · Confidence {Math.round(s.confidence * 100)}%
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Đề xuất → {s.proposedConceptName} ({s.proposedCategory}) · {s.reason}
              </div>
              {canManage ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveSug(s.id, 'approve')}
                    className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void resolveSug(s.id, 'reject')}
                    className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {!snap.suggestions.length ? (
            <div className="text-sm text-slate-500">Không có suggestion pending.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
