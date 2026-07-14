import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, X } from 'lucide-react';
import { formatLeadBudget, formatLeadInterest, formatLeadSource } from '../../../leadGen/leadLabels';
import { getLeadMagnet } from '../../../leadGen/leadMagnets';
import {
  callInvestorLead,
  convertInvestorLeadToCustomer,
  fetchInvestorLeads,
  type InvestorLeadCallStatus,
} from '../../../services/investorLeadsApi';
import type { InvestorLead, InvestorLeadPromoteDetail } from '../../../types/investorLead';

type ListFilter = 'active' | 'converted';

function displayText(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) {
    const items = value.map(v => String(v).trim()).filter(Boolean);
    return items.length ? items.join(', ') : '—';
  }
  return String(value);
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-slate-800/80 py-2 text-xs last:border-0">
      <div className="text-slate-500">{label}</div>
      <div className="whitespace-pre-wrap break-words text-slate-200">{value}</div>
    </div>
  );
}

function sourceLabel(lead: InvestorLead): string {
  if (lead.short_link_slug) return `Short link: /s/${lead.short_link_slug}`;
  if (lead.magnet_slug) return getLeadMagnet(lead.magnet_slug)?.title || lead.magnet_slug;
  return formatLeadSource(lead.source || lead.source_channel);
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new':
      return 'Mới';
    case 'contacted':
    case 'called':
      return 'Đã gọi';
    case 'unreachable':
      return 'Chưa liên hệ được';
    case 'callback_scheduled':
      return 'Hẹn gọi lại';
    case 'qualified':
      return 'Qualified';
    case 'unqualified':
      return 'Không phù hợp';
    case 'converted_to_customer':
      return 'Đã chuyển CRM';
    case 'closed':
      return 'Chốt';
    case 'lost':
      return 'Lost';
    default:
      return status;
  }
}

