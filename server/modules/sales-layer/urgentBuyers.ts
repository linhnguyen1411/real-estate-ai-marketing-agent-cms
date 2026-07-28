/**
 * H2.4.9 — Urgent Buyers drill-down (same dataset as pipeline urgentBuyers count).
 * List = summary only; Open → canonical Sales Action Card (no second lead format).
 */

import type { InlineKeyboard } from '../control-plane/inlineKeyboard';
import type { SalesLayerProfile } from './types';
import { classifyBuyerHeat } from './buyerHeat';
import { normalizeTy } from './pipelineValue';
import { timelineLabel } from './salesActionCardViewModel';
import {
  resolveLeadAlertRole,
  truncFindingIdForCallback,
  formatBudgetLabel,
  type LeadAlertRole,
} from './telegramSalesActionCard';

export type UrgentBuyerSummary = {
  id: string;
  personName: string | null;
  persona: LeadAlertRole | null;
  propertyType: string | null;
  location: string | null;
  budget: string | null;
  timeline: string | null;
  confidence: number;
  priority: number;
  nextAction: string | null;
};

export type PipelineSalesRow = {
  findingId: string;
  personName: string | null;
  title: string | null;
  propertyType: string | null;
  location: string | null;
  classification: string | null;
  budgetMin: number | bigint | null;
  budgetMax: number | bigint | null;
  askingPrice: number | bigint | null;
  confidencePct: number;
  profile: SalesLayerProfile;
  campaignId: string | null;
  campaignName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  createdAt: Date | string | null;
  closedAt: string | null;
  intent: string | null;
  persona: string | null;
  isBuyer: boolean | null;
  timeline: string | null;
};

const ROLE_LABEL: Record<LeadAlertRole, string> = {
  buyer: 'Người mua',
  tenant: 'Người thuê',
  investor: 'Nhà đầu tư',
};

const PAGE_SIZE = 5;

/** Same definition as aggregatePipelineValue.urgentBuyers */
export function isUrgentSalesProfile(profile: SalesLayerProfile): boolean {
  return profile.recommendation?.urgency === 'urgent';
}

export function urgencyPriority(row: PipelineSalesRow): number {
  let p = row.confidencePct;
  if (row.profile.recommendation.code === 'call_now') p += 20;
  if (row.profile.recommendation.code === 'send_quote') p += 10;
  if (row.profile.followUp.needsFollowUp) p += 5;
  const deal = row.profile.expectedDealTy ?? normalizeTy(row.budgetMax) ?? 0;
  p += Math.min(15, Number(deal) || 0);
  return p;
}

function formatBudget(row: PipelineSalesRow, role: LeadAlertRole | null): string | null {
  return formatBudgetLabel(
    row.budgetMin,
    row.budgetMax,
    row.profile.expectedDealTy,
    role || 'buyer',
  );
}

export function toUrgentBuyerSummary(row: PipelineSalesRow): UrgentBuyerSummary {
  const role =
    resolveLeadAlertRole({
      intent: row.intent,
      classification: row.classification,
      persona: row.persona,
      isBuyer: row.isBuyer ?? undefined,
    }) || null;
  const name =
    (row.personName && String(row.personName).trim()) ||
    null;
  return {
    id: row.findingId,
    personName: name,
    persona: role,
    propertyType: row.propertyType || null,
    location: row.location || null,
    budget: formatBudget(row, role),
    timeline: timelineLabel(row.timeline) || null,
    confidence: row.confidencePct,
    priority: urgencyPriority(row),
    nextAction: row.profile.recommendation.label || null,
  };
}

export function selectUrgentBuyers(
  rows: PipelineSalesRow[],
  opts?: { offset?: number; limit?: number },
): { total: number; items: UrgentBuyerSummary[] } {
  const urgent = rows
    .filter(r => isUrgentSalesProfile(r.profile))
    .map(r => ({ row: r, summary: toUrgentBuyerSummary(r) }))
    .sort((a, b) => b.summary.priority - a.summary.priority);
  const total = urgent.length;
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(PAGE_SIZE, Math.max(1, opts?.limit ?? PAGE_SIZE));
  return {
    total,
    items: urgent.slice(offset, offset + limit).map(x => x.summary),
  };
}

