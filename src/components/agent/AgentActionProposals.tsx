import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, History, X } from 'lucide-react';
import {
  approveAgentActionProposal,
  copyAgentActionProposal,
  fetchAgentActionProposalAudits,
  fetchAgentActionProposals,
  rejectAgentActionProposal,
  updateAgentActionProposal,
} from '../../services/agentPlatformApi';
import type { AgentActionAuditLog, AgentActionProposal } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-900/40 text-emerald-300',
  medium: 'bg-amber-900/40 text-amber-300',
  high: 'bg-rose-900/40 text-rose-300',
};

export default function AgentActionProposals() {
  const [items, setItems] = useState<AgentActionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('proposed');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const [audits, setAudits] = useState<AgentActionAuditLog[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentActionProposals({
        page: 1,
        limit: 50,
        status: statusFilter || undefined,
      });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được hàng chờ.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (item: AgentActionProposal) => {
    setEditingId(item.id);
    setEditText(item.draftText);
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      await updateAgentActionProposal(id, { draftText: editText });
      setEditingId(null);
      setMessage('Đã lưu bản nháp.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lưu thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      await approveAgentActionProposal(id);
      setMessage('Đã duyệt — chưa đăng lên Facebook.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Approve thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt('Lý do reject (tuỳ chọn):', '');
    if (reason === null) return;
    setBusyId(id);
    setMessage('');
    try {
      await rejectAgentActionProposal(id, reason.trim() || undefined);
      setMessage('Đã reject đề xuất.');
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reject thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const copyText = async (id: string, markApproved: boolean) => {
    setBusyId(id);
    setMessage('');
    try {
      const result = await copyAgentActionProposal(id, markApproved);
      await navigator.clipboard.writeText(result.draftText);
      setMessage(
        markApproved
          ? 'Đã copy & đánh dấu approved (chưa thực thi MXH).'
          : 'Đã copy text vào clipboard.',
      );
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Copy thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const showAudits = async (id: string) => {
    if (auditFor === id) {
      setAuditFor(null);
      setAudits([]);
      return;
    }
    setBusyId(id);
    try {
      const rows = await fetchAgentActionProposalAudits(id);
      setAudits(rows);
      setAuditFor(id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không tải audit.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && items.length === 0) return <AgentPanelLoader label="Đang tải hàng chờ duyệt..." />;
  if (error && items.length === 0) return <AgentPanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Hàng chờ phản hồi"
        subtitle="AI soạn draft — bạn duyệt. Sprint này không tự comment/inbox/post."
        onRefresh={load}
        refreshing={loading}
        actions={
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="">Tất cả</option>
            <option value="proposed">proposed</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="executed">executed</option>
            <option value="failed">failed</option>
          </select>
        }
      />

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có đề xuất"
          description="Từ Findings → Tạo phản hồi để AI soạn 1–3 draft."
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-slate-800 px-2 py-0.5 uppercase text-slate-300">
                  {item.status}
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">{item.actionType}</span>
                <span className={`rounded px-2 py-0.5 ${RISK_COLORS[item.riskLevel] || RISK_COLORS.medium}`}>
                  risk {item.riskLevel}
                </span>
                <span className="text-slate-600">{formatAgentDate(item.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm font-semibold text-white">
                Finding: {item.finding?.title || item.findingId}
                {item.finding?.score !== undefined && (
                  <span className="ml-2 text-rose-300">score {item.finding.score}</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">{item.rationale}</p>

              {editingId === item.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={4}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => saveEdit(item.id)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                  {item.draftText}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === 'proposed' && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => approve(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => reject(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-800 px-3 py-1.5 text-xs text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={busyId === item.id || item.status === 'rejected'}
                  onClick={() => copyText(item.id, false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy text
                </button>
                {item.status === 'proposed' && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => copyText(item.id, true)}
                    className="rounded-lg border border-emerald-800/60 px-3 py-1.5 text-xs text-emerald-300"
                  >
                    Copy + approve
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => showAudits(item.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
                >
                  <History className="h-3.5 w-3.5" />
                  Audit
                </button>
              </div>

              {auditFor === item.id && (
                <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3">
                  {audits.length === 0 ? (
                    <li className="text-xs text-slate-500">Chưa có audit.</li>
                  ) : (
                    audits.map(a => (
                      <li key={a.id} className="text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-400">{a.action}</span>
                        {' · '}
                        {formatAgentDate(a.createdAt)}
                        {a.actorUserId ? ` · ${a.actorUserId}` : ''}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
