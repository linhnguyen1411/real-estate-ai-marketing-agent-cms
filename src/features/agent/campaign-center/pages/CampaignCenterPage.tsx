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

type Workspace = {
  overview: {
    name: string;
    goal: string;
    priority: string;
    status: string;
    progressPercent: number;
    owner: string | null;
    propertyHint: string;
    confidence: number;
    roiNote: string;
  };
  health: { level: string; score: number; signals: string[] };
  research: {
    title?: string;
    summary?: string;
    competitors?: string[];
    trends?: string[];
    topKeywords?: string[];
    priceTrend?: string;
    demandTrend?: string;
    buyerSignals?: string[];
    suggestedPositioning?: string;
  } | null;
  missions: Array<{ id: string; name: string; priority: string; areaHint: string; intent: string }>;
  buyers: {
    candidates: number;
    vip: number;
    contacted: number;
    converted: number;
    leads: Array<{
      name: string;
      priority: string;
      leadStatus: string;
      budget: string;
      area: string;
      recommendation: string;
    }>;
  };
  content: {
    slots: number;
    approved: number;
    draft: number;
    scheduled: number;
    published: number;
    plan: { schedule?: Array<{ time: string; channel: string; format: string; topic: string }> } | null;
  };
  publish: {
    suggestedChannel: string | null;
    approved: boolean;
    successNote: string;
    proposal: { channel: string; note: string; approved: boolean } | null;
  };
  knowledge: {
    mappedConcepts: Array<{ id: string; name: string; campaignMapping: string | null }>;
    keywordHints: string[];
  };
  sales: {
    pipelineValueTy: number;
    expectedRevenueTy: number;
    negotiating: number;
    won: number;
    lost: number;
    nextAction: string | null;
  };
  orchestrator: {
    tasks: Array<{
      id: string;
      label: string;
      agent: string;
      status: string;
      dependencies: string[];
      resultSummary?: string | null;
      durationMs?: number | null;
    }>;
    progress: {
      total: number;
      completed: number;
      waitingApproval: number;
      stuck: unknown[];
      percent: number;
    };
    ready: string[];
  };
  trace: {
    traceId: string;
    status: string;
    durationMs: number | null;
    steps: Array<{
      step: string;
      status: string;
      startedAt: string;
      durationMs?: number;
      summary: string;
      errorReason?: string;
    }>;
  } | null;
  timeline: Array<{ at: string; title: string; detail?: string }>;
  recommendations: Array<{ message: string; severity: string; actionLabel?: string }>;
  aiThoughts: string;
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

const TABS = [
  'Overview',
  'Research',
  'Mission',
  'Buyer',
  'Content',
  'Publish',
  'Knowledge',
  'Sales',
  'Trace',
  'AI Thoughts',
] as const;

type Tab = (typeof TABS)[number];

async function fetchKanban(): Promise<Record<string, LivingCampaignLite[]>> {
  const res = await fetch('/api/planning/campaigns?kanban=1');
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được Campaign Center');
  }
  return json.data as Record<string, LivingCampaignLite[]>;
}

async function fetchWorkspace(id: string): Promise<Workspace> {
  const res = await fetch(`/api/planning/campaigns/${id}/workspace`);
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || 'Không tải được Campaign Workspace');
  }
  return json.data as Workspace;
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

function healthClass(level: string) {
  if (level === 'critical') return 'text-rose-400 border-rose-500/40 bg-rose-950/40';
  if (level === 'warning') return 'text-amber-300 border-amber-500/40 bg-amber-950/30';
  return 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30';
}

