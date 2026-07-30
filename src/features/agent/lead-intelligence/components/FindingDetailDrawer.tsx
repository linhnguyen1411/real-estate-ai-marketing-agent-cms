import React from 'react';
import {
  ExternalLink,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import type { AgentFinding } from '../../../../types/agentPlatform';
import {
  formatVietnamPhoneDisplay,
  formatResolvedBudget,
} from '@/shared/agent-domain';
import { formatAgentDate } from '../../shared/AgentPlatformUi';
import {
  type DetailTab,
  intelligenceOf,
  asRecord,
  displayValue,
  formatMoney,
  hasOriginalPostUrl,
  resolveOriginalPostHref,
  FieldRow,
  SectionBlock,
} from './leadIntelligenceDisplay';

export default function FindingDetailDrawer({
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
  const resolved = intelligenceOf(finding);
  // Diagnostics / matching evidence still live under extractedData until R2 repository split;
  // primary person/score/classification/phone/summary come from `resolved` (API intelligence).
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
    : resolved.intelligence.reasons.length
      ? resolved.intelligence.reasons.map(String)
      : Array.isArray(intelligence.reasons)
        ? intelligence.reasons.map(String)
        : [];
  const missing = Array.isArray(resolved.intelligence.missingInformation)
    && resolved.intelligence.missingInformation.length
    ? resolved.intelligence.missingInformation.map(String)
    : Array.isArray(intelligence.missingInformation)
      ? intelligence.missingInformation.map(String)
      : resolved.requirementsList.length
        ? []
        : [];  const keywordMatches = [
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
                  href={resolveOriginalPostHref(originalUrl) || originalUrl!}
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
                      href={resolveOriginalPostHref(originalUrl) || originalUrl}
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
                  href={resolveOriginalPostHref(originalUrl) || originalUrl!}
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
              href={resolveOriginalPostHref(originalUrl) || originalUrl!}
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
