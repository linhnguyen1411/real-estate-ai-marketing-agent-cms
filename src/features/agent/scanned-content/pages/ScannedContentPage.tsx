import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  deleteScannedContent,
  fetchAgentSources,
  fetchScannedContents,
  patchScannedContent,
  approveScannedContentAsFinding,
} from '../../../../services/agentPlatformApi';
import type { AgentSource, ScannedContentItem } from '../../../../types/agentPlatform';
import type { UserRole } from '../../../../types';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';

type Props = {
  userRole?: UserRole;
};

const STATUS_FILTERS = [
  { id: '', label: 'Tất cả' },
  { id: 'collected', label: 'Collected' },
  { id: 'processed', label: 'Processed' },
  { id: 'ignored', label: 'Ignored' },
  { id: 'archived', label: 'Archived' },
] as const;

function readLeadMeta(item: ScannedContentItem) {
  const metrics = (item.metrics || {}) as Record<string, unknown>;
  const lead = (metrics.leadAnalysis && typeof metrics.leadAnalysis === 'object'
    ? metrics.leadAnalysis
    : {}) as Record<string, unknown>;
  return {
    filterStage: lead.filterStage ? String(lead.filterStage) : null,
    analysisMode: lead.analysisMode ? String(lead.analysisMode) : null,
    keywordScore: numOrNull(lead.keywordScore),
    prefilterScore: numOrNull(lead.prefilterScore),
    aiScore: numOrNull(lead.aiScore),
    finalScore: numOrNull(lead.finalScore),
    aiSource: lead.aiSource ? String(lead.aiSource) : null,
    usedDefaultKeywords: lead.usedDefaultKeywords === true,
    reasons: Array.isArray(lead.reasons) ? lead.reasons.map(String) : [],
  };
}

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stageLabel(stage: string | null): string {
  switch (stage) {
    case 'created_finding':
      return 'Đã tạo finding';
    case 'keyword_gate':
      return 'Loại ở keyword gate';
    case 'low_final_score':
      return 'Loại — finalScore thấp';
    case 'hard_spam':
      return 'Loại — spam';
    case 'too_short':
      return 'Loại — quá ngắn';
    case 'budget_exhausted':
      return 'Bỏ qua — hết budget AI';
    case 'out_of_scope':
      return 'Ngoài phạm vi (supply/không target)';
    case 'ignored_by_rule':
      return 'Rule: finding đã dismiss / rule cũ';
    case 'duplicate':
      return 'Trùng nội dung';
    default:
      return stage || 'Chưa phân tích';
  }
}

function stageTone(stage: string | null): string {
  if (stage === 'created_finding') return 'bg-emerald-900/40 text-emerald-300';
  if (!stage) return 'bg-slate-800 text-slate-500';
  return 'bg-amber-900/30 text-amber-200';
}

function hasOriginalPostUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\/posts\/\d+/.test(url) && !url.includes('#gql-');
}