export default function CampaignCenterPage({ canManage }: { canManage: boolean }) {
  const [board, setBoard] = useState<Record<string, LivingCampaignLite[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [execAnalytics, setExecAnalytics] = useState<{
    totalTraces: number;
    successRate: number;
    averageDurationMs: number | null;
    mostFailedStep: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [kanban, analyticsRes] = await Promise.all([
        fetchKanban(),
        fetch('/api/execution-trace/analytics').then(r => r.json()).catch(() => null),
      ]);
      setBoard(kanban);
      if (analyticsRes?.status === 'success') setExecAnalytics(analyticsRes.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      setWorkspace(await fetchWorkspace(id));
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Workspace failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId) void loadWorkspace(selectedId);
  }, [selectedId, loadWorkspace]);

  const run = async (id: string, action: 'approve' | 'reject' | 'complete') => {
    if (!canManage) return;
    setBusyId(id);
    setMessage('');
    try {
      await postAction(id, action);
      setMessage(`${action} OK — ${id.slice(0, 10)}…`);
      await load();
      if (selectedId === id) await loadWorkspace(id);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!board) return <AgentPanelLoader label="Đang tải Campaign Workspace…" />;

  const total = Object.values(board).reduce((n, arr) => n + (arr?.length || 0), 0);
  if (!total) {
    return (
      <div className="space-y-3">
        <Header message={message} onRefresh={() => void load()} />
        <AgentPanelEmpty
          title="Chưa có living campaign"
          description='Nói với Copilot: "Hôm nay cần bán mạnh lô Mai Đăng Chơn" — Campaign Workspace sẽ trở thành trung tâm điều phối AI.'
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header message={message} onRefresh={() => void load()} />
      {execAnalytics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Traces', String(execAnalytics.totalTraces)],
            ['Success', `${execAnalytics.successRate}%`],
            ['Avg Duration', fmtDuration(execAnalytics.averageDurationMs)],
            ['Failed Step', execAnalytics.mostFailedStep || '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-500">{label}</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

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
                    onClick={() => {
                      setSelectedId(c.id);
                      setTab('Overview');
                    }}
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
                        {busyId === c.id ? <span className="text-[10px] text-slate-500">…</span> : null}
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

      {workspace && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Campaign Workspace — {workspace.overview.name}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {workspace.overview.propertyHint} · {workspace.overview.status} · Progress{' '}
                {workspace.overview.progressPercent}% · Confidence {workspace.overview.confidence}
              </p>
            </div>
            <span
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase ${healthClass(workspace.health.level)}`}
            >
              {workspace.health.level} · {workspace.health.score}
            </span>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 py-2">
            {TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  tab === t
                    ? 'bg-rose-600/90 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-4 text-xs text-slate-300">
            {tab === 'Overview' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Goal', workspace.overview.goal],
                  ['Priority', workspace.overview.priority],
                  ['Owner', workspace.overview.owner || 'AI Sales Employee'],
                  ['ROI / Revenue', workspace.overview.roiNote],
                  ['Research', workspace.research ? '✓' : '○'],
                  ['Mission', String(workspace.missions.length)],
                  ['Lead / VIP', `${workspace.buyers.candidates} / ${workspace.buyers.vip}`],
                  ['Draft / Published', `${workspace.content.draft} / ${workspace.content.published}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">{k}</div>
                    <div className="mt-1 font-semibold text-slate-100">{v}</div>
                  </div>
                ))}
                <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="text-[10px] uppercase text-slate-500">Health signals</div>
                  <ul className="mt-2 space-y-1 text-slate-400">
                    {workspace.health.signals.map(s => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {tab === 'Research' && (
              <div className="space-y-2">
                {workspace.research ? (
                  <>
                    <p className="font-semibold text-slate-100">{workspace.research.title}</p>
                    <p className="text-slate-400">{workspace.research.summary}</p>
                    <p>Price: {workspace.research.priceTrend || '—'} · Demand: {workspace.research.demandTrend || '—'}</p>
                    <p>Competitors: {(workspace.research.competitors || []).join(', ') || '—'}</p>
                    <p>Keywords: {(workspace.research.topKeywords || []).join(', ') || '—'}</p>
                    <p>Opportunities / trends: {(workspace.research.trends || []).join(' · ') || '—'}</p>
                    <p>Positioning: {workspace.research.suggestedPositioning || '—'}</p>
                  </>
                ) : (
                  <p className="text-slate-500">Chưa có research — Campaign vẫn chạy (business rule).</p>
                )}
              </div>
            )}

            {tab === 'Mission' && (
              <div className="space-y-2">
                {workspace.missions.length ? (
                  workspace.missions.map(m => (
                    <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <div className="font-semibold text-slate-100">{m.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {m.priority} · {m.areaHint} · {m.intent}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500">Chưa có mission đề xuất.</p>
                )}
              </div>
            )}

            {tab === 'Buyer' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Candidates', workspace.buyers.candidates],
                    ['VIP', workspace.buyers.vip],
                    ['Contacted', workspace.buyers.contacted],
                    ['Converted', workspace.buyers.converted],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-lg border border-slate-800 p-2">
                      <div className="text-[10px] text-slate-500">{k}</div>
                      <div className="text-lg font-bold text-slate-100">{v}</div>
                    </div>
                  ))}
                </div>
                {workspace.buyers.leads.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <div className="font-semibold text-slate-100">
                      {l.name}{' '}
                      <span className="text-[10px] uppercase text-slate-500">
                        {l.leadStatus} · {l.priority}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-400">
                      {l.budget} · {l.area}
                    </div>
                    <div className="mt-1 text-emerald-400/90">{l.recommendation}</div>
                  </div>
                ))}
                {!workspace.buyers.leads.length && (
                  <p className="text-slate-500">Không có lead — Campaign vẫn là trung tâm điều phối.</p>
                )}
              </div>
            )}

            {tab === 'Content' && (
              <div className="space-y-2">
                <p>
                  Draft {workspace.content.draft} · Approved {workspace.content.approved} · Scheduled{' '}
                  {workspace.content.scheduled} · Published {workspace.content.published}
                </p>
                {(workspace.content.plan?.schedule || []).map((s, i) => (
                  <div key={`${s.topic}-${i}`} className="rounded-lg border border-slate-800 p-2">
                    {s.time} · {s.channel} · {s.format} — {s.topic}
                  </div>
                ))}
                {!workspace.content.plan?.schedule?.length && (
                  <p className="text-slate-500">Chưa có content plan.</p>
                )}
              </div>
            )}

            {tab === 'Publish' && (
              <div className="space-y-2">
                <p>Channel đề xuất: {workspace.publish.suggestedChannel || '—'}</p>
                <p>Approved: {workspace.publish.approved ? 'Yes' : 'No'}</p>
                <p className="text-slate-400">{workspace.publish.successNote}</p>
                {workspace.publish.proposal ? (
                  <p className="rounded-lg border border-slate-800 p-3">{workspace.publish.proposal.note}</p>
                ) : (
                  <p className="text-slate-500">Chưa có publish proposal — Campaign vẫn research được.</p>
                )}
              </div>
            )}

            {tab === 'Knowledge' && (
              <div className="space-y-2">
                <p>Keywords: {workspace.knowledge.keywordHints.join(', ') || '—'}</p>
                {workspace.knowledge.mappedConcepts.map(c => (
                  <div key={c.id} className="rounded-lg border border-slate-800 p-2">
                    {c.name}
                    {c.campaignMapping ? (
                      <span className="text-slate-500"> → {c.campaignMapping}</span>
                    ) : null}
                  </div>
                ))}
                {!workspace.knowledge.mappedConcepts.length && (
                  <p className="text-slate-500">Chưa map knowledge concept — soft-link by name/hint.</p>
                )}
              </div>
            )}

            {tab === 'Sales' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Pipeline', `${workspace.sales.pipelineValueTy.toFixed(1)} tỷ`],
                  ['Expected', `${workspace.sales.expectedRevenueTy.toFixed(1)} tỷ`],
                  ['Negotiating', String(workspace.sales.negotiating)],
                  ['Won', String(workspace.sales.won)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-800 p-3">
                    <div className="text-[10px] text-slate-500">{k}</div>
                    <div className="text-lg font-bold text-slate-100">{v}</div>
                  </div>
                ))}
                <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-slate-800 p-3">
                  Next action: {workspace.sales.nextAction || '—'}
                </div>
              </div>
            )}

            {tab === 'Trace' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 font-semibold text-slate-100">
                    Orchestrator {workspace.orchestrator.progress.completed}/
                    {workspace.orchestrator.progress.total} · {workspace.orchestrator.progress.percent}%
                  </h4>
                  <div className="space-y-2">
                    {workspace.orchestrator.tasks.map(t => (
                      <div key={t.id} className="rounded-lg border border-slate-800 p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-100">{t.label}</span>
                          <span className="text-[10px] uppercase text-slate-500">{t.status}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {t.agent} · {fmtDuration(t.durationMs)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 font-semibold text-slate-100">Execution Trace</h4>
                  {workspace.trace?.steps?.length ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {workspace.trace.steps.map((s, i) => (
                        <div key={`${s.step}-${i}`} className="border-l border-slate-700 pl-3">
                          <div className="font-semibold text-slate-100">
                            {s.step}{' '}
                            <span className="text-[10px] font-normal uppercase text-slate-500">
                              {s.status}
                            </span>
                          </div>
                          <div className="text-slate-400">{s.summary}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">Chưa có execution trace.</p>
                  )}
                  <h4 className="mb-2 mt-4 font-semibold text-slate-100">Timeline</h4>
                  <div className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                    {(workspace.timeline || []).slice(-15).map((e, i) => (
                      <div key={`${e.at}-${i}`}>
                        <span className="text-slate-500">
                          {new Date(e.at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </span>{' '}
                        {e.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'AI Thoughts' && (
              <div className="space-y-3">
                <p className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm leading-6 text-slate-100">
                  {workspace.aiThoughts}
                </p>
                <div className="space-y-2">
                  {workspace.recommendations.map((r, i) => (
                    <div key={`${r.message}-${i}`} className="rounded-lg border border-slate-800 p-3">
                      <span className="text-[10px] uppercase text-slate-500">{r.severity}</span>
                      <div className="font-semibold text-slate-100">{r.message}</div>
                      {r.actionLabel ? <div className="text-slate-400">{r.actionLabel}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
        <h2 className="text-sm font-bold text-slate-100">Campaign Workspace</h2>
        <p className="text-xs text-slate-500">
          AI Sales operating center — Research · Mission · Buyer · Content · Publish · Sales · Trace
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
