/**
 * Trend Detection — from findings / titles (no external API required).
 */

import { createHash } from 'crypto';
import type { TrendItem } from './types';

const STOP = new Set([
  'lead',
  'unknown',
  'tại',
  'với',
  'và',
  'của',
  'cho',
  'các',
  'những',
  'the',
  'and',
  'for',
]);

export function detectTrendsFromTexts(
  texts: Array<{ text: string; source?: TrendItem['source'] }>,
  limit = 8,
): TrendItem[] {
  const counts = new Map<string, { n: number; source: TrendItem['source'] }>();
  for (const row of texts) {
    const words = String(row.text || '')
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP.has(w));
    // Prefer 2-grams for place/project names
    for (let i = 0; i < words.length; i++) {
      const uni = words[i];
      const bi = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
      for (const key of [bi, uni].filter(Boolean) as string[]) {
        if (key.split(' ').every(p => STOP.has(p))) continue;
        const cur = counts.get(key) || { n: 0, source: row.source || 'findings' };
        cur.n += bi && key === bi ? 2 : 1;
        counts.set(key, cur);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit)
    .map(([topic, v]) => ({
      id: `trend_${createHash('sha1').update(topic).digest('hex').slice(0, 8)}`,
      topic,
      source: v.source,
      score: Math.min(100, v.n * 8),
      suggestion: `Nên sản xuất content về “${topic}” tuần này`,
    }));
}
