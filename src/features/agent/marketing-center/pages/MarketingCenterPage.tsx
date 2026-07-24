import React, { useCallback, useEffect, useState } from 'react';
import { AgentPanelEmpty, AgentPanelError, AgentPanelLoader } from '../../shared/AgentPlatformUi';

type Snapshot = {
  packs: Array<{
    id: string;
    seedTopic: string;
    status: string;
    variants: Array<{ channel: string; kind: string; title: string; body: string; cta?: string | null }>;
  }>;
  calendar: Array<{ weekday: number; label: string; theme: string; format: string; topicHint: string; channels: string[] }>;
  reusePlans: Array<{ id: string; sourceTitle: string; cuts: Array<{ channel: string; title: string }> }>;
  conversationQueue: Array<{ id: string; text: string; label: string; reason: string; priority: number }>;
  trends: Array<{ topic: string; score: number; suggestion: string }>;
  seoGaps: Array<{ kind: string; title: string; task: string }>;
  health: {
    healthScore: number;
    contentProduced: number;
    published: number;
    reused: number;
    comments: number;
    needReply: number;
    buyerConversations: number;
    trendingTopics: number;
    seoGaps: number;
    reach: number;
    engagement: number;
    ctr: number;
    recommendation: string;
  };
  learning: { bestFormats: string[]; bestHours: string[]; bestCtas: string[]; notes: string[] };
};

type Tab =
  | 'overview'
  | 'calendar'
  | 'factory'
  | 'library'
  | 'trends'
  | 'conversation'
  | 'seo'
  | 'distribution';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'factory', label: 'Content Factory' },
  { id: 'library', label: 'Library / Reuse' },
  { id: 'trends', label: 'Trend Board' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'seo', label: 'SEO Board' },
  { id: 'distribution', label: 'Distribution' },
];

