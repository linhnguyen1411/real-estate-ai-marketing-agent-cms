/**
 * Buyer Signal Graph — cluster signals; evaluate the Buyer, not each signal alone.
 */

import type { BuyerSignal, BuyerSignalKind } from './types';

export function inferSignalKind(input: {
  text?: string;
  sourceType?: string | null;
  findingType?: string | null;
}): BuyerSignalKind {
  const t = `${input.text || ''} ${input.sourceType || ''} ${input.findingType || ''}`.toLowerCase();
  if (/messenger|inbox|\bib\b|zalo/.test(t)) return 'messenger';
  if (/comment|bình\s*luận/.test(t)) return 'comment';
  if (/mention|tag\s*tôi|nhắc\s*tên/.test(t)) return 'mention';
  if (/reaction|like|tim|thả\s*tim/.test(t)) return 'reaction';
  if (/website|landing|form|đăng\s*ký/.test(t)) return /form|đăng\s*ký/.test(t) ? 'form' : 'website';
  if (/search|tìm\s*kiếm|google/.test(t)) return 'search';
  if (/crm|pipeline/.test(t)) return 'crm';
  if (/call|gọi/.test(t)) return 'call';
  if (/inbox|nhắn/.test(t)) return 'inbox';
  if (/facebook|group|post|bài\s*viết/.test(t)) return 'post';
  return 'other';
}

export function buildSignal(input: {
  findingId: string;
  kind?: BuyerSignalKind;
  text?: string;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  findingType?: string | null;
  at?: string;
}): BuyerSignal {
  const kind =
    input.kind ||
    inferSignalKind({
      text: input.text,
      sourceType: input.sourceType,
      findingType: input.findingType,
    });
  const weight =
    kind === 'call' || kind === 'inbox' || kind === 'messenger'
      ? 30
      : kind === 'form' || kind === 'crm'
        ? 28
        : kind === 'comment' || kind === 'mention'
          ? 18
          : kind === 'reaction'
            ? 8
            : 12;

  return {
    id: `${input.findingId}:${kind}:${(input.at || new Date().toISOString()).slice(0, 13)}`,
    kind,
    at: input.at || new Date().toISOString(),
    findingId: input.findingId,
    sourceId: input.sourceId || null,
    sourceName: input.sourceName || null,
    summary: (input.text || '').slice(0, 160) || null,
    weight,
  };
}

export function mergeSignals(existing: BuyerSignal[], incoming: BuyerSignal[]): BuyerSignal[] {
  const map = new Map<string, BuyerSignal>();
  for (const s of [...existing, ...incoming]) {
    const key = `${s.findingId || ''}:${s.kind}:${s.at.slice(0, 16)}`;
    const prev = map.get(key);
    if (!prev || s.weight >= prev.weight) map.set(key, s);
  }
  return [...map.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-40);
}

export function scoreBuyerFromSignals(signals: BuyerSignal[]): {
  engagementScore: number;
  kinds: BuyerSignalKind[];
  lastActivityAt: string | null;
} {
  const kinds = [...new Set(signals.map(s => s.kind))];
  const engagementScore = Math.min(
    100,
    signals.reduce((n, s) => n + s.weight, 0) / Math.max(1, signals.length / 2),
  );
  const last = signals.length
    ? signals.reduce((a, b) => (a.at > b.at ? a : b)).at
    : null;
  return { engagementScore, kinds, lastActivityAt: last };
}
