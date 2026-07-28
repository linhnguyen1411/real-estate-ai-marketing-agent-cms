import React from 'react';
import type { AgentFinding } from '../../../../types/agentPlatform';
import {
  resolveLeadIntelligence,
  formatVietnamPhoneDisplay,
  type ResolvedLeadIntelligence,
} from '@/shared/agent-domain';

/** Prefer API-resolved intelligence; fallback to client pure resolver for compatibility. */
export function intelligenceOf(finding: AgentFinding): ResolvedLeadIntelligence {
  const fromApi = (finding.intelligence || finding.resolved) as ResolvedLeadIntelligence | undefined;
  if (fromApi && typeof fromApi === 'object' && 'analysisStatus' in fromApi) {
    return fromApi;
  }
  return resolveLeadIntelligence(finding);
}

export type DetailTab = 'overview' | 'structured' | 'original' | 'insights';

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function displayValue(value: unknown): string {
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

export function formatMoney(value: string | number | null | undefined): string {
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

export function hasOriginalPostUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.includes('#gql-')) return false;
  // Numeric and pfbid Facebook post permalinks
  return /\/posts\/(?:pfbid[\w]+|\d+)/i.test(url) || /\/permalink\/\d+/i.test(url);
}

export function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-slate-800/80 py-2 text-xs last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

export function SectionBlock({
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

export function ActionBtn({
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
