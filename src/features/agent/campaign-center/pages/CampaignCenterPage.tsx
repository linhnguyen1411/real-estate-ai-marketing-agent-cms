import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type LivingCampaignLite = {
  id: string;
  name: string;
  goal: string;
  status: string;
  priority: string;
  propertyHint: string;
  state?: {
    progress?: { percent?: number };
    metrics?: {
      leadTotal?: number;
      leadVip?: number;
      missionsProposed?: number;
      contentSlots?: number;
    };
  };
  updatedAt: string;
};

const COLUMNS: Array<{ id: string; label: string }> = [
  { id: 'planning', label: 'Planning' },
  { id: 'researching', label: 'Research' },
  { id: 'mission_planning', label: 'Mission' },
  { id: 'finding_leads', label: 'Leads' },
  { id: 'content_drafting', label: 'Content' },
  { id: 'waiting_approval', label: 'Waiting Approval' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'optimizing', label: 'Optimizing' },
  { id: 'completed', label: 'Completed' },
];

async function fetchKanban(): Promise<Record<string, LivingCampaignLite[]>> {
  const res = await fetch('/api/planning/campaigns?kanban=1');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được Campaign Center');
  }
  return json.data as Record<string, LivingCampaignLite[]>;
}

async function postAction(id: string, action: 'approve' | 'reject' | 'complete') {
  const res = await fetch(`/api/planning/campaigns/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'admin-ui' }),
  });
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || `${action} failed`);
  }
}

export default function CampaignCenterPage({ canManage }: { canManage: boolean }) {
  const [board, setBoard] = useState<Record<string, LivingCampaignLite[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setBoard(await fetchKanban());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: 'approve' | 'reject' | 'complete') => {
    if (!canManage) return;
    setBusyId(id);
    setMessage('');
    try {
      await postAction(id, action);
      setMessage(`${action} OK — ${id.slice(0, 10)}…`);
      await load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!board) return <AgentPanelLoader label="Đang tải Campaign Center…" />;

  const total = Object.values(board).reduce((n, arr) => n + (arr?.length || 0), 0);
  if (!total) {
    return (
      <div className="space-y-3">
        <Header message={message} onRefresh={() => void load()} />
        <AgentPanelEmpty
          title="Chưa có living campaign"
          description='Nói với Copilot: "Hôm nay cần bán mạnh lô Mai Đăng Chơn" — Campaign Runtime sẽ tự chạy lifecycle.'
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header message={message} onRefresh={() => void load()} />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map(col => {
          const items = board[col.id] || [];
          return (
            <div
              key={col.id}
              className="min-w-[220px] max-w-[240px] flex-shrink-0 rounded-xl border border-slate-800 bg-slate-950/70"
            >
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <span className="text-xs font-semibold text-slate-200">{col.label}</span>
                <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {items.map(c => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/80 p-2.5 text-xs text-slate-300"
                  >
                    <div className="font-semibold text-slate-100">{c.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{c.propertyHint}</div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {c.priority} · {c.state?.progress?.percent ?? 0}% · L
                      {c.state?.metrics?.leadTotal ?? 0}/VIP{c.state?.metrics?.leadVip ?? 0}
                    </div>
                    {canManage && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.status === 'waiting_approval' && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              className="rounded bg-emerald-700/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              onClick={() => void run(c.id, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === c.id}
                              className="rounded bg-rose-800/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              onClick={() => void run(c.id, 'reject')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {(c.status === 'optimizing' || c.status === 'monitoring') && (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-white"
                            onClick={() => void run(c.id, 'complete')}
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!items.length && (
                  <div className="px-1 py-6 text-center text-[10px] text-slate-600">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Header({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Campaign Center</h2>
        <p className="text-xs text-slate-500">
          Kanban lifecycle — Planning → Research → Mission → Content → Approval → …
        </p>
        {message ? <p className="mt-1 text-[11px] text-emerald-400">{message}</p> : null}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200"
      >
        Refresh
      </button>
    </div>
  );
}
