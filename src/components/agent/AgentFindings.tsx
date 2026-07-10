import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchAgentFindings, updateAgentFinding } from '../../services/agentPlatformApi';
import type { AgentFinding } from '../../types/agentPlatform';
import type { UserRole } from '../../types';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

type Props = {
  userRole: UserRole;
};

export default function AgentFindings({ userRole }: Props) {
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const canPromote = userRole === 'owner' || userRole === 'company';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentFindings({
        page: 1,
        limit: 50,
        status: statusFilter || undefined,
      });
      setFindings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được findings.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const patchStatus = async (finding: AgentFinding, status: string) => {
    setBusyId(finding.id);
    try {
      const payload: { status: string; promotedLeadId?: string | null } = { status };
      if (status === 'promoted') {
        const leadId = window.prompt('Nhập promotedLeadId (phase sau tự tạo Lead):', finding.promotedLeadId || '');
        if (leadId === null) return;
        payload.promotedLeadId = leadId.trim() || null;
      }
      await updateAgentFinding(finding.id, payload);
      load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && findings.length === 0) return <AgentPanelLoader label="Đang tải findings..." />;
  if (error && findings.length === 0) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Findings"
        subtitle="Kết quả AI — ScannedContent → Finding → Lead (phase sau)"
        onRefresh={load}
        refreshing={loading}
        actions={
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">Tất cả</option>
            <option value="new">new</option>
            <option value="reviewed">reviewed</option>
            <option value="promoted">promoted</option>
            <option value="dismissed">dismissed</option>
          </select>
        }
      />

      {findings.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có finding"
          description="Sau khi worker quét và AI phân tích, finding sẽ hiện tại đây."
        />
      ) : (
        <div className="space-y-3">
          {findings.map(finding => (
            <article key={finding.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-300">
                      {finding.score}
                    </span>
                    <span className="text-xs uppercase text-slate-500">{finding.type}</span>
                    <span className="text-xs text-slate-600">{finding.status}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-white">{finding.title}</h3>
                  <p className="mt-1 text-sm text-slate-400 line-clamp-3">{finding.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Nguồn: {finding.source?.name || '—'}</span>
                    <span>{formatAgentDate(finding.createdAt)}</span>
                    {finding.scannedContent?.canonicalUrl && (
                      <a
                        href={finding.scannedContent.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-rose-400 hover:underline"
                      >
                        Bài gốc <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === finding.id}
                    onClick={() => patchStatus(finding, 'reviewed')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                  >
                    Reviewed
                  </button>
                  <button
                    type="button"
                    disabled={busyId === finding.id}
                    onClick={() => patchStatus(finding, 'dismissed')}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
                  >
                    Dismiss
                  </button>
                  {canPromote && (
                    <button
                      type="button"
                      disabled={busyId === finding.id}
                      onClick={() => patchStatus(finding, 'promoted')}
                      className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Promote Lead
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
