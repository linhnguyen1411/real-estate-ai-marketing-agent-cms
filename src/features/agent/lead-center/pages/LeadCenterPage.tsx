import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type SalesProfile = {
  findingId: string;
  journeyStage: string;
  pipelineStage: string;
  owner: string | null;
  expectedCloseAt: string | null;
  probability: number;
  expectedDealTy: number | null;
  recommendation: { label: string; reason: string; urgency: string };
  followUp: { needsFollowUp: boolean; reason: string | null; suggestion: string | null };
  timeline: Array<{ at: string; kind: string; label: string; detail?: string | null }>;
  stageHistory: Array<{ at: string; from: string | null; to: string; reason?: string | null }>;
  mergedFindingIds: string[];
  signals: Array<{ kind: string; at: string }>;
};

type PipelineCard = {
  findingId: string;
  title: string;
  sales: SalesProfile;
  confidencePct: number;
  campaignName: string | null;
};

type Metrics = {
  detected: number;
  qualified: number;
  assigned: number;
  contacted: number;
  appointment: number;
  negotiating: number;
  won: number;
  lost: number;
  pipelineValueTy: number;
  estimatedRevenueTy: number;
  expectedRevenueTy: number;
  averageDealSizeTy: number;
  winRate: number;
  averageDays: number;
  needFollowUp: number;
  urgentBuyers: number;
  byCampaign: Array<{
    campaignId: string;
    name: string;
    leads: number;
    qualified: number;
    negotiating: number;
    closed: number;
    pipelineValueTy: number;
    expectedRevenueTy: number;
  }>;
  bySource: Array<{ sourceId: string; name: string; leads: number; won: number; pipelineValueTy: number }>;
};

const COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'detected', label: 'Detected' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'negotiating', label: 'Negotiating' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

function fmtTy(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? `${Math.round(n)} tỷ` : `${Math.round(n * 10) / 10} tỷ`;
}

async function fetchPipeline(): Promise<Record<string, PipelineCard[]>> {
  const res = await fetch('/api/sales/pipeline');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được Sales Pipeline');
  }
  return json.data as Record<string, PipelineCard[]>;
}

async function fetchMetrics(): Promise<Metrics> {
  const res = await fetch('/api/sales/metrics?sinceHours=720');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được metrics');
  }
  return json.data as Metrics;
}

async function patchStage(
  id: string,
  stage: string,
  extra?: { owner?: string; expectedCloseAt?: string; probability?: number },
) {
  const res = await fetch(`/api/sales/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, actor: 'admin-ui', ...extra }),
  });
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Stage update failed');
  }
}

async function postLearn(id: string, outcome: 'won' | 'lost' | 'spam' | 'wrong') {
  const res = await fetch(`/api/sales/${id}/learn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome, actor: 'admin-ui' }),
  });
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Learning failed');
  }
}

