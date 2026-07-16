import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, ScrollText } from 'lucide-react';
import {
  fetchSocialAudit,
  fetchSocialJobs,
} from '../../../../services/socialPublishingApi';
import type {
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
  const url = result.externalUrl;
  if (typeof url === 'string' && url.trim()) return url;
  const postId = result.externalPostId;
  if (typeof postId === 'string' && postId.trim() && !postId.startsWith('dry_run_')) {
    return `https://www.facebook.com/${postId}`;
  }
  return null;
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
    return <AgentPanelLoader label="Đang tải lịch sử..." />;
  }
  if (error && jobs.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <AgentPanelHeader
        title="Lịch sử đăng"
        subtitle="Published / failed jobs — post URL và audit trail"
        onRefresh={load}
        refreshing={loading}
      />

      {jobs.length === 0 ? (
        <AgentPanelEmpty title="Chưa có lịch sử" description="Jobs đã kết thúc sẽ hiện ở đây." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
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
                return (
                  <tr key={job.id} className="border-t border-slate-800 hover:bg-slate-900/40">
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
                          <ExternalLink className="h-3 w-3" /> Mở post
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
                        className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800"
                      >
                        <ScrollText className="h-3 w-3" /> Audit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {auditJobId && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Audit — job {auditJobId.slice(0, 10)}…
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
            <ul className="space-y-2 text-xs text-slate-300">
              {audit.map(log => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-baseline gap-2 border-b border-slate-800/80 pb-2"
                >
                  <span className="font-mono text-slate-500">
                    {formatAgentDate(log.createdAt)}
                  </span>
                  <span className="font-semibold text-rose-300">{log.action}</span>
                  {log.actor && <span className="text-slate-500">by {log.actor}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
