import type { ResolvedLeadIntelligence } from '../../shared/agent-domain';
import { formatResolvedBudget } from '../../shared/agent-domain';
import { normalizeSocialLinks } from '../modules/link-normalization';

export type TelegramFormatOptions = {
  includePhone?: boolean;
  includeBudget?: boolean;
  includeLocation?: boolean;
  includeLink?: boolean;
  siteBaseUrl?: string;
};

type FindingLike = {
  id?: string;
  title?: string | null;
  summary?: string | null;
  finalScore?: number | null;
  score?: number | null;
  classification?: string | null;
  primaryPhone?: string | null;
  primaryLocation?: string | null;
  needSummary?: string | null;
  propertyType?: string | null;
};

function classificationLabel(value: string | null | undefined): string {
  const v = String(value || '').toLowerCase();
  if (v === 'buyer') return 'Người mua';
  if (v === 'renter') return 'Người thuê';
  if (v === 'investor') return 'Nhà đầu tư';
  if (v === 'broker_demand' || v === 'broker') return 'Môi giới cầu';
  if (v === 'seller') return 'Người bán';
  if (v === 'landlord') return 'Cho thuê';
  return value || 'Lead';
}

function propertyTypeDisplay(
  resolved: ResolvedLeadIntelligence | null | undefined,
  finding: FindingLike,
): string | null {
  const types = resolved?.property?.propertyTypes?.length
    ? resolved.property.propertyTypes
    : finding.propertyType
      ? [finding.propertyType]
      : [];
  if (!types.length) return null;
  const first = types.find(t => t !== 'land') || types[0];
  const key = String(first || '').toLowerCase();
  if (key === 'land' || /đất|dat|lô/.test(key)) return 'Đất';
  if (/nhà\s*phố|nha\s*pho|townhouse|house|nhà/.test(key) || key === 'house') return 'Nhà phố';
  if (/căn\s*hộ|can\s*ho|apartment|condo/.test(key) || key === 'apartment') return 'Căn hộ';
  if (/biệt\s*thự|biet\s*thu|villa/.test(key)) return 'Biệt thự';
  if (/shophouse|shop/.test(key)) return 'Shophouse';
  return first;
}

export type LeadTelegramFormatResult = {
  text: string;
  postUrl: string | null;
  groupUrl: string | null;
  canonicalUrl: string | null;
  postId: string | null;
  groupId: string | null;
  score: number;
};

/**
 * Build a Telegram-friendly plain-text message for a new finding (smart lead alert).
 */
export function formatFindingTelegramMessage(
  finding: FindingLike,
  resolved: ResolvedLeadIntelligence | null | undefined,
  options: TelegramFormatOptions = {},
): string {
  return formatLeadTelegramAlert(finding, resolved, options).text;
}

/** Rich lead alert + normalized link metadata (no network I/O). */
export function formatLeadTelegramAlert(
  finding: FindingLike,
  resolved: ResolvedLeadIntelligence | null | undefined,
  options: TelegramFormatOptions = {},
): LeadTelegramFormatResult {
  const includePhone = options.includePhone !== false;
  const includeBudget = options.includeBudget !== false;
  const includeLocation = options.includeLocation !== false;
  const includeLink = options.includeLink !== false;

  const score = resolved?.finalScore ?? finding.finalScore ?? finding.score ?? 0;
  const classification = resolved?.classification ?? finding.classification;
  const location =
    resolved?.location.primary ||
    finding.primaryLocation ||
    [resolved?.location.district, resolved?.location.city].filter(Boolean).join(', ');
  const propertyLabel = propertyTypeDisplay(resolved, finding);
  const groupName = resolved?.source.groupName || resolved?.source.sourceName;

  const lines: string[] = [`Lead mới (${score}/100)`, ''];

  if (classification) {
    lines.push(`👤 ${classificationLabel(classification)}`);
  }
  if (includeLocation && location) {
    lines.push(`📍 ${location}`);
  }
  if (propertyLabel) {
    lines.push(`🏷 ${propertyLabel}`);
  }
  if (groupName) {
    lines.push(`📂 Group:`);
    lines.push(String(groupName).slice(0, 200));
  }

  const need =
    resolved?.demand.needSummary ||
    finding.needSummary ||
    resolved?.summary ||
    finding.summary ||
    finding.title;
  if (need) {
    lines.push('');
    lines.push(String(need).slice(0, 300));
  }

  if (includeBudget) {
    const budget = formatResolvedBudget(
      resolved?.demand.buyerBudgetMin ?? null,
      resolved?.demand.buyerBudgetMax ?? null,
    );
    if (budget && budget !== 'Chưa xác định') {
      lines.push(`Ngân sách: ${budget}`);
    }
  }

  if (includePhone) {
    const phone = resolved?.primaryPhone || finding.primaryPhone;
    if (phone) lines.push(`SĐT: ${phone}`);
  }

  const sourceEd =
    resolved && typeof resolved === 'object'
      ? (resolved as unknown as { source?: Record<string, unknown> }).source
      : undefined;
  const links = normalizeSocialLinks({
    canonicalUrl: resolved?.source.canonicalUrl,
    postUrl: resolved?.source.canonicalUrl,
    groupUrl:
      (typeof sourceEd?.groupUrl === 'string' ? sourceEd.groupUrl : null) ||
      null,
    groupId: typeof sourceEd?.groupId === 'string' ? sourceEd.groupId : null,
    postId: typeof sourceEd?.postId === 'string' ? sourceEd.postId : null,
  });

  // Prefer group URL from group name only when we already have groupId from URL
  if (includeLink) {
    const findingId = finding.id || resolved?.findingId;
    const base = (options.siteBaseUrl || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    if (base && findingId) {
      lines.push('');
      lines.push(`CMS: ${base}/admin/agents/findings`);
    }
  }

  return {
    text: lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim(),
    postUrl: links.postUrl,
    groupUrl: links.groupUrl,
    canonicalUrl: links.canonicalUrl,
    postId: links.postId,
    groupId: links.groupId,
    score: Number(score) || 0,
  };
}
