import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Priority = {
  finalScore: number;
  urgency: number;
  campaignMatch: number;
};

type LeadProfile = {
  findingId: string;
  pipelineStage: string;
  intent: { intent: string; confidence: number };
  persona: { persona: string };
  timeline: string;
  campaignMatch: { campaignName: string | null; matchScore: number };
  priority: Priority;
  action: { label: string; reason: string };
  isBuyer: boolean;
  isVip: boolean;
};

type PipelineCard = {
  findingId: string;
  title: string;
  profile: LeadProfile;
};

type Metrics = {
  buyerCandidates: number;
  qualifiedBuyers: number;
  vipBuyers: number;
  assigned: number;
  converted: number;
  contacted: number;
  lost: number;
  byCampaign: Array<{ campaignId: string; name: string; leads: number; vip: number }>;
  bySource: Array<{ sourceId: string; name: string; leads: number }>;
};

const COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'candidate', label: 'Candidate' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'interested', label: 'Interested' },
  { id: 'negotiating', label: 'Negotiating' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

async function fetchPipeline(): Promise<Record<string, PipelineCard[]>> {
  const res = await fetch('/api/lead-acquisition/pipeline');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được Lead Center');
  }
  return json.data as Record<string, PipelineCard[]>;
}

async function fetchMetrics(): Promise<Metrics> {
  const res = await fetch('/api/lead-acquisition/metrics?sinceHours=24');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được metrics');
  }
  return json.data as Metrics;
}

async function patchStage(id: string, stage: string) {
  const res = await fetch(`/api/lead-acquisition/${id}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, actor: 'admin-ui' }),
  });
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Stage update failed');
  }
}

async function postLearn(id: string, outcome: 'won' | 'lost' | 'spam' | 'wrong') {
  const res = await fetch(`/api/lead-acquisition/${id}/learn`, {
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
          <h2 className="text-sm font-bold text-slate-100">Lead Center</h2>
          <p className="text-[11px] text-slate-500">
            KPI = Buyer thật · Scanner chỉ là input · Pipeline sales
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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Buyer Candidates" value={metrics.buyerCandidates} />
        <Metric label="Qualified" value={metrics.qualifiedBuyers} />
        <Metric label="VIP" value={metrics.vipBuyers} tone="vip" />
        <Metric label="Assigned" value={metrics.assigned} />
        <Metric label="Contacted" value={metrics.contacted} />
        <Metric label="Converted" value={metrics.converted} tone="ok" />
        <Metric label="Lost" value={metrics.lost} tone="bad" />
      </div>

      {!total ? (
        <AgentPanelEmpty
          title="Chưa có buyer lead"
          description="Khi scanner tạo finding, Intent Engine sẽ gắn profile leadAcquisition và đổ vào pipeline."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map(col => {
            const items = board[col.id] || [];
            return (
              <div
                key={col.id}
                className="min-w-[200px] max-w-[220px] flex-shrink-0 rounded-xl border border-slate-800 bg-slate-950/70"
              >
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-200">{col.label}</span>
                  <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 p-2">
                  {items.map(card => (
                    <button
                      type="button"
                      key={card.findingId}
                      onClick={() => setSelected(card)}
                      className={`w-full rounded-lg border p-2.5 text-left text-xs ${
                        selected?.findingId === card.findingId
                          ? 'border-rose-500/50 bg-rose-950/30'
                          : 'border-slate-800 bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-slate-100 truncate">
                          {card.title || card.findingId.slice(0, 8)}
                        </span>
                        {card.profile.isVip && (
                          <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">
                            VIP
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {card.profile.intent.intent} · {card.profile.persona.persona}
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                        <span>{card.profile.campaignMatch.campaignName || '—'}</span>
                        <span>{card.profile.priority.finalScore}</span>
                      </div>
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
              Intent: <b className="text-slate-100">{selected.profile.intent.intent}</b> (
              {Math.round(selected.profile.intent.confidence * 100)}%)
            </div>
            <div>
              Timeline: <b className="text-slate-100">{selected.profile.timeline}</b>
            </div>
            <div>
              Campaign:{' '}
              <b className="text-slate-100">
                {selected.profile.campaignMatch.campaignName || '—'}
              </b>
            </div>
            <div>
              Action: <b className="text-slate-100">{selected.profile.action.label}</b>
            </div>
          </div>
          <p className="mt-2 text-slate-500">{selected.profile.action.reason}</p>
          {canManage && (
            <div className="mt-3 flex flex-wrap gap-2">
              {COLUMNS.filter(c => c.id !== selected.profile.pipelineStage).map(c => (
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
                Wrong
              </button>
            </div>
          )}
        </div>
      )}

      {(metrics.byCampaign.length > 0 || metrics.bySource.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <RoiTable
            title="Campaign ROI (leads 24h)"
            rows={metrics.byCampaign.map(c => ({
              name: c.name,
              leads: c.leads,
              extra: `VIP ${c.vip}`,
            }))}
          />
          <RoiTable
            title="Lead Source ROI (24h)"
            rows={metrics.bySource.map(s => ({
              name: s.name,
              leads: s.leads,
              extra: '',
            }))}
          />
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
  value: number;
  tone?: 'vip' | 'ok' | 'bad';
}) {
  const toneCls =
    tone === 'vip'
      ? 'text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-300'
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

function RoiTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; leads: number; extra: string }>;
}) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="p-3 text-xs text-slate-500">Chưa có dữ liệu</p>
      ) : (
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-200">{r.name}</td>
                <td className="px-3 py-2 text-slate-400">{r.leads}</td>
                <td className="px-3 py-2 text-slate-500">{r.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
