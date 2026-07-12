import type { ResolvedLeadIntelligence } from '../../src/utils/resolveLeadIntelligence';
import { formatResolvedBudget } from '../../src/utils/resolveLeadIntelligence';

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
};

function classificationLabel(value: string | null | undefined): string {
  const v = String(value || '').toLowerCase();
  if (v === 'buyer') return 'Người mua';
  if (v === 'renter') return 'Người thuê';
  if (v === 'investor') return 'Nhà đầu tư';
  if (v === 'broker_demand' || v === 'broker') return 'Môi giới cầu';
  return value || 'Lead';
}

/**
 * Build a Telegram-friendly plain-text message for a new finding.
 */
export function formatFindingTelegramMessage(
  finding: FindingLike,
  resolved: ResolvedLeadIntelligence | null | undefined,
  options: TelegramFormatOptions = {},
): string {
  const includePhone = options.includePhone !== false;
  const includeBudget = options.includeBudget !== false;
  const includeLocation = options.includeLocation !== false;
  const includeLink = options.includeLink !== false;

  const score = resolved?.finalScore ?? finding.finalScore ?? finding.score ?? 0;
  const classification = resolved?.classification ?? finding.classification;
  const need =
    resolved?.demand.needSummary ||
    finding.needSummary ||
    resolved?.summary ||
    finding.summary ||
    finding.title ||
    'Lead mới';

  const lines: string[] = [`Lead mới ${score}/100`, need.slice(0, 300)];

  if (classification) {
    lines.push(`Loại: ${classificationLabel(classification)}`);
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

  if (includeLocation) {
    const location =
      resolved?.location.primary ||
      finding.primaryLocation ||
      [resolved?.location.district, resolved?.location.city].filter(Boolean).join(', ');
    if (location) lines.push(`Khu vực: ${location}`);
  }

  const sourceName = resolved?.source.groupName || resolved?.source.sourceName;
  if (sourceName) lines.push(`Nguồn: ${sourceName}`);

  if (includeLink) {
    const findingId = finding.id || resolved?.findingId;
    const base = (options.siteBaseUrl || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    if (base && findingId) {
      lines.push(`Mở Lead Intelligence: ${base}/admin/agents/findings`);
    }
    const postUrl = resolved?.source.canonicalUrl;
    if (postUrl) lines.push(`Bài gốc: ${postUrl}`);
  }

  return lines.filter(Boolean).join('\n');
}
