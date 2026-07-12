import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  MessageSquarePlus,
  Phone,
  MapPin,
  Copy,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  bulkActionAgentFindings,
  createFindingActionProposals,
  dismissAgentFinding,
  fetchAgentFindings,
  markFindingReviewed,
  matchAgentFinding,
  promoteAgentFinding,
  saveFindingExternalInventory,
  updateAgentFinding,
} from '../../services/agentPlatformApi';
import type { AgentFinding } from '../../types/agentPlatform';
import type { UserRole } from '../../types';
import {
  resolveLeadIntelligence,
  formatVietnamPhoneDisplay,
  formatResolvedBudget,
} from '../../utils/resolveLeadIntelligence';
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

type DetailTab = 'overview' | 'structured' | 'original' | 'insights';

type QuickFilterId =
  | 'new'
  | 'reviewed'
  | 'needsReview'
  | 'outOfDomain'
  | 'hasPhone'
  | 'hasBudget'
  | 'buyer'
  | 'renter'
  | 'investor'
  | 'supplySignals'
  | 'dismissed'
  | 'processed';

const DEFAULT_CLASSIFICATIONS = 'buyer,renter,investor';
const PAGE_SIZE = 40;

const DISMISS_REASONS = [
  { value: 'not_buyer', label: 'Không phải khách mua' },
  { value: 'broker_post', label: 'Bài môi giới' },
  { value: 'seller_post', label: 'Bài người bán' },
  { value: 'no_contact', label: 'Không có liên hệ' },
  { value: 'out_of_area', label: 'Ngoài khu vực' },
  { value: 'out_of_budget', label: 'Ngoài ngân sách' },
  { value: 'out_of_domain', label: 'Ngoài lĩnh vực' },
  { value: 'duplicate_content', label: 'Nội dung trùng' },
  { value: 'stale', label: 'Tin cũ' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Khác' },
] as const;

const QUICK_FILTERS: Array<{ id: QuickFilterId; label: string }> = [
  { id: 'new', label: 'Mới' },
  { id: 'reviewed', label: 'Đã xem' },
  { id: 'needsReview', label: 'Cần xem lại' },
  { id: 'outOfDomain', label: 'Ngoài lĩnh vực' },
  { id: 'hasPhone', label: 'Có số điện thoại' },
  { id: 'hasBudget', label: 'Có ngân sách' },
  { id: 'buyer', label: 'Người mua' },
  { id: 'renter', label: 'Người thuê' },
  { id: 'investor', label: 'Nhà đầu tư' },
  { id: 'supplySignals', label: 'Nguồn hàng' },
  { id: 'processed', label: 'Đã xử lý' },
  { id: 'dismissed', label: 'Không quan tâm' },
];

const CONSUMED_STATUSES = new Set([
  'promoted',
  'promoted_to_investor_lead',
  'saved_to_external_inventory',
]);

function isConsumedFinding(finding: AgentFinding): boolean {
  if (finding.promotedLeadId) return true;
  if (finding.externalInventoryItemId) return true;
  if (CONSUMED_STATUSES.has(String(finding.status))) return true;
  return false;
}

const PRIORITY_TONE: Record<string, string> = {
  hot: 'bg-rose-500/25 text-rose-300',
  warm: 'bg-amber-500/20 text-amber-300',
  cool: 'bg-slate-700 text-slate-300',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return 'Chưa xác định';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const phone = o.normalized || o.raw || o.phone;
    if (phone != null) return formatVietnamPhoneDisplay(phone as string);
    return 'Chưa xác định';
  }
  if (Array.isArray(value)) {
    const items = value
      .map(v => {
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          return formatVietnamPhoneDisplay(
            (o.normalized as string) || (o.raw as string) || null,
          ) || String(o.normalized || o.raw || '').trim();
        }
        return String(v).trim();
      })
      .filter(s => s && !/\[object object\]/i.test(s));
    return items.length ? items.join(', ') : 'Chưa xác định';
  }
  const text = String(value).trim();
  if (!text || /\[object object\]/i.test(text)) return 'Chưa xác định';
  return text;
}

function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Chưa xác định';
  try {
    const raw = String(value);
    const num = Number(raw);
    if (!Number.isFinite(num)) return raw;
    if (num >= 1_000_000_000) {
      const ty = num / 1_000_000_000;
      return `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(2)} tỷ`;
    }
    if (num >= 1_000_000) {
      const tr = num / 1_000_000;
      return `${tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(1)} triệu`;
    }
    return num.toLocaleString('vi-VN');
  } catch {
    return String(value);
  }
}

function hasOriginalPostUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\/posts\/\d+/.test(url) && !url.includes('#gql-');
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-slate-800/80 py-2 text-xs last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      <dl>{children}</dl>
    </section>
  );
}

