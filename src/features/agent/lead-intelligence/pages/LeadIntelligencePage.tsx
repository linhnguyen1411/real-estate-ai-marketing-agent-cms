import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
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
} from '../../../../services/agentPlatformApi';
import type { AgentFinding } from '../../../../types/agentPlatform';
import type { UserRole } from '../../../../types';
import { formatVietnamPhoneDisplay } from '@/shared/agent-domain';
import {
  AgentPanelEmpty,
  AgentPanelError,
  AgentPanelHeader,
  AgentPanelLoader,
  formatAgentDate,
} from '../../shared/AgentPlatformUi';
import FindingDetailDrawer from '../components/FindingDetailDrawer';
import {
  type DetailTab,
  intelligenceOf,
  hasOriginalPostUrl,
  ActionBtn,
} from '../components/leadIntelligenceDisplay';
import MatchingPanel, { type MatchResultData } from '../matching/MatchingPanel';

type Props = {
  userRole: UserRole;
};

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

export default function LeadIntelligencePage({ userRole }: Props) {
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
  const [matchData, setMatchData] = useState<MatchResultData | null>(null);
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
      const { invalidateAfterLeadPromote } = await import('../../../../services/queryCache');
      invalidateAfterLeadPromote();
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
            const resolved = intelligenceOf(finding);
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
        <MatchingPanel
          finding={matchFinding}
          matchData={matchData}
          onClose={() => setMatchOpen(false)}
        />
      )}
    </div>
  );
}
