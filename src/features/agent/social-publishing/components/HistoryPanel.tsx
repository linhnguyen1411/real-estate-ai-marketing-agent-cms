import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, ScrollText } from 'lucide-react';
import {
  fetchJobAttempts,
  fetchSocialAudit,
  fetchSocialJobs,
} from '../../../../services/socialPublishingApi';
import type {
  SocialPublishAttempt,
  SocialPublishAuditLog,
  SocialPublishJob,
} from '../../../../types/socialPublishing';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

function readPostUrl(job: SocialPublishJob): string | null {
  const result = (job.result || {}) as Record<string, unknown>;
  const url = result.facebookPostUrl || result.externalUrl;
  if (typeof url === 'string' && url.trim()) return url;
  const postId = result.facebookPostId || result.externalPostId;
  if (typeof postId === 'string' && postId.trim() && !postId.startsWith('dry_run_')) {
    return `https://www.facebook.com/${postId}`;
  }
  return null;
}

function attemptStatusClass(status: string) {
  const map: Record<string, string> = {
    success: 'bg-emerald-900/50 text-emerald-300',
    failed: 'bg-rose-900/50 text-rose-300',
    timeout: 'bg-amber-900/50 text-amber-300',
    started: 'bg-sky-900/50 text-sky-300',
  };
  return map[status] || 'bg-slate-800 text-slate-400';
}

