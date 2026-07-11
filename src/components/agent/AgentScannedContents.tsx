import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchAgentSources, fetchScannedContents } from '../../services/agentPlatformApi';
import type { AgentSource, ScannedContentItem } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';

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
    default:
      return stage || 'Chưa phân tích';
  }
}

function stageTone(stage: string | null): string {
  if (stage === 'created_finding') return 'bg-emerald-900/40 text-emerald-300';
  if (!stage) return 'bg-slate-800 text-slate-500';
  return 'bg-amber-900/30 text-amber-200';
}

export default function AgentScannedContents() {
  const [items, setItems] = useState<ScannedContentItem[]>([]);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contentsRes, sourcesRes] = await Promise.all([
        fetchScannedContents({
          page: 1,
          limit: 50,
          sourceId: sourceId || undefined,
          search: search || undefined,
        }),
        fetchAgentSources({ page: 1, limit: 100 }),
      ]);
      setItems(contentsRes.data);
      setTotal(contentsRes.meta?.total ?? contentsRes.data.length);
      setSources(sourcesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nội dung đã quét.');
    } finally {
      setLoading(false);
    }
  }, [sourceId, search]);

  useEffect(() => {
    load();
  }, [load]);

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
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
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
                    <span>ai {meta.aiScore ?? '—'}{meta.aiSource ? ` (${meta.aiSource})` : ''}</span>
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

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  {item.authorName && <span>Author: {item.authorName}</span>}
                  {item.externalId && (
                    <span className="font-mono text-slate-600">id {item.externalId}</span>
                  )}
                  {item.contentText.length > 280 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      className="text-sky-400 hover:underline"
                    >
                      {expanded ? 'Thu gọn' : 'Xem đầy đủ'}
                    </button>
                  )}
                  <a
                    href={item.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-rose-400 hover:underline"
                  >
                    Bài gốc <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
