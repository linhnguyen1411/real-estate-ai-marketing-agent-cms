import type { LeadBudgetRange, LeadInterestType } from '../types/investorLead';

export const LEAD_INTEREST_OPTIONS: { id: LeadInterestType; label: string }[] = [
  { id: 'dat-nen', label: 'Đất nền' },
  { id: 'can-ho', label: 'Căn hộ' },
  { id: 'nha-pho', label: 'Nhà phố' },
  { id: 'du-an', label: 'Danh mục BĐS' },
];

export const LEAD_BUDGET_OPTIONS: { id: LeadBudgetRange; label: string }[] = [
  { id: 'under-3', label: 'Dưới 3 tỷ' },
  { id: '3-5', label: '3–5 tỷ' },
  { id: '5-10', label: '5–10 tỷ' },
  { id: 'over-10', label: 'Trên 10 tỷ' },
];

const INTEREST_LABELS = Object.fromEntries(
  LEAD_INTEREST_OPTIONS.map((item) => [item.id, item.label])
) as Record<LeadInterestType, string>;

const BUDGET_LABELS = Object.fromEntries(
  LEAD_BUDGET_OPTIONS.map((item) => [item.id, item.label])
) as Record<LeadBudgetRange, string>;

const SOURCE_LABELS: Record<string, string> = {
  homepage_contact: 'Trang chủ',
  'contact-page': 'Trang liên hệ',
  'about-page': 'Giới thiệu',
  'author-page': 'Trang tác giả',
  multi_step: 'Form đa bước',
  contact_form_legacy: 'Form liên hệ (cũ)',
  website: 'Website',
  exit_intent: 'Popup thoát trang',
  lead_magnet: 'Lead magnet',
};

export function formatLeadInterest(value?: string | null): string {
  if (!value) return '—';
  return INTEREST_LABELS[value as LeadInterestType] || value;
}

export function formatLeadBudget(value?: string | null): string {
  if (!value) return '—';
  return BUDGET_LABELS[value as LeadBudgetRange] || value;
}

export function formatLeadSource(value?: string | null): string {
  if (!value) return '—';
  return SOURCE_LABELS[value] || value.replace(/-/g, ' ');
}