export function formatUrgentBuyersListText(input: {
  total: number;
  items: UrgentBuyerSummary[];
  page?: number;
}): string {
  if (input.total <= 0) {
    return ['🚨 URGENT BUYERS · 0', '', 'Không có khách cần xử lý gấp.'].join('\n');
  }
  const lines: string[] = [`🚨 URGENT BUYERS · ${input.total}`, ''];
  const start = ((input.page ?? 0) * PAGE_SIZE);
  input.items.forEach((item, i) => {
    const n = start + i + 1;
    const heat = classifyBuyerHeat(item.confidence);
    const who =
      item.personName ||
      (item.persona ? ROLE_LABEL[item.persona] : null) ||
      'Lead';
    lines.push(`${n}. ${heat.emoji} ${who}`);
    if (item.propertyType) lines.push(`   🏠 ${item.propertyType}`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    if (item.budget) lines.push(`   💰 ${item.budget}`);
    if (item.timeline) lines.push(`   ⏱ ${item.timeline}`);
    lines.push(`   🎯 Confidence ${item.confidence}%`);
    if (item.nextAction) lines.push(`   → ${item.nextAction}`);
    lines.push('');
  });
  while (lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function urgentBuyersListKeyboard(input: {
  items: UrgentBuyerSummary[];
  total: number;
  page?: number;
}): InlineKeyboard {
  const page = input.page ?? 0;
  const rows: InlineKeyboard['inline_keyboard'] = [];
  const openRow: InlineKeyboard['inline_keyboard'][number] = [];
  input.items.forEach((item, i) => {
    const n = page * PAGE_SIZE + i + 1;
    const id = truncFindingIdForCallback(item.id);
    openRow.push({ text: `Open #${n}`, callback_data: `s:o:${id}` });
    if (openRow.length === 3) {
      rows.push([...openRow]);
      openRow.length = 0;
    }
  });
  if (openRow.length) rows.push(openRow);

  const nav: InlineKeyboard['inline_keyboard'][number] = [];
  const shown = page * PAGE_SIZE + input.items.length;
  if (shown < input.total) {
    nav.push({ text: 'Next', callback_data: `s:u:p:${page + 1}` });
  }
  const urgentUrl = (() => {
    const raw =
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      process.env.AGENT_SYNC_VPS_URL ||
      '';
    const base = String(raw).trim().replace(/\/$/, '');
    if (!base || !/^https?:\/\//i.test(base)) return null;
    return `${base}/admin/agents/lead-center?urgent=true`;
  })();
  if (urgentUrl) {
    nav.push({ text: 'View all in Lead Center', url: urgentUrl });
  }
  if (nav.length) rows.push(nav);

  return { inline_keyboard: rows };
}

export function dailyBriefingSalesKeyboard(urgentCount: number): InlineKeyboard | undefined {
  const rows: InlineKeyboard['inline_keyboard'] = [];
  if (urgentCount > 0) {
    rows.push([
      {
        text: `🚨 Xem ${urgentCount} khách`,
        callback_data: 's:u:list',
      },
    ]);
  }
  const opsUrl = (() => {
    const raw =
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      process.env.AGENT_SYNC_VPS_URL ||
      '';
    const base = String(raw).trim().replace(/\/$/, '');
    if (!base || !/^https?:\/\//i.test(base)) return null;
    return `${base}/admin/agents/runtime`;
  })();
  if (opsUrl) {
    rows.push([{ text: '⚙️ Xem Operations', url: opsUrl }]);
  } else {
    rows.push([{ text: '⚙️ Xem Operations', callback_data: 'o:f:ops' }]);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export { PAGE_SIZE as URGENT_BUYERS_PAGE_SIZE };
