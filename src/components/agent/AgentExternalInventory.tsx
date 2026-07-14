import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  callExternalInventoryItem,
  convertExternalInventoryToOfficial,
  fetchExternalInventory,
  patchExternalInventoryItem,
} from '../../services/agentPlatformApi';
import type { ExternalInventoryItem } from '../../types/agentPlatform';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from './AgentPlatformUi';
import { formatResolvedBudget } from '@/shared/agent-domain';

type ListFilter = 'active' | 'converted';
type QuickFilterId = 'sell' | 'rent' | 'hasPhone' | 'unverified' | 'verified' | 'archived';

const QUICK_FILTERS: Array<{ id: QuickFilterId; label: string }> = [
  { id: 'sell', label: 'Bán' },
  { id: 'rent', label: 'Cho thuê' },
  { id: 'hasPhone', label: 'Có số điện thoại' },
  { id: 'unverified', label: 'Chưa xác minh' },
  { id: 'verified', label: 'Đã xác minh' },
  { id: 'archived', label: 'Archived' },
];

function ActionBtn({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-40 ${
        primary
          ? 'bg-emerald-700 text-white hover:bg-emerald-600'
          : 'border border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

export default function AgentExternalInventory() {
  const [items, setItems] = useState<ExternalInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [active, setActive] = useState<QuickFilterId | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [selected, setSelected] = useState<ExternalInventoryItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Parameters<typeof fetchExternalInventory>[0] = {
        page,
        limit: 40,
      };
      if (listFilter === 'converted') {
        params.status = 'converted_to_official';
      } else if (active === 'archived') {
        params.status = 'archived';
      } else {
        // Default hide converted_to_official — omit that status; client filters too
        params.status = undefined;
      }
      if (active === 'sell') params.transactionType = 'sell';
      if (active === 'rent') params.transactionType = 'rent';
      if (active === 'hasPhone') params.hasPhone = true;
      if (active === 'unverified') params.verificationStatus = 'unverified';
      if (active === 'verified') params.verificationStatus = 'verified';

      const res = await fetchExternalInventory(params);
      const raw = res.data;
      const next =
        listFilter === 'converted'
          ? raw.filter(i => i.status === 'converted_to_official')
          : raw.filter(i => i.status !== 'converted_to_official');
      setItems(next);
      setTotalPages(res.meta?.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được giỏ hàng ngoài.');
    } finally {
      setLoading(false);
    }
  }, [page, active, listFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const runCall = async (
    item: ExternalInventoryItem,
    verificationStatus: string,
    extra?: { note?: string; status?: string },
  ) => {
    setBusyId(item.id);
    setMessage('');
    try {
      await callExternalInventoryItem(item.id, {
        verificationStatus,
        note: extra?.note,
        status: extra?.status,
      });
      setMessage(`Đã cập nhật: ${verificationStatus}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const runConvert = async (item: ExternalInventoryItem) => {
    setBusyId(item.id);
    setMessage('');
    try {
      await convertExternalInventoryToOfficial(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelected(prev => (prev?.id === item.id ? null : prev));
      setMessage('Đã chuyển Giỏ hàng chính thức.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chuyển chính thức thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (item: ExternalInventoryItem) => {
    try {
      await patchExternalInventoryItem(item.id, { status: 'archived', note: 'Archived from UI' });
      setMessage('Đã archive item.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Archive thất bại.');
    }
  };

  if (loading && items.length === 0) {
    return <AgentPanelLoader label="Đang tải Giỏ hàng ngoài..." />;
  }
  if (error && items.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Giỏ hàng ngoài"
        subtitle="Dữ liệu ngoài — chưa xác minh · tách biệt giỏ hàng chính thức"
        onRefresh={load}
        refreshing={loading}
      />

      <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
        Badge: Dữ liệu ngoài — chưa xác minh. Không đồng bộ tự động sang giỏ hàng chính thức.
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'active' as const, label: 'Đang xử lý' },
            { id: 'converted' as const, label: 'Đã chuyển chính thức' },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setPage(1);
              setListFilter(tab.id);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              listFilter === tab.id
                ? 'border-rose-700 bg-rose-950/50 text-rose-200'
                : 'border-slate-800 text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {listFilter === 'active' && (
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setPage(1);
                setActive(prev => (prev === f.id ? null : f.id));
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                active === f.id
                  ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                  : 'border-slate-800 text-slate-400'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có item"
          description="Lưu từ Lead Intelligence (Nguồn hàng) để đưa tin vào giỏ ngoài."
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const price =
              item.transactionType === 'rent'
                ? formatResolvedBudget(null, item.rentPrice ?? null, { period: 'month' })
                : formatResolvedBudget(
                    item.askingPriceMin ?? null,
                    item.askingPriceMax ?? null,
                  );
            const loc = [item.city, item.district, item.street].filter(Boolean).join(', ');
            const busy = busyId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/30 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[10px] uppercase text-amber-200">
                        Dữ liệu ngoài — chưa xác minh
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        {item.transactionType}
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        {item.verificationStatus}
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                        {item.status}
                      </span>
                    </div>
                    <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{item.propertyType || '—'}</span>
                      <span>{price}</span>
                      <span>{loc || '—'}</span>
                      <span>
                        {item.areaMinM2 || item.areaMaxM2
                          ? `${item.areaMinM2 || item.areaMaxM2}m²`
                          : '—'}
                      </span>
                      <span>{item.contactPhone || 'Chưa có SĐT'}</span>
                      <span>{item.sourceName || '—'}</span>
                      <span>{formatAgentDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 lg:max-w-md lg:justify-end">
                    <ActionBtn disabled={busy} onClick={() => setSelected(item)}>
                      Chi tiết
                    </ActionBtn>
                    {listFilter === 'active' && (
                      <>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => runCall(item, 'contacted', { note: 'Đã gọi' })}
                        >
                          Đã gọi
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() =>
                            runCall(item, 'unverified', { note: 'Chưa liên hệ' })
                          }
                        >
                          Chưa liên hệ
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() =>
                            runCall(item, 'contacted', { note: 'Hẹn gọi lại' })
                          }
                        >
                          Hẹn gọi lại
                        </ActionBtn>
                        <ActionBtn disabled={busy} onClick={() => runCall(item, 'verified')}>
                          Đã xác minh
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => runCall(item, 'unavailable', { note: 'Không còn hàng' })}
                        >
                          Không còn hàng
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => runCall(item, 'invalid', { note: 'Sai thông tin' })}
                        >
                          Sai thông tin
                        </ActionBtn>
                        <ActionBtn primary disabled={busy} onClick={() => runConvert(item)}>
                          Chuyển Giỏ hàng chính thức
                        </ActionBtn>
                      </>
                    )}
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-slate-900"
                      >
                        Mở bài gốc <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600"
                      >
                        Mở bài gốc
                      </button>
                    )}
                    {listFilter === 'active' && (
                      <ActionBtn disabled={busy} onClick={() => archive(item)}>
                        Archive
                      </ActionBtn>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-xs text-slate-500">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{selected.title}</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500"
              >
                Đóng
              </button>
            </div>
            <p className="mb-2 text-xs text-amber-300">Dữ liệu ngoài — chưa xác minh</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
              {selected.originalContent}
            </pre>
            {selected.sourceUrl && (
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-rose-400 hover:underline"
              >
                Mở bài gốc
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