function JsonExpand({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value == null) {
    return <span className="text-slate-600">—</span>;
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[10px] font-bold text-slate-400 hover:text-slate-200"
      >
        {open ? 'Hide' : 'Show'} {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-[10px] text-slate-400">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

type Props = {
  canManage: boolean;
  onMessage: (msg: string) => void;
};

export default function HistoryPanel({ onMessage }: Props) {
  const [jobs, setJobs] = useState<SocialPublishJob[]>([]);
  const [audit, setAudit] = useState<SocialPublishAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [attemptsByJob, setAttemptsByJob] = useState<Record<string, SocialPublishAttempt[]>>({});
  const [attemptsLoading, setAttemptsLoading] = useState<string | null>(null);
  const [auditJobId, setAuditJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await fetchSocialJobs({});
      const history = all
        .filter(j => ['published', 'failed', 'cancelled', 'skipped'].includes(j.status))
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.updatedAt).getTime() -
            new Date(a.completedAt || a.updatedAt).getTime(),
        );
      setJobs(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch sử.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAttempts = async (job: SocialPublishJob) => {
    if (expandedJobId === job.id) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(job.id);
    if (attemptsByJob[job.id]) return;
    setAttemptsLoading(job.id);
    try {
      const attempts = await fetchJobAttempts(job.id);
      setAttemptsByJob(prev => ({ ...prev, [job.id]: attempts }));
      onMessage(`Attempts: ${attempts.length} cho job.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Không tải được attempts.');
      setAttemptsByJob(prev => ({ ...prev, [job.id]: [] }));
    } finally {
      setAttemptsLoading(null);
    }
  };

  const openAudit = async (job: SocialPublishJob) => {
    setAuditJobId(job.id);
    try {
      const logs = await fetchSocialAudit({
        entityType: 'SocialPublishJob',
        entityId: job.id,
      });
      setAudit(logs);
      onMessage(`Audit: ${logs.length} sự kiện.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Không tải được audit.');
      setAudit([]);
    }
  };

  if (loading && jobs.length === 0) {
    return <AgentPanelLoader label="Đang tải logs..." />;
  }
  if (error && jobs.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Logs"
        subtitle="Publish attempts — post URL, lỗi, request/response (đã sanitize)"
        onRefresh={load}
        refreshing={loading}
      />

      {jobs.length === 0 ? (
        <AgentPanelEmpty title="Chưa có logs" description="Jobs đã kết thúc sẽ hiện ở đây." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3">Thời gian</th>
                <th className="px-3 py-3">Draft / Kênh</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Post URL</th>
                <th className="px-3 py-3">Lỗi</th>
                <th className="px-3 py-3">Audit</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const postUrl = readPostUrl(job);
                const expanded = expandedJobId === job.id;
                const attempts = attemptsByJob[job.id] || [];
                return (
                  <React.Fragment key={job.id}>
                    <tr className="border-t border-slate-800 hover:bg-slate-900/40">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleAttempts(job)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          title="Xem attempts"
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">
                        {formatAgentDate(job.completedAt || job.updatedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-slate-200">
                          {job.draft?.title || job.draftId.slice(0, 8)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {job.channel?.name || job.channelId.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            job.status === 'published'
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : job.status === 'failed'
                                ? 'bg-rose-900/50 text-rose-300'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {postUrl ? (
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> View Facebook Post
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-3 py-3 text-xs text-rose-300">
                        {job.errorCode
                          ? `${job.errorCode}${job.errorMessage ? `: ${job.errorMessage}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openAudit(job)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                        >
                          <ScrollText className="h-3 w-3" /> Audit
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-slate-800/50 bg-slate-950/50">
                        <td colSpan={7} className="px-3 py-3">
                          {attemptsLoading === job.id ? (
                            <p className="text-xs text-slate-500">Đang tải attempts…</p>
                          ) : attempts.length === 0 ? (
                            <p className="text-xs text-slate-500">Không có attempt logs.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-800">
                              <table className="w-full min-w-[1100px] text-left text-xs">
                                <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500">
                                  <tr>
                                    <th className="px-2 py-2">#</th>
                                    <th className="px-2 py-2">Status</th>
                                    <th className="px-2 py-2">Worker</th>
                                    <th className="px-2 py-2">Started</th>
                                    <th className="px-2 py-2">Finished</th>
                                    <th className="px-2 py-2">Duration</th>
                                    <th className="px-2 py-2">Post</th>
                                    <th className="px-2 py-2">Error</th>
                                    <th className="px-2 py-2">Request / Response</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {attempts.map(a => (
                                    <tr key={a.id} className="border-t border-slate-800/80">
                                      <td className="px-2 py-2 tabular-nums text-slate-400">
                                        {a.attemptNumber}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span
                                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${attemptStatusClass(a.status)}`}
                                        >
                                          {a.status}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 font-mono text-slate-500">
                                        {a.workerId || '—'}
                                      </td>
                                      <td className="px-2 py-2 text-slate-400">
                                        {formatAgentDate(a.startedAt)}
                                      </td>
                                      <td className="px-2 py-2 text-slate-400">
                                        {a.finishedAt ? formatAgentDate(a.finishedAt) : '—'}
                                      </td>
                                      <td className="px-2 py-2 tabular-nums text-slate-400">
                                        {a.durationMs != null ? `${a.durationMs}ms` : '—'}
                                      </td>
                                      <td className="px-2 py-2">
                                        {a.facebookPostUrl ? (
                                          <a
                                            href={a.facebookPostUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                                          >
                                            <ExternalLink className="h-3 w-3" /> View Facebook Post
                                          </a>
                                        ) : a.facebookPostId ? (
                                          <span className="font-mono text-slate-500">
                                            {a.facebookPostId}
                                          </span>
                                        ) : (
                                          <span className="text-slate-600">—</span>
                                        )}
                                      </td>
                                      <td className="max-w-[180px] px-2 py-2 text-rose-300">
                                        {a.errorCode
                                          ? `${a.errorCode}${a.errorMessage ? `: ${a.errorMessage}` : ''}`
                                          : '—'}
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="flex flex-col gap-1">
                                          <JsonExpand label="request" value={a.requestJson} />
                                          <JsonExpand label="response" value={a.responseJson} />
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {auditJobId && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 opacity-90">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Audit (secondary) — job {auditJobId.slice(0, 10)}…
            </h3>
            <button
              type="button"
              onClick={() => {
                setAuditJobId(null);
                setAudit([]);
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Đóng
            </button>
          </div>
          {audit.length === 0 ? (
            <p className="text-xs text-slate-500">Không có log.</p>
          ) : (
            <ul className="space-y-2 text-xs text-slate-400">
              {audit.map(log => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-baseline gap-2 border-b border-slate-800/80 pb-2"
                >
                  <span className="font-mono text-slate-600">
                    {formatAgentDate(log.createdAt)}
                  </span>
                  <span className="font-semibold text-slate-300">{log.action}</span>
                  {log.actor && <span className="text-slate-600">by {log.actor}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