export default function ScannedContentPage({ userRole }: Props) {
  const [items, setItems] = useState<ScannedContentItem[]>([]);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hardDeleteAllowed, setHardDeleteAllowed] = useState(userRole === 'owner');
  const canHardDelete = userRole === 'owner' && hardDeleteAllowed;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contentsRes, sourcesRes] = await Promise.all([
        fetchScannedContents({
          page: 1,
          limit: 50,
          sourceId: sourceId || undefined,
          status: statusFilter || undefined,
          search: search || undefined,
        }),
        fetchAgentSources({ page: 1, limit: 100 }),
      ]);
      setItems(contentsRes.data);
      setTotal(contentsRes.meta?.total ?? contentsRes.data.length);
      setSources(sourcesRes.data);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nội dung đã quét.');
    } finally {
      setLoading(false);
    }
  }, [sourceId, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const patchOne = async (
    id: string,
    payload: { status?: string; action?: string },
    successMsg: string,
    options?: { removeFromList?: boolean },
  ) => {
    setBusyId(id);
    setMessage('');
    try {
      const updated = await patchScannedContent(id, payload);
      const nextStatus = updated.status || payload.status;
      const shouldRemove =
        options?.removeFromList === true ||
        (statusFilter
          ? Boolean(nextStatus && nextStatus !== statusFilter)
          : nextStatus === 'archived' || nextStatus === 'ignored');
      if (shouldRemove) {
        setItems(prev => prev.filter(item => item.id !== id));
        setTotal(t => Math.max(0, t - 1));
      } else {
        setItems(prev => prev.map(item => (item.id === id ? { ...item, ...updated } : item)));
      }
      setMessage(successMsg);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const hardDelete = async (id: string) => {
    if (!canHardDelete) return;
    if (!window.confirm('Xóa vĩnh viễn bài đã quét? Không hoàn tác được.')) return;
    setBusyId(id);
    setMessage('');
    try {
      await deleteScannedContent(id);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotal(t => Math.max(0, t - 1));
      setMessage('Đã xóa vĩnh viễn.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Xóa thất bại.';
      if (/403|không có quyền|forbidden/i.test(msg)) {
        setHardDeleteAllowed(false);
      }
      setMessage(msg);
    } finally {
      setBusyId(null);
    }
  };

  const approveFinding = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      const result = await approveScannedContentAsFinding(id);
      setItems(prev =>
        prev.map(item =>
          item.id === id
            ? {
                ...item,
                status: 'analyzed',
                findings: [
                  {
                    id: result.findingId,
                    score: item.findings?.[0]?.score ?? 60,
                    status: 'new',
                    type: 'lead_signal',
                  },
                  ...(item.findings || []).filter(f => f.id !== result.findingId),
                ],
              }
            : item,
        ),
      );
      const hint = result.inboxHint ? ` ${result.inboxHint}` : '';
      const cls = result.classification ? ` [${result.classification}]` : '';
      const tg = result.telegramSent
        ? ' Đã gửi Telegram.'
        : result.telegramReason
          ? ` Telegram: ${result.telegramReason}.`
          : '';
      setMessage(
        result.created
          ? `Đã duyệt thành Finding${cls}.${hint}${tg}${result.syncEnqueued ? ' Đã enqueue đồng bộ VPS.' : ''}`
          : `Đã cập nhật Finding${cls}.${hint}${tg}${result.syncEnqueued ? ' Đã enqueue lại VPS.' : ''}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Duyệt Finding thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const bulkPatch = async (action: 'ignored' | 'archived') => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setMessage('');
    try {
      await Promise.all(
        ids.map(id =>
          patchScannedContent(id, {
            status: action,
            action: action === 'ignored' ? 'ignore' : 'archive',
          }),
        ),
      );
      setItems(prev =>
        statusFilter
          ? prev.filter(item => !ids.includes(item.id))
          : prev.map(item =>
              ids.includes(item.id) ? { ...item, status: action } : item,
            ),
      );
      setSelectedIds(new Set());
      setMessage(
        action === 'ignored'
          ? `Đã ignore ${ids.length} bài.`
          : `Đã archive ${ids.length} bài.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Bulk action thất bại.');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someVisibleSelected =
    items.some(item => selectedIds.has(item.id)) && !allVisibleSelected;

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      if (items.length === 0) return prev;
      if (items.every(item => prev.has(item.id))) {
        const next = new Set(prev);
        items.forEach(item => next.delete(item.id));
        return next;
      }
      const next = new Set(prev);
      items.forEach(item => next.add(item.id));
      return next;
    });
  };

  const bulkHardDelete = async () => {
    if (!canHardDelete) return;
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (
      !window.confirm(
        `Xóa vĩnh viễn ${ids.length} bài đã quét? Không hoàn tác được — giảm rác DB.`,
      )
    ) {
      return;
    }
    setMessage('');
    setBusyId('bulk-hard-delete');
    try {
      const results = await Promise.allSettled(ids.map(id => deleteScannedContent(id)));
      const fulfilledIds = ids.filter((_, i) => results[i].status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected').length;
      const firstReject = results.find(r => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      setItems(prev => prev.filter(item => !fulfilledIds.includes(item.id)));
      setTotal(t => Math.max(0, t - fulfilledIds.length));
      setSelectedIds(prev => {
        const next = new Set(prev);
        fulfilledIds.forEach(id => next.delete(id));
        return next;
      });
      if (failed > 0) {
        const reason =
          firstReject?.reason instanceof Error
            ? firstReject.reason.message
            : 'một số bài thất bại';
        if (/403|không có quyền|forbidden/i.test(reason)) {
          setHardDeleteAllowed(false);
        }
        setMessage(`Đã xóa ${fulfilledIds.length}/${ids.length}. Lỗi: ${reason}`);
      } else {
        setMessage(`Đã xóa vĩnh viễn ${fulfilledIds.length} bài.`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Bulk hard delete thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && items.length === 0) {
    return <AgentPanelLoader label="Đang tải nội dung đã quét..." />;
  }
  if (error && items.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Nội dung đã quét"
        subtitle="Raw posts + bước lọc (keyword / AI / spam) — chưa đồng nghĩa Finding"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="">Tất cả nguồn</option>
              {sources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            <form
              className="flex gap-1"
              onSubmit={e => {
                e.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Tìm nội dung / author…"
                className="w-44 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                Tìm
              </button>
            </form>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id || 'all'}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              statusFilter === f.id
                ? 'border-rose-700 bg-rose-950/50 text-rose-200'
                : 'border-slate-800 text-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={el => {
              if (el) el.indeterminate = someVisibleSelected;
            }}
            onChange={toggleSelectAllVisible}
            disabled={items.length === 0}
            className="rounded border-slate-700 bg-slate-950"
            aria-label="Chọn tất cả bài đang hiển thị"
          />
          Chọn tất cả ({items.length})
        </label>
        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-slate-500">· Đã chọn {selectedIds.size}</span>
            <button
              type="button"
              onClick={() => bulkPatch('ignored')}
              className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200"
            >
              Bulk ignore
            </button>
            <button
              type="button"
              onClick={() => bulkPatch('archived')}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Bulk archive
            </button>
            <button
              type="button"
              disabled={!canHardDelete || busyId === 'bulk-hard-delete'}
              title={
                userRole !== 'owner'
                  ? 'Chỉ owner được hard delete'
                  : !hardDeleteAllowed
                    ? 'API từ chối hard delete (403)'
                    : undefined
              }
              onClick={() => void bulkHardDelete()}
              className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-40"
            >
              {busyId === 'bulk-hard-delete'
                ? 'Đang xóa…'
                : `Xóa vĩnh viễn (${selectedIds.size})`}
            </button>
          </>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Hiển thị {items.length}/{total} bài
      </div>

      {items.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có bài đã quét"
          description="Chạy quét nguồn Facebook/website — bài raw sẽ hiện ở đây trước khi thành Finding."
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const expanded = expandedId === item.id;
            const preview = item.contentText.slice(0, expanded ? 4000 : 280);
            const findingCount = item.findings?.length ?? 0;
            const meta = readLeadMeta(item);
            const busy = busyId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="rounded border-slate-700 bg-slate-950"
                    aria-label="Chọn bài"
                  />
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 font-semibold text-slate-300">
                    {item.source?.name || '—'}
                  </span>
                  <span className="text-slate-600">{item.status}</span>
                  <span className={`rounded-full px-2 py-0.5 ${stageTone(meta.filterStage)}`}>
                    {stageLabel(meta.filterStage)}
                  </span>
                  {findingCount > 0 ? (
                    <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-emerald-300">
                      {findingCount} finding · score {item.findings?.[0]?.score ?? '—'}
                    </span>
                  ) : null}
                  <span className="text-slate-600">{formatAgentDate(item.collectedAt)}</span>
                </div>

                {(meta.keywordScore != null || meta.aiScore != null || meta.finalScore != null) && (
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-slate-500">
                    <span>kw {meta.keywordScore ?? '—'}</span>
                    <span>pre {meta.prefilterScore ?? '—'}</span>
                    <span>
                      ai {meta.aiScore ?? '—'}
                      {meta.aiSource ? ` (${meta.aiSource})` : ''}
                    </span>
                    <span className="text-slate-300">final {meta.finalScore ?? '—'}</span>
                    {meta.analysisMode && <span>mode {meta.analysisMode}</span>}
                    {meta.usedDefaultKeywords && <span>default-kw</span>}
                  </div>
                )}

                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {preview}
                  {!expanded && item.contentText.length > 280 ? '…' : ''}
                </p>

                {meta.reasons.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
                    {meta.reasons.slice(0, 4).map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {item.authorName && (
                    <span className="text-slate-500">Author: {item.authorName}</span>
                  )}
                  {item.externalId && (
                    <span className="font-mono text-slate-600">id {item.externalId}</span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-sky-300 hover:bg-slate-900 disabled:opacity-40"
                  >
                    {expanded ? 'Thu gọn' : 'Xem chi tiết'}
                  </button>
                  {hasOriginalPostUrl(item.canonicalUrl) ? (
                    <a
                      href={item.canonicalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-slate-900"
                    >
                      Mở bài gốc <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-amber-500/80" title={item.canonicalUrl || undefined}>
                      Chưa có link bài gốc
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approveFinding(item.id)}
                    className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 text-[11px] text-emerald-200 disabled:opacity-40"
                  >
                    {findingCount > 0 ? 'Cập nhật / Đồng bộ Finding → VPS' : 'Duyệt thành Finding'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patchOne(
                        item.id,
                        { status: 'ignored', action: 'ignore' },
                        'Đã mark ignored.',
                        { removeFromList: true },
                      )
                    }
                    className="rounded-lg border border-amber-800/60 px-2.5 py-1 text-[11px] text-amber-200 disabled:opacity-40"
                  >
                    Mark ignored
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patchOne(item.id, { status: 'collected', action: 'restore' }, 'Đã khôi phục.')
                    }
                    className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 disabled:opacity-40"
                  >
                    Khôi phục
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patchOne(
                        item.id,
                        { status: 'archived', action: 'archive' },
                        'Đã xóa khỏi danh sách (archive).',
                        { removeFromList: true },
                      )
                    }
                    className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 disabled:opacity-40"
                  >
                    Xóa khỏi danh sách
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canHardDelete}
                    title={
                      userRole !== 'owner'
                        ? 'Chỉ owner được hard delete'
                        : !hardDeleteAllowed
                          ? 'API từ chối hard delete (403)'
                          : undefined
                    }
                    onClick={() => hardDelete(item.id)}
                    className="rounded-lg border border-rose-900/50 px-2.5 py-1 text-[11px] text-rose-300 disabled:opacity-40"
                  >
                    Hard delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