export default function LeadCenterPage({ canManage }: { canManage: boolean }) {
  const [board, setBoard] = useState<Record<string, PipelineCard[]> | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PipelineCard | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ownerDraft, setOwnerDraft] = useState('');
  const [closeDraft, setCloseDraft] = useState('');
  const [probDraft, setProbDraft] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, m] = await Promise.all([fetchPipeline(), fetchMetrics()]);
      setBoard(p);
      setMetrics(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setOwnerDraft(selected.sales.owner || '');
    setCloseDraft(selected.sales.expectedCloseAt?.slice(0, 10) || '');
    setProbDraft(String(Math.round((selected.sales.probability || 0) * 100)));
  }, [selected]);

  const move = async (id: string, stage: string) => {
    if (!canManage) return;
    setBusyId(id);
    setMessage('');
    try {
      await patchStage(id, stage);
      setMessage(`→ ${stage}`);
      await load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setBusyId(null);
      setDragId(null);
    }
  };

  const saveMeta = async () => {
    if (!canManage || !selected) return;
    setBusyId(selected.findingId);
    try {
      const p = Number(probDraft);
      await patchStage(selected.findingId, selected.sales.pipelineStage, {
        owner: ownerDraft || undefined,
        expectedCloseAt: closeDraft ? new Date(closeDraft).toISOString() : undefined,
        probability: Number.isFinite(p) ? p / 100 : undefined,
      });
      setMessage('Saved owner / close / probability');
      await load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const learn = async (id: string, outcome: 'won' | 'lost' | 'spam' | 'wrong') => {
    if (!canManage) return;
    setBusyId(id);
    try {
      await postLearn(id, outcome);
      setMessage(`Learned: ${outcome}`);
      await load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Learn failed');
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!board || !metrics) return <AgentPanelLoader label="Đang tải Lead Center…" />;

  const total = Object.values(board).reduce((n, arr) => n + (arr?.length || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Lead Center · Sales Pipeline</h2>
          <p className="text-[11px] text-slate-500">
            Lead = điểm bắt đầu · Buyer Journey → Closed · kéo thả để đổi stage
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
        >
          Refresh
        </button>
      </div>

      {message && <p className="text-xs text-emerald-400">{message}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Detected" value={metrics.detected} />
        <Metric label="Qualified" value={metrics.qualified} />
        <Metric label="Negotiating" value={metrics.negotiating} />
        <Metric label="Won" value={metrics.won} tone="ok" />
        <Metric label="Pipeline Value" value={fmtTy(metrics.pipelineValueTy)} />
        <Metric label="Expected Rev" value={fmtTy(metrics.expectedRevenueTy)} tone="ok" />
        <Metric label="Need Follow-up" value={metrics.needFollowUp} tone="warn" />
        <Metric label="Urgent" value={metrics.urgentBuyers} tone="warn" />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Avg Deal" value={fmtTy(metrics.averageDealSizeTy)} />
        <Metric label="Win Rate" value={`${metrics.winRate}%`} />
        <Metric label="Avg Days" value={metrics.averageDays} />
        <Metric label="Est. Revenue" value={fmtTy(metrics.estimatedRevenueTy)} />
      </div>

      {!total ? (
        <AgentPanelEmpty
          title="Chưa có buyer trong Sales Pipeline"
          description="Khi Lead Acquisition gắn buyer, Sales Layer sẽ tạo Journey + Memory + Pipeline card."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map(col => {
            const items = board[col.id] || [];
            return (
              <div
                key={col.id}
                className="min-w-[200px] max-w-[220px] flex-shrink-0 rounded-xl border border-slate-800 bg-slate-950/70"
                onDragOver={e => {
                  if (!canManage) return;
                  e.preventDefault();
                }}
                onDrop={e => {
                  if (!canManage || !dragId) return;
                  e.preventDefault();
                  void move(dragId, col.id);
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-200">{col.label}</span>
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 p-2 min-h-[80px]">
                  {items.map(card => (
                    <button
                      type="button"
                      key={card.findingId}
                      draggable={canManage}
                      onDragStart={() => setDragId(card.findingId)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setSelected(card)}
                      className={`w-full rounded-lg border p-2.5 text-left text-xs ${
                        selected?.findingId === card.findingId
                          ? 'border-rose-500/50 bg-rose-950/30'
                          : 'border-slate-800 bg-slate-900/80'
                      } ${dragId === card.findingId ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-100 truncate">
                          {card.title || card.findingId.slice(0, 8)}
                        </span>
                        <span className="text-[10px] text-amber-300">{card.confidencePct}%</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {card.sales.journeyStage} · p{Math.round(card.sales.probability * 100)}%
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                        <span className="truncate">{card.campaignName || '—'}</span>
                        <span>
                          {card.sales.expectedDealTy != null
                            ? fmtTy(card.sales.expectedDealTy)
                            : '—'}
                        </span>
                      </div>
                      {card.sales.followUp.needsFollowUp && (
                        <div className="mt-1 text-[10px] text-amber-400">⚠ follow-up</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-300">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">{selected.title}</h3>
              <p className="mt-1 text-slate-500">{selected.findingId}</p>
            </div>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-300"
              onClick={() => setSelected(null)}
            >
              Đóng
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              Journey: <b className="text-slate-100">{selected.sales.journeyStage}</b>
            </div>
            <div>
              Pipeline: <b className="text-slate-100">{selected.sales.pipelineStage}</b>
            </div>
            <div>
              Campaign: <b className="text-slate-100">{selected.campaignName || '—'}</b>
            </div>
            <div>
              Suggestion:{' '}
              <b className="text-slate-100">{selected.sales.recommendation.label}</b>
            </div>
            <div>
              Signals: {selected.sales.signals.length} · Merged:{' '}
              {selected.sales.mergedFindingIds.length}
            </div>
            <div>
              Deal:{' '}
              <b className="text-slate-100">
                {selected.sales.expectedDealTy != null
                  ? fmtTy(selected.sales.expectedDealTy)
                  : '—'}
              </b>
            </div>
          </div>
          <p className="mt-2 text-slate-500">{selected.sales.recommendation.reason}</p>

          {canManage && (
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-[10px] text-slate-500">Owner</span>
                <input
                  value={ownerDraft}
                  onChange={e => setOwnerDraft(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                  placeholder="sales owner"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-500">Expected Close</span>
                <input
                  type="date"
                  value={closeDraft}
                  onChange={e => setCloseDraft(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-500">Probability %</span>
                <input
                  value={probDraft}
                  onChange={e => setProbDraft(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={busyId === selected.findingId}
                  onClick={() => void saveMeta()}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-[11px] hover:bg-slate-900"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Timeline</h4>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {selected.sales.timeline.slice(-12).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="text-[11px] text-slate-400">
                    <span className="text-slate-500">{e.at.slice(0, 10)}</span> · {e.label}
                    {e.detail ? ` — ${e.detail.slice(0, 60)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                Stage History
              </h4>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {selected.sales.stageHistory.slice(-12).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="text-[11px] text-slate-400">
                    <span className="text-slate-500">{e.at.slice(0, 10)}</span> · {e.from || '—'} →{' '}
                    {e.to}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              {COLUMNS.filter(c => c.id !== selected.sales.pipelineStage).map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busyId === selected.findingId}
                  onClick={() => void move(selected.findingId, c.id)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-900"
                >
                  → {c.label}
                </button>
              ))}
              <button
                type="button"
                disabled={busyId === selected.findingId}
                onClick={() => void learn(selected.findingId, 'won')}
                className="rounded-md border border-emerald-700/50 px-2 py-1 text-[11px] text-emerald-300"
              >
                Won
              </button>
              <button
                type="button"
                disabled={busyId === selected.findingId}
                onClick={() => void learn(selected.findingId, 'lost')}
                className="rounded-md border border-slate-700 px-2 py-1 text-[11px]"
              >
                Lost
              </button>
              <button
                type="button"
                disabled={busyId === selected.findingId}
                onClick={() => void learn(selected.findingId, 'spam')}
                className="rounded-md border border-rose-800/50 px-2 py-1 text-[11px] text-rose-300"
              >
                Spam
              </button>
              <button
                type="button"
                disabled={busyId === selected.findingId}
                onClick={() => void learn(selected.findingId, 'wrong')}
                className="rounded-md border border-amber-800/40 px-2 py-1 text-[11px] text-amber-300"
              >
                Wrong Buyer
              </button>
            </div>
          )}
        </div>
      )}

      {(metrics.byCampaign.length > 0 || metrics.bySource.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
              Campaign Dashboard
            </div>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-1">Campaign</th>
                  <th className="px-2 py-1">Lead</th>
                  <th className="px-2 py-1">Qual</th>
                  <th className="px-2 py-1">Neg</th>
                  <th className="px-2 py-1">Closed</th>
                  <th className="px-2 py-1">PV</th>
                  <th className="px-2 py-1">ER</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byCampaign.map(c => (
                  <tr key={c.campaignId} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-200">{c.name}</td>
                    <td className="px-2 py-2">{c.leads}</td>
                    <td className="px-2 py-2">{c.qualified}</td>
                    <td className="px-2 py-2">{c.negotiating}</td>
                    <td className="px-2 py-2">{c.closed}</td>
                    <td className="px-2 py-2 text-slate-400">{fmtTy(c.pipelineValueTy)}</td>
                    <td className="px-2 py-2 text-slate-400">{fmtTy(c.expectedRevenueTy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
              Source ROI
            </div>
            <table className="w-full text-left text-xs">
              <tbody>
                {metrics.bySource.map(s => (
                  <tr key={s.sourceId} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-200">{s.name}</td>
                    <td className="px-3 py-2">{s.leads}</td>
                    <td className="px-3 py-2">Won {s.won}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtTy(s.pipelineValueTy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}