export default function AgentFindings({ userRole }: Props) {
  const navigate = useNavigate();
  const [findings, setFindings] = useState<AgentFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeQuick, setActiveQuick] = useState<QuickFilterId | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFinding, setSelectedFinding] = useState<AgentFinding | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissTargetIds, setDismissTargetIds] = useState<string[]>([]);
  const [dismissReason, setDismissReason] = useState<string>(DISMISS_REASONS[0].value);
  const [dismissNote, setDismissNote] = useState('');
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchFinding, setMatchFinding] = useState<AgentFinding | null>(null);
  const [matchData, setMatchData] = useState<{
    official: Array<Record<string, unknown>>;
    external: Array<Record<string, unknown>>;
    missingReason: string | null;
  } | null>(null);
  const canPromote = userRole === 'owner' || userRole === 'company';

  const queryParams = useMemo(() => {
    const base: Parameters<typeof fetchAgentFindings>[0] = {
      page,
      limit: PAGE_SIZE,
      dedupeStatus: 'unique',
      includeDismissed: false,
      classification: DEFAULT_CLASSIFICATIONS,
      actorRole: 'demand_side',
      status: 'new',
      promoted: false,
      externalInventorySaved: false,
      includeManualApproved: true,
    };

    switch (activeQuick) {
      case 'new':
        return { ...base, status: 'new' };
      case 'reviewed':
        return { ...base, status: 'reviewed' };
      case 'buyer':
        return { ...base, classification: 'buyer', actorRole: 'demand_side', status: 'new' };
      case 'renter':
        return { ...base, classification: 'renter', actorRole: 'demand_side', status: 'new' };
      case 'investor':
        return { ...base, classification: 'investor', actorRole: 'demand_side', status: 'new' };
      case 'hasPhone':
        return { ...base, hasPhone: true, status: 'new' };
      case 'hasBudget':
        return { ...base, hasBudget: true, status: 'new' };
      case 'needsReview':
        return {
          page,
          limit: PAGE_SIZE,
          needsReview: true,
          includeDismissed: false,
          status: 'new',
          promoted: false,
        };
      case 'outOfDomain':
        return {
          page,
          limit: PAGE_SIZE,
          status: 'dismissed',
          includeDismissed: true,
          dismissReason: 'out_of_domain',
        };
      case 'dismissed':
        return {
          page,
          limit: PAGE_SIZE,
          status: 'dismissed',
          includeDismissed: true,
        };
      case 'supplySignals':
        return {
          page,
          limit: PAGE_SIZE,
          includeSupplySignals: true,
          classification: 'seller,landlord,broker',
          dedupeStatus: 'unique',
          includeDismissed: false,
          promoted: false,
          externalInventorySaved: false,
        };
      case 'processed':
        return {
          page,
          limit: PAGE_SIZE,
          includeDismissed: false,
          // Backend may later support includeConsumed; client also filters.
        };
      default:
        return { ...base, externalInventorySaved: false };
    }
  }, [activeQuick, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAgentFindings(queryParams);
      const raw = res.data;
      const next =
        activeQuick === 'processed'
          ? raw.filter(isConsumedFinding)
          : activeQuick === 'dismissed'
            ? raw
            : raw.filter(f => !isConsumedFinding(f));
      setFindings(next);
      setTotal(res.meta?.total ?? next.length);
      setTotalPages(res.meta?.totalPages ?? 1);
      setSelectedIds(new Set());
      setSelectedFinding(prev => {
        if (!prev) return null;
        return next.find(f => f.id === prev.id) ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được Lead Intelligence.');
    } finally {
      setLoading(false);
    }
  }, [queryParams, activeQuick]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleQuick = (id: QuickFilterId) => {
    setPage(1);
    setActiveQuick(prev => (prev === id ? null : id));
  };

  const allPageSelected =
    findings.length > 0 && findings.every(f => selectedIds.has(f.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(findings.map(f => f.id)));
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = (finding: AgentFinding) => {
    setSelectedFinding(finding);
    setDetailTab('overview');
  };

  const openDismissDialog = (ids: string[]) => {
    setDismissTargetIds(ids);
    setDismissReason(DISMISS_REASONS[0].value);
    setDismissNote('');
    setDismissOpen(true);
  };

  const submitDismiss = async () => {
    if (!dismissTargetIds.length) return;
    const ids = [...dismissTargetIds];
    setBulkBusy(true);
    setMessage('');
    try {
      if (ids.length === 1) {
        await dismissAgentFinding(ids[0], {
          dismissReason,
          dismissNote: dismissNote.trim() || undefined,
        });
      } else {
        await bulkActionAgentFindings({
          action: 'dismissed',
          findingIds: ids,
          reason: dismissReason,
          note: dismissNote.trim() || undefined,
        });
      }
      setDismissOpen(false);
      setSelectedFinding(prev => (prev && ids.includes(prev.id) ? null : prev));
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      // Ẩn ngay khỏi list mặc định (không cần F5)
      setFindings(prev => prev.filter(f => !ids.includes(f.id)));
      setTotal(t => Math.max(0, t - ids.length));
      setMessage(`Đã đánh dấu không quan tâm (${ids.length}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không dismiss được.');
    } finally {
      setBulkBusy(false);
      setDismissTargetIds([]);
    }
  };

  const goToInvestorLeads = () => {
    navigate('/admin/dashboard', { state: { activeTab: 'investor-leads' } });
  };

  const promoteFinding = async (finding: AgentFinding) => {
    if (!canPromote) return;
    const id = finding.id;
    setBusyId(id);
    setMessage('');
    try {
      const result = await promoteAgentFinding(id);
      // Đã promote → rời Lead Intelligence, vào Leads đầu tư
      setFindings(prev => prev.filter(f => f.id !== id));
      setTotal(t => Math.max(0, t - 1));
      setSelectedFinding(prev => (prev?.id === id ? null : prev));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMessage(
        result.outcome === 'created'
          ? `Đã chuyển Lead đầu tư: ${result.leadName}`
          : `Đã merge vào Leads đầu tư (${result.duplicateReason}): ${result.leadName}`,
      );
      goToInvestorLeads();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chuyển Lead đầu tư thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const saveExternal = async (finding: AgentFinding) => {
    setBusyId(finding.id);
    setMessage('');
    try {
      let result = await saveFindingExternalInventory(finding.id, false);
      if (result.requiresConfirmation) {
        const ok = window.confirm(
          result.warning ||
            'Finding này là nhu cầu khách hàng, không phải nguồn hàng. Bạn có chắc muốn lưu?',
        );
        if (!ok) return;
        result = await saveFindingExternalInventory(finding.id, true);
      }
      if (!result.itemId) return;
      // Đã lưu giỏ ngoài → ẩn khỏi inbox mặc định (giống promote)
      setFindings(prev => prev.filter(f => f.id !== finding.id));
      setTotal(t => Math.max(0, t - 1));
      setSelectedFinding(prev => (prev?.id === finding.id ? null : prev));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(finding.id);
        return next;
      });
      setMessage(
        result.outcome === 'created'
          ? 'Đã lưu giỏ hàng ngoài.'
          : `Đã có trong giỏ ngoài (${result.duplicateReason || 'existing'}).`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Lưu giỏ ngoài thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const markReviewed = async (finding: AgentFinding) => {
    const id = finding.id;
    setBusyId(id);
    setMessage('');
    try {
      const updated = await markFindingReviewed(id);
      // Filter "Mới" / default chưa xử lý: ẩn khỏi list ngay
      const hideFromList =
        activeQuick === 'new' || activeQuick === null || activeQuick === undefined;
      setFindings(prev => {
        if (hideFromList) return prev.filter(f => f.id !== id);
        const next = prev.map(f => (f.id === id ? { ...f, ...updated, status: 'reviewed' } : f));
        const reviewed = next.filter(f => f.id === id);
        const rest = next.filter(f => f.id !== id);
        return [...rest, ...reviewed];
      });
      if (hideFromList) setTotal(t => Math.max(0, t - 1));
      setSelectedFinding(prev => (prev?.id === id ? null : prev));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMessage('Đã đánh dấu đã xem.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Không đánh dấu đã xem.');
    } finally {
      setBusyId(null);
    }
  };

  const openMatching = async (finding: AgentFinding) => {
    setMatchFinding(finding);
    setMatchOpen(true);
    setMatchData(null);
    setBusyId(finding.id);
    try {
      const data = await matchAgentFinding(finding.id);
      setMatchData(data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Matching thất bại.');
      setMatchOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  const patchStatus = async (
    finding: AgentFinding,
    status: string,
    extra?: { dismissReason?: string; dismissNote?: string },
  ) => {
    if (status === 'promoted' || status === 'promoted_to_investor_lead') {
      await promoteFinding(finding);
      return;
    }
    if (status === 'reviewed') {
      await markReviewed(finding);
      return;
    }
    setBusyId(finding.id);
    setMessage('');
    try {
      const updated = await updateAgentFinding(finding.id, { status, ...extra });
      setSelectedFinding(prev => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setMessage(`Đã cập nhật → ${status}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const copyPhone = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phone.replace(/\s/g, ''));
      setMessage('Đã copy số điện thoại.');
    } catch {
      setMessage('Không copy được.');
    }
  };

  const createReply = async (finding: AgentFinding) => {
    setBusyId(finding.id);
    setMessage('');
    try {
      const created = await createFindingActionProposals(finding.id, { count: 3 });
      setMessage(`Đã tạo ${created.length} draft phản hồi — mở hàng chờ duyệt.`);
      navigate('/admin/agents/proposals');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Tạo phản hồi thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const runBulk = async (action: 'reviewed' | 'dismissed') => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (action === 'dismissed') {
      openDismissDialog(ids);
      return;
    }
    setBulkBusy(true);
    setMessage('');
    try {
      const res = await bulkActionAgentFindings({ action, findingIds: ids });
      setFindings(prev => prev.filter(f => !ids.includes(f.id)));
      setTotal(t => Math.max(0, t - ids.length));
      setSelectedIds(new Set());
      setMessage(`Đã ${action} ${res.updated ?? ids.length} lead.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Bulk action thất bại.');
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading && findings.length === 0) {
    return <AgentPanelLoader label="Đang tải Lead Intelligence..." />;
  }
  if (error && findings.length === 0) {
    return <AgentPanelError message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <AgentPanelHeader
        title="Lead Intelligence"
        subtitle="Lead phía cầu — lọc, chấm điểm, dismiss và tạo phản hồi (không tự đăng)"
        onRefresh={load}
        refreshing={loading}
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map(filter => {
          const active = activeQuick === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => toggleQuick(filter.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-rose-700 bg-rose-950/50 text-rose-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
          <span className="text-xs text-slate-400">Đã chọn {selectedIds.size}</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => runBulk('reviewed')}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
          >
            Mark Reviewed
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => openDismissDialog([...selectedIds])}
            className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50"
          >
            Không quan tâm
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => runBulk('dismissed')}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={allPageSelected}
            onChange={toggleSelectAll}
            className="rounded border-slate-700 bg-slate-950"
          />
          Chọn tất cả (trang hiện tại)
        </label>
        <span className="text-[11px] text-slate-600">
          {total} lead · trang {page}/{totalPages || 1}
        </span>
      </div>

      {findings.length === 0 ? (
        <AgentPanelEmpty
          title="Chưa có lead phù hợp"
          description="Thử đổi bộ lọc nhanh, hoặc đợi worker quét và AI phân tích thêm."
        />
      ) : (
        <div className="space-y-3">
          {findings.map(finding => {
            const resolved = resolveLeadIntelligence(finding);
            const phoneDisplay = formatVietnamPhoneDisplay(resolved.primaryPhone);
            const secondaryHotline = resolved.contact.phones.find(
              p => p.label === 'hotline' && p.normalized !== resolved.primaryPhone,
            );
            const hotlineDisplay = secondaryHotline
              ? formatVietnamPhoneDisplay(secondaryHotline.normalized)
              : null;
            const publishedAt =
              finding.scannedContent?.publishedAt || finding.scannedContent?.collectedAt;
            const postUrl = finding.scannedContent?.canonicalUrl;
            const busy = busyId === finding.id;
            const roadLabel =
              resolved.property.roadWidthMeters != null
                ? `${String(resolved.property.roadWidthMeters).replace('.', ',')} m`
                : null;
            const pavementLabel =
              resolved.property.pavementWidthMeters != null
                ? `lề ${String(resolved.property.pavementWidthMeters).replace('.', ',')} m`
                : null;
            const specs = [
              resolved.property.areaMinM2 || resolved.property.areaMaxM2
                ? `${resolved.property.areaMinM2 || resolved.property.areaMaxM2} m²`
                : null,
              roadLabel && pavementLabel
                ? `${roadLabel} · ${pavementLabel}`
                : roadLabel || pavementLabel,
              resolved.property.direction ? `Hướng ${resolved.property.direction}` : null,
              resolved.property.frontageMeters
                ? `MT ${resolved.property.frontageMeters}m`
                : null,
              !resolved.isSupplySide ? resolved.demand.purpose : null,
              !resolved.isSupplySide ? resolved.requirements.otherRequirements[0] : null,
            ].filter(Boolean);
            const typeLabel = resolved.isSupplySide
              ? `Nguồn hàng · ${
                  resolved.intent === 'lease_out' || resolved.classification === 'landlord'
                    ? 'Cho thuê'
                    : 'Bán'
                } ${
                  resolved.propertyTypes.includes('land') ||
                  resolved.propertyTypes.some(t => /đất|lô/.test(t))
                    ? 'đất'
                    : resolved.propertyTypes.find(t => t !== 'land') || 'BĐS'
                }`
              : resolved.propertyTypes.length
                ? resolved.propertyTypes.filter(t => t !== 'land').join(', ') || 'land'
                : 'Chưa rõ loại BĐS';

            return (
              <article
                key={finding.id}
                className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 transition hover:border-slate-700"
              >
                <div className="flex flex-col gap-4 lg:flex-row">
                  {/* Left ~70% — info */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(finding)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetail(finding);
                      }
                    }}
                    className="min-w-0 flex-1 cursor-pointer lg:w-[72%]"
                  >
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(finding.id)}
                        onClick={e => toggleSelect(finding.id, e)}
                        onChange={() => undefined}
                        className="mt-1 rounded border-slate-700 bg-slate-950"
                        aria-label="Chọn lead"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                              resolved.scoreStatus === 'scored'
                                ? 'bg-rose-500/20 text-rose-300'
                                : resolved.scoreStatus === 'provisional'
                                  ? 'bg-amber-500/20 text-amber-200'
                                  : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {resolved.displayScoreLabel}
                          </span>
                          <span className="rounded bg-sky-950/50 px-2 py-0.5 text-[10px] uppercase text-sky-300">
                            {resolved.displayClassificationLabel}
                          </span>
                          {resolved.intent && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                              {resolved.intent}
                            </span>
                          )}
                          <span className="text-[10px] uppercase text-slate-600">
                            {finding.status}
                          </span>
                          {resolved.priority && (
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                                PRIORITY_TONE[resolved.priority] || PRIORITY_TONE.cool
                              }`}
                            >
                              {resolved.priority}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2 text-base font-semibold text-white">
                          {resolved.displayPersonName}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          {phoneDisplay ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <Phone className="h-3.5 w-3.5" />
                                {phoneDisplay}
                              </span>
                              <button
                                type="button"
                                onClick={e => copyPhone(phoneDisplay, e)}
                                className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                                title="Copy SĐT"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              {hotlineDisplay && (
                                <span className="text-xs text-slate-500">
                                  Hotline phụ: {hotlineDisplay}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-500">Chưa có số điện thoại</span>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-slate-300">
                          <span className="text-slate-500">
                            {resolved.isSupplySide ? 'Mô tả: ' : 'Nhu cầu: '}
                          </span>
                          {resolved.demand.needSummary}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          <span className="text-slate-500">
                            {resolved.isSupplySide ? 'Giá chào: ' : 'Ngân sách: '}
                          </span>
                          {resolved.displayBudgetLabel}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {resolved.primaryLocation || 'Chưa xác định vị trí'}
                          </span>
                          <span>{typeLabel}</span>
                          {specs.length > 0 && <span>{specs.join(' · ')}</span>}
                        </div>
                        {resolved.content.shortDescription &&
                          resolved.content.shortDescription !== resolved.demand.needSummary && (
                            <p className="mt-2 line-clamp-3 text-xs text-slate-500">
                              {resolved.content.shortDescription}
                            </p>
                          )}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                          <span>Nguồn: {resolved.source.sourceName || finding.source?.name || '—'}</span>
                          <span>TG: {resolved.source.authorName || '—'}</span>
                          <span>{formatAgentDate(publishedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right ~28% — actions */}
                  <div
                    className="grid shrink-0 grid-cols-2 gap-1 border-t border-slate-800 pt-3 lg:w-[240px] lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0"
                    onClick={e => e.stopPropagation()}
                  >
                    {resolved.isSupplySide || resolved.externalInventoryPreferred ? (
                      <>
                        <ActionBtn
                          primary
                          disabled={busy}
                          onClick={() => {
                            if (finding.externalInventoryItemId) {
                              navigate('/admin/agents/external-inventory');
                              return;
                            }
                            saveExternal(finding);
                          }}
                        >
                          {finding.externalInventoryItemId
                            ? 'Đã lưu giỏ ngoài'
                            : 'Lưu giỏ hàng ngoài'}
                        </ActionBtn>
                        <ActionBtn disabled={busy} onClick={() => markReviewed(finding)}>
                          Đã xem
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => openDismissDialog([finding.id])}
                        >
                          Không quan tâm
                        </ActionBtn>
                        {hasOriginalPostUrl(postUrl) ? (
                          <a
                            href={postUrl!}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-slate-900"
                          >
                            Mở bài gốc <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="rounded px-2 py-1 text-[11px] text-slate-600"
                          >
                            Mở bài gốc
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <ActionBtn
                          primary
                          disabled={busy || (!canPromote && !finding.promotedLeadId)}
                          onClick={() => {
                            if (
                              finding.promotedLeadId ||
                              finding.status === 'promoted' ||
                              finding.status === 'promoted_to_investor_lead'
                            ) {
                              goToInvestorLeads();
                              return;
                            }
                            promoteFinding(finding);
                          }}
                        >
                          {finding.promotedLeadId ||
                          finding.status === 'promoted' ||
                          finding.status === 'promoted_to_investor_lead'
                            ? 'Xem Leads đầu tư'
                            : 'Chuyển Lead đầu tư'}
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy || !resolved.matchingEnabled}
                          onClick={() => openMatching(finding)}
                        >
                          Matching
                        </ActionBtn>
                        <ActionBtn disabled={busy} onClick={() => createReply(finding)}>
                          Tạo phản hồi
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => {
                            if (finding.externalInventoryItemId) {
                              navigate('/admin/agents/external-inventory');
                              return;
                            }
                            saveExternal(finding);
                          }}
                        >
                          {finding.externalInventoryItemId
                            ? 'Đã lưu giỏ ngoài'
                            : 'Lưu giỏ ngoài'}
                        </ActionBtn>
                        <ActionBtn disabled={busy} onClick={() => markReviewed(finding)}>
                          Đã xem
                        </ActionBtn>
                        <ActionBtn
                          disabled={busy}
                          onClick={() => openDismissDialog([finding.id])}
                        >
                          Không quan tâm
                        </ActionBtn>
                        {hasOriginalPostUrl(postUrl) ? (
                          <a
                            href={postUrl!}
                            target="_blank"
                            rel="noreferrer"
                            className="col-span-2 inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-slate-900"
                          >
                            Mở bài gốc <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="col-span-2 rounded px-2 py-1 text-[11px] text-slate-600"
                          >
                            Mở bài gốc
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      )}

      {selectedFinding && (
        <FindingDetailDrawer
          finding={selectedFinding}
          tab={detailTab}
          onTabChange={setDetailTab}
          onClose={() => setSelectedFinding(null)}
          busy={busyId === selectedFinding.id}
          canPromote={canPromote}
          onPromote={() => patchStatus(selectedFinding, 'promoted')}
          onReviewed={() => patchStatus(selectedFinding, 'reviewed')}
          onDismiss={() => openDismissDialog([selectedFinding.id])}
          onCreateReply={() => createReply(selectedFinding)}
        />
      )}

      {dismissOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Không quan tâm</h3>
              <button
                type="button"
                onClick={() => setDismissOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-900 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {dismissTargetIds.length} lead · chọn lý do dismiss
            </p>
            <label className="mb-1 block text-[11px] text-slate-500">Lý do</label>
            <select
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200"
            >
              {DISMISS_REASONS.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-[11px] text-slate-500">Ghi chú (tuỳ chọn)</label>
            <textarea
              value={dismissNote}
              onChange={e => setDismissNote(e.target.value)}
              rows={3}
              className="mb-4 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
              placeholder="Thêm ghi chú…"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDismissOpen(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={submitDismiss}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {matchOpen && matchFinding && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Matching — {matchFinding.title}</h3>
              <button
                type="button"
                onClick={() => setMatchOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {!matchData ? (
              <p className="text-xs text-slate-500">Đang tìm khớp…</p>
            ) : (
              <div className="space-y-4">
                {matchData.missingReason && (
                  <p className="text-xs text-amber-400">{matchData.missingReason}</p>
                )}
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase text-emerald-400">
                    Giỏ hàng chính thức
                  </h4>
                  {matchData.official.length === 0 ? (
                    <p className="text-xs text-slate-600">Không có kết quả</p>
                  ) : (
                    <ul className="space-y-2">
                      {matchData.official.map(item => (
                        <li
                          key={String(item.itemId)}
                          className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs"
                        >
                          <div className="font-semibold text-slate-200">{String(item.title)}</div>
                          <div className="mt-1 text-slate-500">
                            Điểm {String(item.matchScore)} · {String(item.location || '—')}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase text-amber-400">
                    Giỏ hàng ngoài — chưa xác minh
                  </h4>
                  {matchData.external.length === 0 ? (
                    <p className="text-xs text-slate-600">Không có kết quả</p>
                  ) : (
                    <ul className="space-y-2">
                      {matchData.external.map(item => (
                        <li
                          key={String(item.itemId)}
                          className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs"
                        >
                          <div className="font-semibold text-slate-200">{String(item.title)}</div>
                          <div className="mt-1 text-slate-500">
                            Điểm {String(item.matchScore)} · {String(item.location || '—')} ·{' '}
                            {String(item.contact || '—')}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
      className={`w-full rounded px-2 py-1 text-[11px] font-medium leading-tight disabled:opacity-40 ${
        primary
          ? 'bg-emerald-700 text-white hover:bg-emerald-600'
          : 'border border-slate-700/80 bg-slate-950 text-slate-300 hover:bg-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function FindingDetailDrawer({
  finding,
  tab,
  onTabChange,
  onClose,
  busy,
  canPromote,
  onPromote,
  onReviewed,
  onDismiss,
  onCreateReply,
}: {
  finding: AgentFinding;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  busy: boolean;
  canPromote: boolean;
  onPromote: () => void;
  onReviewed: () => void;
  onDismiss: () => void;
  onCreateReply: () => void;
}) {
  const resolved = resolveLeadIntelligence(finding);
  const extracted = asRecord(finding.extractedData);
  const contact = asRecord(extracted.contact);
  const money = asRecord(extracted.money);
  const location = asRecord(extracted.location);
  const property = asRecord(extracted.property);
  const requirements = asRecord(extracted.requirements);
  const intelligence = asRecord(extracted.intelligence);
  const analysis = asRecord(extracted.analysis);
  const diagnostics = asRecord(extracted.diagnostics);
  const matching = asRecord(extracted.matching);
  const sourceMeta = asRecord(extracted.source);

  const reasons = Array.isArray(finding.reasons)
    ? finding.reasons.map(String)
    : Array.isArray(intelligence.reasons)
      ? intelligence.reasons.map(String)
      : [];
  const missing = Array.isArray(intelligence.missingInformation)
    ? intelligence.missingInformation.map(String)
    : resolved.requirementsList.length
      ? []
      : [];
  const keywordMatches = [
    ...(Array.isArray(diagnostics.matchedPositive)
      ? diagnostics.matchedPositive.map(v => `+ ${String(v)}`)
      : []),
    ...(Array.isArray(diagnostics.matchedNegative)
      ? diagnostics.matchedNegative.map(v => `− ${String(v)}`)
      : []),
  ];
  const matchedProperties = Array.isArray(matching.matchedProperties)
    ? matching.matchedProperties
    : [];
  const dedupe = asRecord(diagnostics.dedupe);
  const originalUrl = finding.scannedContent?.canonicalUrl;
  const contentText =
    finding.scannedContent?.contentText ||
    (typeof sourceMeta.contentText === 'string' ? sourceMeta.contentText : '') ||
    '';
  const phoneDisplay = formatVietnamPhoneDisplay(resolved.primaryPhone);
  const domainMeta = asRecord(extracted.domain);
  const isOutOfDomain =
    finding.dismissReason === 'out_of_domain' ||
    domainMeta.isRealEstateRelevant === false ||
    String(domainMeta.classification || '') === 'vehicle' ||
    String(domainMeta.classification || '') === 'consumer_goods';
  const domainLabel =
    String(domainMeta.classification || '') === 'vehicle'
      ? 'Xe cộ'
      : String(domainMeta.classification || '') === 'consumer_goods'
        ? 'Hàng tiêu dùng'
        : String(domainMeta.classification || finding.dismissReason || 'Ngoài lĩnh vực');

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'structured', label: 'Structured Data' },
    { id: 'original', label: 'Original Post' },
    { id: 'insights', label: 'AI Insights' },
  ];

  const copyPhone = async () => {
    if (!resolved.primaryPhone) return;
    try {
      await navigator.clipboard.writeText(resolved.primaryPhone);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-[1px]">
      <button type="button" className="flex-1 cursor-default" aria-label="Đóng" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  resolved.showAsConfirmedLead
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {resolved.displayScoreLabel}
              </span>
              <span className="rounded bg-sky-950/50 px-2 py-0.5 text-[10px] uppercase text-sky-300">
                {resolved.displayClassificationLabel}
              </span>
              {resolved.intent && resolved.showAsConfirmedLead && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                  {resolved.intent}
                </span>
              )}
              <span className="text-[10px] uppercase text-slate-500">{finding.status}</span>
              {isOutOfDomain && (
                <span className="rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                  Ngoài lĩnh vực
                </span>
              )}
            </div>
            {isOutOfDomain && (
              <p className="mt-1 text-xs text-amber-200/90">
                Domain: {domainLabel}
                {finding.dismissNote ? ` · ${finding.dismissNote}` : ''}
              </p>
            )}
            <h3 className="mt-2 text-base font-bold text-white">{resolved.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-900 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-3 pt-2">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-xs font-medium ${
                tab === t.id
                  ? 'bg-slate-900 text-rose-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview' && (
            <div className="space-y-3">
              {resolved.dataInconsistent && (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  Dữ liệu lệch — xem tab AI Insights. Không tự coi là buyer đã xác nhận.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-sky-950/50 px-2 py-1 text-[11px] text-sky-300">
                  {resolved.displayClassificationLabel}
                </span>
                {resolved.intent && (
                  <span className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                    {resolved.intent}
                  </span>
                )}
                {resolved.priority && resolved.showAsConfirmedLead && (
                  <span className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                    {resolved.priority}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-300">{resolved.summary}</p>
              {resolved.recommendedAction && (
                <p className="text-xs text-emerald-400">→ {resolved.recommendedAction}</p>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Điểm</div>
                  <div className="mt-0.5 font-semibold text-white">{resolved.displayScoreLabel}</div>
                </div>
                <div>
                  <div className="text-slate-500">Ngân sách</div>
                  <div className="mt-0.5 text-slate-200">
                    {formatResolvedBudget(resolved.budgetMin, resolved.budgetMax)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Vị trí</div>
                  <div className="mt-0.5 text-slate-200">{resolved.primaryLocation || 'Chưa xác định'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Loại BĐS</div>
                  <div className="mt-0.5 text-slate-200">
                    {resolved.propertyTypes[0] || 'Chưa xác định'}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-500">SĐT (post_body)</div>
                  <div className="mt-0.5 flex items-center gap-2 text-emerald-400">
                    {phoneDisplay || 'Chưa xác định'}
                    {resolved.primaryPhone && (
                      <button
                        type="button"
                        onClick={copyPhone}
                        className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Nguồn</div>
                  <div className="mt-0.5 text-slate-200">{finding.source?.name || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Status</div>
                  <div className="mt-0.5 text-slate-200">{finding.status}</div>
                </div>
              </div>
              {hasOriginalPostUrl(originalUrl) ? (
                <a
                  href={originalUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 hover:underline"
                >
                  Mở bài gốc <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="text-xs text-amber-500/80">Chưa có link bài gốc</span>
              )}
            </div>
          )}

          {tab === 'structured' && (
            <div className="space-y-3">
              <SectionBlock title="Contact">
                <FieldRow label="SĐT chính" value={phoneDisplay || 'Chưa xác định'} />
                <FieldRow label="Danh sách SĐT" value={displayValue(resolved.phones)} />
                <FieldRow label="Email" value={displayValue(contact.emails)} />
                <FieldRow label="Facebook" value={displayValue(contact.facebookAuthorUrl)} />
              </SectionBlock>
              <SectionBlock title="Demand">
                <FieldRow label="Classification" value={resolved.displayClassificationLabel} />
                <FieldRow label="Intent" value={displayValue(resolved.intent)} />
                <FieldRow label="Actor role" value={displayValue(resolved.actorRole)} />
                <FieldRow label="Urgency" value={displayValue(resolved.urgency)} />
                <FieldRow
                  label="Ngân sách"
                  value={formatResolvedBudget(resolved.budgetMin, resolved.budgetMax)}
                />
              </SectionBlock>
              <SectionBlock title="Property">
                <FieldRow label="Loại" value={displayValue(resolved.propertyTypes)} />
                <FieldRow label="Diện tích min" value={displayValue(property.areaMinM2)} />
                <FieldRow label="Diện tích max" value={displayValue(property.areaMaxM2)} />
                <FieldRow label="Pháp lý" value={displayValue(property.legalStatus)} />
                <FieldRow
                  label="Giá hỏi"
                  value={
                    resolved.askingPrice != null
                      ? formatMoney(resolved.askingPrice)
                      : 'Chưa xác định'
                  }
                />
              </SectionBlock>
              <SectionBlock title="Location">
                <FieldRow label="Chính" value={resolved.primaryLocation || 'Chưa xác định'} />
                <FieldRow label="Quận/Huyện" value={displayValue(location.district)} />
                <FieldRow label="Phường" value={displayValue(location.ward)} />
                <FieldRow label="Đường" value={displayValue(location.street)} />
                <FieldRow label="Raw" value={displayValue(location.rawMentions)} />
              </SectionBlock>
              <SectionBlock title="Requirements">
                <FieldRow label="Ô tô vào" value={displayValue(requirements.carAccess)} />
                <FieldRow label="Mặt tiền" value={displayValue(requirements.mainRoad)} />
                <FieldRow label="Gần trung tâm" value={displayValue(requirements.nearCenter)} />
                <FieldRow label="Gần biển" value={displayValue(requirements.nearSea)} />
                <FieldRow label="Khác" value={displayValue(resolved.requirementsList)} />
              </SectionBlock>
              <SectionBlock title="Missing">
                {missing.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa xác định</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                    {missing.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </SectionBlock>
            </div>
          )}

          {tab === 'original' && (
            <div className="space-y-3">
              <FieldRow label="Author" value={displayValue(finding.scannedContent?.authorName)} />
              <FieldRow
                label="Author URL"
                value={
                  finding.scannedContent?.authorUrl ? (
                    <a
                      href={finding.scannedContent.authorUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-rose-400 hover:underline"
                    >
                      {finding.scannedContent.authorUrl}
                    </a>
                  ) : (
                    'Chưa xác định'
                  )
                }
              />
              <FieldRow
                label="Canonical URL"
                value={
                  originalUrl ? (
                    <a
                      href={originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-rose-400 hover:underline"
                    >
                      {originalUrl}
                    </a>
                  ) : (
                    'Chưa xác định'
                  )
                }
              />
              <FieldRow
                label="Published"
                value={formatAgentDate(finding.scannedContent?.publishedAt)}
              />
              <FieldRow
                label="Collected"
                value={formatAgentDate(finding.scannedContent?.collectedAt)}
              />
              <FieldRow label="Money mentions" value={displayValue(money.rawMentions)} />
              <FieldRow label="Location mentions" value={displayValue(location.rawMentions)} />
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Nội dung gốc
                </h4>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">
                  {contentText.trim() || 'Chưa xác định'}
                </pre>
              </div>
              {hasOriginalPostUrl(originalUrl) && (
                <a
                  href={originalUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 hover:underline"
                >
                  Mở bài gốc <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {tab === 'insights' && (
            <div className="space-y-3">
              {resolved.consistencyWarnings.length > 0 && (
                <SectionBlock title="Consistency">
                  <ul className="list-disc space-y-1 pl-4 text-xs text-amber-300">
                    {resolved.consistencyWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </SectionBlock>
              )}
              <SectionBlock title="Analysis status">
                <FieldRow label="Status" value={resolved.analysisStatus} />
              </SectionBlock>
              <SectionBlock title="Reasons">
                {reasons.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa xác định</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                    {reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                )}
              </SectionBlock>
              <SectionBlock title="Score breakdown">
                <FieldRow label="Keyword" value={resolved.keywordScore ?? '—'} />
                <FieldRow label="AI" value={resolved.aiScore ?? '—'} />
                <FieldRow label="Lead fit" value={resolved.leadFitScore ?? '—'} />
                <FieldRow label="Final" value={resolved.finalScore ?? 'Chưa chấm'} />
                <FieldRow label="Confidence" value={resolved.confidence ?? '—'} />
                <FieldRow
                  label="Legacy score (ignored)"
                  value={finding.score != null ? String(finding.score) : '—'}
                />
              </SectionBlock>
              <SectionBlock title="Keyword matches">
                {keywordMatches.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa xác định</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                    {keywordMatches.map((k, idx) => (
                      <li key={idx}>{k}</li>
                    ))}
                  </ul>
                )}
              </SectionBlock>
              <SectionBlock title="Provider / version">
                <FieldRow label="Provider" value={displayValue(analysis.provider)} />
                <FieldRow label="Model" value={displayValue(analysis.model)} />
                <FieldRow label="Prompt" value={displayValue(analysis.promptVersion)} />
                <FieldRow
                  label="Intelligence"
                  value={displayValue(finding.intelligenceVersion || analysis.extractionVersion)}
                />
                <FieldRow label="Analyzed at" value={displayValue(analysis.analyzedAt)} />
              </SectionBlock>
              <SectionBlock title="Dedupe">
                <FieldRow label="Status" value={displayValue(finding.dedupeStatus)} />
                <FieldRow label="Similarity" value={displayValue(finding.similarityScore)} />
                <FieldRow label="Reason" value={displayValue(finding.dedupeReason || dedupe.reason)} />
                <FieldRow label="Duplicate of" value={displayValue(finding.duplicateOfFindingId)} />
              </SectionBlock>
              <SectionBlock title="Matching properties">
                {matchedProperties.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {displayValue(matching.missingReason || 'Chưa xác định')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {matchedProperties.map((item, idx) => {
                      const row = asRecord(item);
                      return (
                        <li
                          key={idx}
                          className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-xs text-slate-300"
                        >
                          <div className="font-medium text-white">
                            {displayValue(row.title || row.propertyId)}
                          </div>
                          <div className="mt-0.5 text-slate-500">
                            score {displayValue(row.matchScore)} · {displayValue(row.reasons)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionBlock>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-800 px-5 py-3">
          {!isOutOfDomain && canPromote && (
            <button
              type="button"
              disabled={busy}
              onClick={onPromote}
              className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Chuyển Lead đầu tư
            </button>
          )}
          {!isOutOfDomain && (
            <button
              type="button"
              disabled={busy}
              onClick={onCreateReply}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Tạo phản hồi
            </button>
          )}
          {!isOutOfDomain && (
            <button
              type="button"
              disabled={busy}
              onClick={onReviewed}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
            >
              Đã xem
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-lg border border-amber-800/60 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50"
          >
            Không quan tâm
          </button>
          {hasOriginalPostUrl(originalUrl) && (
            <a
              href={originalUrl!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
            >
              Mở bài gốc <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