function ActionBtn({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger' | 'muted';
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-emerald-700 text-white hover:bg-emerald-600'
      : tone === 'danger'
        ? 'border border-amber-800/60 bg-amber-950/30 text-amber-200'
        : tone === 'muted'
          ? 'border border-slate-700 text-slate-400 hover:bg-slate-900'
          : 'border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function LeadDetailDrawer({
  lead,
  busy,
  message,
  onClose,
  onCopyPhone,
  onCall,
  onConvert,
  onOpenSource,
}: {
  lead: InvestorLead;
  busy: boolean;
  message: string;
  onClose: () => void;
  onCopyPhone: () => void;
  onCall: (status: InvestorLeadCallStatus, opts?: { note?: string; callbackAt?: string }) => void;
  onConvert: () => void;
  onOpenSource: () => void;
}) {
  const detail: InvestorLeadPromoteDetail = lead.promote_detail || {};
  const postUrl = detail.sourcePostUrl || lead.page_path;
  const fbUrl = detail.facebookProfileUrl || detail.authorUrl;
  const phones = detail.phones?.length
    ? detail.phones
    : lead.phone
      ? [lead.phone]
      : [];
  const needSummary = detail.needSummary || detail.summary || lead.first_message || '—';
  const [callbackAt, setCallbackAt] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-sm">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Chi tiết lead</div>
            <h3 className="text-base font-bold text-white">{lead.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span
                className={`rounded-full px-2 py-0.5 font-bold ${
                  lead.investor_score >= 80
                    ? 'bg-rose-500/20 text-rose-400'
                    : lead.investor_score >= 50
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-slate-700 text-slate-300'
                }`}
              >
                Score {lead.investor_score}
              </span>
              {detail.priority && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                  Priority: {detail.priority}
                </span>
              )}
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                {statusLabel(lead.status)}
              </span>
              {detail.classification && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">{detail.classification}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-900 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {message && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              {message}
            </div>
          )}

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Nhu cầu</h4>
            <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs leading-relaxed text-slate-200">
              {needSummary}
            </p>
            <DetailRow label="Quan tâm" value={formatLeadInterest(lead.interest_type || detail.intent || undefined)} />
            <DetailRow
              label="Ngân sách"
              value={formatLeadBudget(lead.budget_range || detail.budgetRange || undefined)}
            />
            <DetailRow label="Khu vực" value={displayText(detail.location || lead.city)} />
            <DetailRow label="Gợi ý xử lý" value={displayText(detail.recommendedAction)} />
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Liên hệ</h4>
            <DetailRow label="Điện thoại" value={phones.join(', ')} />
            <DetailRow label="Zalo" value={displayText(detail.zalo)} />
            <DetailRow label="Email" value={displayText(detail.emails?.length ? detail.emails : lead.email)} />
            <DetailRow
              label="Facebook"
              value={
                fbUrl ? (
                  <a href={fbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200">
                    {detail.facebookName || detail.authorName || 'Mở profile'} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null
              }
            />
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Nguồn</h4>
            <DetailRow label="Nguồn" value={sourceLabel(lead)} />
            <DetailRow label="Nhóm/Page" value={displayText(detail.sourceGroup || detail.sourceName)} />
            <DetailRow
              label="Bài gốc"
              value={
                postUrl ? (
                  <a href={postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200">
                    Mở bài gốc <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null
              }
            />
            <DetailRow label="Thời gian" value={new Date(lead.created_at).toLocaleString('vi-VN')} />
          </section>

          {(lead.first_message || detail.originalContent) && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nội dung đầy đủ
              </h4>
              {lead.first_message && (
                <pre className="mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-300">
                  {lead.first_message}
                </pre>
              )}
              {detail.originalContent && (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-300">
                  {detail.originalContent}
                </pre>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ghi chú / hẹn gọi</h4>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Ghi chú (tuỳ chọn)"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            />
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={e => setCallbackAt(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            />
          </section>
        </div>

        <div className="space-y-2 border-t border-slate-800 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <ActionBtn disabled={busy || !phones[0]} onClick={onCopyPhone}>
              <span className="inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> Sao chép số
              </span>
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => onCall('called', { note: note || undefined })}>
              Đã gọi
            </ActionBtn>
            <ActionBtn
              disabled={busy}
              onClick={() => onCall('unreachable', { note: note || undefined })}
            >
              Chưa liên hệ được
            </ActionBtn>
            <ActionBtn
              disabled={busy}
              onClick={() =>
                onCall('callback_scheduled', {
                  note: note || undefined,
                  callbackAt: callbackAt ? new Date(callbackAt).toISOString() : undefined,
                })
              }
            >
              Hẹn gọi lại
            </ActionBtn>
            <ActionBtn tone="primary" disabled={busy} onClick={onConvert}>
              Chuyển Khách hàng CRM
            </ActionBtn>
            <ActionBtn tone="muted" disabled={!postUrl} onClick={onOpenSource}>
              Mở bài gốc
            </ActionBtn>
            <ActionBtn
              tone="danger"
              disabled={busy}
              onClick={() => onCall('unqualified', { note: note || undefined })}
            >
              Không phù hợp
            </ActionBtn>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto block rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white"
          >
            Đóng
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function InvestorLeadsPanel() {
  const [leads, setLeads] = useState<InvestorLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    fetchInvestorLeads({
      includeConverted: listFilter === 'converted',
      page: 1,
      limit: 50,
    })
      .then(data => {
        if (listFilter === 'converted') {
          setLeads(data.filter(l => l.status === 'converted_to_customer'));
        } else {
          setLeads(data.filter(l => l.status !== 'converted_to_customer'));
        }
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [listFilter]);

  const selected = useMemo(
    () => leads.find(l => l.id === selectedId) || null,
    [leads, selectedId],
  );

  const copyPhone = async (lead: InvestorLead) => {
    const phone =
      lead.promote_detail?.primaryPhone ||
      lead.promote_detail?.phones?.[0] ||
      lead.phone;
    if (!phone) {
      setMessage('Không có số điện thoại.');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(phone).replace(/\s/g, ''));
      setMessage('Đã sao chép số.');
    } catch {
      setMessage('Không sao chép được.');
    }
  };

  const handleCall = async (
    id: string,
    status: InvestorLeadCallStatus,
    opts?: { note?: string; callbackAt?: string },
  ) => {
    setBusy(true);
    setMessage('');
    try {
      await callInvestorLead(id, {
        status,
        note: opts?.note,
        callbackAt: opts?.callbackAt,
      });
      setLeads(prev => prev.map(l => (l.id === id ? { ...l, status } : l)));
      setMessage(`Đã cập nhật: ${statusLabel(status)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cập nhật cuộc gọi thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async (id: string) => {
    setBusy(true);
    setMessage('');
    try {
      await convertInvestorLeadToCustomer(id);
      setLeads(prev => prev.filter(l => l.id !== id));
      setSelectedId(null);
      setMessage('Đã chuyển Khách hàng CRM.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chuyển CRM thất bại.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-400">Đang tải leads đầu tư...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Leads đầu tư (Investor Funnel)</h2>
          <p className="text-xs text-slate-500">
            Click vào dòng để xem đầy đủ — score, nhu cầu, nguồn và thao tác gọi
          </p>
        </div>
        <button type="button" onClick={load} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
          Làm mới
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'active' as const, label: 'Đang xử lý' },
            { id: 'converted' as const, label: 'Đã chuyển CRM' },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setSelectedId(null);
              setListFilter(tab.id);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              listFilter === tab.id
                ? 'border-rose-700 bg-rose-950/50 text-rose-200'
                : 'border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && !selected && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Điểm</th>
              <th className="px-4 py-3">Khách</th>
              <th className="px-4 py-3">Liên hệ</th>
              <th className="px-4 py-3">Nhu cầu</th>
              <th className="px-4 py-3">Ưu tiên</th>
              <th className="px-4 py-3">Nguồn</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const preview =
                lead.promote_detail?.needSummary ||
                lead.promote_detail?.summary ||
                lead.first_message ||
                '';
              const postUrl = lead.promote_detail?.sourcePostUrl || lead.page_path;
              return (
                <tr
                  key={lead.id}
                  onClick={() => {
                    setMessage('');
                    setSelectedId(lead.id);
                  }}
                  className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        lead.investor_score >= 80
                          ? 'bg-rose-500/20 text-rose-400'
                          : lead.investor_score >= 50
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {lead.investor_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{lead.name}</td>
                  <td className="px-4 py-3 text-slate-300">
                    <div>{lead.phone}</div>
                    {lead.email && <div className="text-xs text-slate-500">{lead.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-[220px]">
                    <div className="line-clamp-2">{preview || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {lead.promote_detail?.priority || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {postUrl ? (
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"
                      >
                        Link nguồn <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      sourceLabel(lead)
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{statusLabel(lead.status)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      <ActionBtn disabled={busy} onClick={() => copyPhone(lead)}>
                        Sao chép số
                      </ActionBtn>
                      <ActionBtn disabled={busy} onClick={() => handleCall(lead.id, 'called')}>
                        Đã gọi
                      </ActionBtn>
                      {listFilter === 'active' && (
                        <ActionBtn
                          tone="primary"
                          disabled={busy}
                          onClick={() => handleConvert(lead.id)}
                        >
                          Chuyển CRM
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            {listFilter === 'converted' ? 'Chưa có lead đã chuyển CRM.' : 'Chưa có lead đang xử lý.'}
          </p>
        )}
      </div>

      {selected && (
        <LeadDetailDrawer
          lead={selected}
          busy={busy}
          message={message}
          onClose={() => setSelectedId(null)}
          onCopyPhone={() => copyPhone(selected)}
          onCall={(status, opts) => handleCall(selected.id, status, opts)}
          onConvert={() => handleConvert(selected.id)}
          onOpenSource={() => {
            const url = selected.promote_detail?.sourcePostUrl || selected.page_path;
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
          }}
        />
      )}
    </div>
  );
}
