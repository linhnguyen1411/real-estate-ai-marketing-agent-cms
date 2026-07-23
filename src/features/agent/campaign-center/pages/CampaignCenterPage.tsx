import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type OrchestratorTask = {
  id: string;
  key: string;
  label: string;
  agent: string;
  status: string;
  dependencies: string[];
  resultSummary?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  retryCount?: number;
};

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
    orchestratorTasks?: OrchestratorTask[];
    operationalMemory?: Array<{ at: string; title: string; detail?: string }>;
  };
  updatedAt: string;
};

type TaskDetail = {
  campaignId: string;
  name: string;
  status: string;
  tasks: OrchestratorTask[];
  progress: {
    total: number;
    completed: number;
    running: number;
    waitingApproval: number;
    failed: number;
    pending: number;
    percent: number;
    stuck: OrchestratorTask[];
  };
  ready: string[];
  timeline: Array<{ at: string; title: string; detail?: string }>;
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

async function fetchTasks(id: string): Promise<TaskDetail> {
  const res = await fetch(`/api/planning/campaigns/${id}/tasks`);
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được tasks');
  }
  return json.data as TaskDetail;
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

function fmtDuration(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function CampaignCenterPage({ canManage }: { canManage: boolean }) {
  const [board, setBoard] = useState<Record<string, LivingCampaignLite[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBoard(await fetchKanban());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await fetchTasks(id));
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Detail failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const run = async (id: string, action: 'approve' | 'reject' | 'complete') => {
    if (!canManage) return;
    setBusyId(id);
    setMessage('');
    try {
      await postAction(id, action);
      setMessage(`${action} OK — ${id.slice(0, 10)}…`);
      await load();
      if (selectedId === id) await loadDetail(id);
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
          description='Nói với Copilot: "Hôm nay cần bán mạnh lô Mai Đăng Chơn" — Campaign Runtime + Task Orchestrator sẽ tự chạy.'
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
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full rounded-lg border p-2.5 text-left text-xs text-slate-300 ${
                      selectedId === c.id
                        ? 'border-rose-500/50 bg-rose-950/30'
                        : 'border-slate-800 bg-slate-900/80'
                    }`}
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
                            <span
                              role="button"
                              className="rounded bg-emerald-700/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              onClick={e => {
                                e.stopPropagation();
                                void run(c.id, 'approve');
                              }}
                            >
                              Approve
                            </span>
                            <span
                              role="button"
                              className="rounded bg-rose-800/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                              onClick={e => {
                                e.stopPropagation();
                                void run(c.id, 'reject');
                              }}
                            >
                              Reject
                            </span>
                          </>
                        )}
                        {(c.status === 'optimizing' || c.status === 'monitoring') && (
                          <span
                            role="button"
                            className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-white"
                            onClick={e => {
                              e.stopPropagation();
                              void run(c.id, 'complete');
                            }}
                          >
                            Complete
                          </span>
                        )}
                        {busyId === c.id ? (
                          <span className="text-[10px] text-slate-500">…</span>
                        ) : null}
                      </div>
                    )}
                  </button>
                ))}
                {!items.length && (
                  <div className="px-1 py-6 text-center text-[10px] text-slate-600">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-100">
              Task Progress — {detail.name}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              {detail.progress.completed}/{detail.progress.total} done · waiting{' '}
              {detail.progress.waitingApproval} · stuck {detail.progress.stuck.length} ·{' '}
              {detail.progress.percent}%
            </p>
            <div className="mt-3 space-y-2">
              {detail.tasks.map(t => (
                <div
                  key={t.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{t.label}</span>
                    <span className="text-[10px] uppercase text-slate-400">{t.status}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    agent={t.agent} · duration={fmtDuration(t.durationMs)} · deps=
                    {t.dependencies.length ? t.dependencies.map(d => d.split('_').pop()).join(' → ') : '—'}
                  </div>
                  {t.resultSummary ? (
                    <div className="mt-1 text-[10px] text-emerald-400/90">{t.resultSummary}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="text-sm font-bold text-slate-100">Task Dependency</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-slate-400">
                {detail.tasks.map(t => (
                  <li key={t.id}>
                    <span className="text-slate-200">{t.label}</span>{' '}
                    <span className="text-slate-600">[{t.status}]</span>
                  </li>
                ))}
              </ol>
              {detail.ready.length ? (
                <p className="mt-2 text-[10px] text-amber-400">Ready: {detail.ready.join(', ')}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <h3 className="text-sm font-bold text-slate-100">Task Timeline</h3>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                {(detail.timeline || []).slice(-20).map((e, i) => (
                  <div key={`${e.at}-${i}`}>
                    <span className="text-slate-500">
                      {new Date(e.at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </span>{' '}
                    <span className="text-slate-200">{e.title}</span>
                    {e.detail ? <span className="text-slate-500"> — {e.detail}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Campaign Center</h2>
        <p className="text-xs text-slate-500">
          Kanban + Task Orchestrator — click campaign để xem Task Timeline / Dependency / Duration
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