export default function MarketingCenterPage({ canManage }: { canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [topic, setTopic] = useState('Mai Đăng Chơn');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/marketing-org/snapshot?topic=${encodeURIComponent(topic)}`);
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Load failed');
      setSnap(json.data as Snapshot);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, [topic]);

  useEffect(() => {
    void load();
  }, [load]);

  const runFactory = async () => {
    if (!canManage) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/marketing-org/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, campaignHint: topic }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Factory failed');
      setMessage(`Factory pack ${json.data.id} · ${json.data.variants.length} variants`);
      await load();
      setTab('factory');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Factory failed');
    } finally {
      setBusy(false);
    }
  };

  const runReuse = async () => {
    if (!canManage) return;
    setBusy(true);
    try {
      const res = await fetch('/api/marketing-org/reuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTitle: `Video tour ${topic}`, topic }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'Reuse failed');
      setMessage(`Reuse plan ${json.data.id} · ${json.data.cuts.length} cuts`);
      await load();
      setTab('library');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Reuse failed');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <AgentPanelError message={error} onRetry={() => void load()} />;
  if (!snap) return <AgentPanelLoader label="Đang tải Marketing Center…" />;

  const h = snap.health;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Marketing Center</h2>
          <p className="text-[11px] text-slate-500">
            Omnichannel Marketing Organization · Publisher chỉ là Executor
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            placeholder="Topic / Campaign"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Refresh
          </button>
          {canManage && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runFactory()}
                className="rounded-lg border border-rose-700/40 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-200"
              >
                Run Factory
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runReuse()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                Reuse Video
              </button>
            </>
          )}
        </div>
      </div>

      {message && <p className="text-xs text-emerald-400">{message}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Health" value={`${h.healthScore}%`} tone="ok" />
        <Metric label="Content" value={h.contentProduced} />
        <Metric label="Published" value={h.published} />
        <Metric label="Reused" value={h.reused} />
        <Metric label="Need Reply" value={h.needReply} tone="warn" />
        <Metric label="Buyer Conv" value={h.buyerConversations} tone="ok" />
        <Metric label="Trends" value={h.trendingTopics} />
        <Metric label="SEO Gaps" value={h.seoGaps} tone="warn" />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
              tab === t.id
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'text-slate-500 border border-transparent hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-3">
          <Panel title="Recommendation">
            <p className="text-sm text-slate-200">{h.recommendation}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              Reach {h.reach} · Engagement {h.engagement} · CTR {h.ctr}%
            </p>
          </Panel>
          <Panel title="Learning">
            <p className="text-[11px] text-slate-400">
              Formats: {snap.learning.bestFormats.join(' · ') || '—'}
            </p>
            <p className="text-[11px] text-slate-400">
              Hours: {snap.learning.bestHours.join(' · ') || '—'}
            </p>
            <p className="text-[11px] text-slate-400">
              CTAs: {snap.learning.bestCtas.join(' · ') || '—'}
            </p>
          </Panel>
          <FunnelStrip />
        </div>
      )}

      {tab === 'calendar' && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {snap.calendar.map(slot => (
            <div key={slot.weekday} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-xs font-semibold text-slate-100">{slot.label}</div>
              <div className="mt-1 text-[11px] text-slate-500">{slot.format}</div>
              <div className="mt-2 text-[11px] text-slate-300">{slot.topicHint}</div>
              <div className="mt-2 text-[10px] text-slate-500">{slot.channels.join(' · ')}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'factory' && (
        <div className="space-y-3">
          {!snap.packs.length ? (
            <AgentPanelEmpty title="Chưa có pack" description="Bấm Run Factory để sinh omnichannel content." />
          ) : (
            snap.packs.slice(0, 3).map(pack => (
              <Panel key={pack.id} title={`${pack.seedTopic} · ${pack.variants.length} variants`}>
                <div className="grid gap-2 md:grid-cols-2">
                  {pack.variants.map(v => (
                    <div key={`${pack.id}-${v.channel}-${v.kind}`} className="rounded-lg border border-slate-800 p-2">
                      <div className="text-[11px] font-semibold text-rose-200">
                        {v.channel} · {v.kind}
                      </div>
                      <div className="mt-1 text-xs text-slate-200">{v.title}</div>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-500 max-h-24 overflow-y-auto">
                        {v.body}
                      </pre>
                    </div>
                  ))}
                </div>
              </Panel>
            ))
          )}
        </div>
      )}

      {tab === 'library' && (
        <div className="space-y-2">
          {snap.reusePlans.map(plan => (
            <Panel key={plan.id} title={`Reuse · ${plan.sourceTitle}`}>
              <ul className="space-y-1">
                {plan.cuts.map(c => (
                  <li key={c.title} className="text-[11px] text-slate-400">
                    {c.channel}: {c.title}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {tab === 'trends' && (
        <div className="space-y-2">
          {snap.trends.map(t => (
            <div key={t.topic} className="rounded-xl border border-slate-800 px-3 py-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-100">{t.topic}</span>
                <span className="text-amber-300">{t.score}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{t.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'conversation' && (
        <div className="space-y-2">
          {snap.conversationQueue.slice(0, 25).map(c => (
            <div key={c.id} className="rounded-xl border border-slate-800 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    c.label === 'buyer'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : c.label === 'spam'
                        ? 'bg-rose-900/40 text-rose-300'
                        : c.label === 'inbox'
                          ? 'bg-amber-900/40 text-amber-300'
                          : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {c.label}
                </span>
                <span className="text-[10px] text-slate-500">p{c.priority}</span>
              </div>
              <p className="mt-1 text-slate-300 line-clamp-2">{c.text}</p>
              <p className="mt-1 text-[10px] text-slate-500">{c.reason}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'seo' && (
        <div className="space-y-2">
          {snap.seoGaps.map(g => (
            <div key={g.title} className="rounded-xl border border-slate-800 px-3 py-2">
              <div className="text-[10px] uppercase text-slate-500">{g.kind}</div>
              <div className="text-xs font-semibold text-slate-100">{g.title}</div>
              <p className="mt-1 text-[11px] text-slate-400">Task: {g.task}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'distribution' && (
        <Panel title="Distribution Board">
          <p className="text-xs text-slate-300">
            Published {h.published} · Content produced {h.contentProduced} · Reused {h.reused}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Publisher vẫn là executor — duyệt draft / schedule tại mục Đăng bài. Marketing Org lập
            pack + calendar + reuse rồi bàn giao.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Reach" value={h.reach} />
            <Metric label="Engagement" value={h.engagement} />
            <Metric label="CTR %" value={h.ctr} />
            <Metric label="Comments" value={h.comments} />
          </div>
        </Panel>
      )}
    </div>
  );
}

function FunnelStrip() {
  const stages = [
    'Research',
    'Strategy',
    'Content',
    'Distribute',
    'Engage',
    'Conversation',
    'Lead',
    'Buyer',
    'Convert',
    'Learn',
  ];
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {stages.map((s, i) => (
        <div
          key={s}
          className="min-w-[88px] rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-2 text-center"
        >
          <div className="text-[10px] text-slate-500">{i + 1}</div>
          <div className="text-[11px] font-semibold text-slate-200">{s}</div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <h3 className="mb-2 text-xs font-semibold text-slate-200">{title}</h3>
      {children}
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
  tone?: 'ok' | 'warn';
}) {
  const cls =
    tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${cls}`}>{value}</div>
    </div>
  );
}
