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
  'nhu',
  'cầu',
  'tìm',
  'mua',
  'bán',
  'thuê',
  'cần',
  'khách',
  'hàng',
  'liên',
  'hệ',
  'ngân',
  'sách',
  'giá',
  'tỷ',
  'triệu',
  'được',
  'trong',
  'đang',
  'đã',
  'sẽ',
  'nhà',
  'đất',
  'bất',
  'động',
  'sản',
  'bđs',
  'tin',
  'bài',
  'đăng',
  'xem',
  'qua',
  'này',
  'kia',
  'đó',
  'lại',
  'còn',
  'có',
  'không',
  'về',
  'ở',
  'từ',
  'ra',
  'vào',
  'lên',
  'xuống',
  'quan',
  'tâm',
  'inbox',
  'alo',
  'sđt',
  'zalo',
  'chính',
  'chủ',
  'tiềm',
  'năng',
  'diện',
  'tích',
  'khu',
  'vực',
  'đầu',
  'tư',
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
      .filter(w => w.length >= 2 && !STOP.has(w));
    // Prefer 2-grams for place/project names
    for (let i = 0; i < words.length; i++) {
      const uni = words[i];
      const bi = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
      for (const key of [bi, uni].filter(Boolean) as string[]) {
        if (key.split(' ').some(p => STOP.has(p) || p.length < 2)) continue;
        if (!key.includes(' ') && key.length < 4) continue;
        const cur = counts.get(key) || { n: 0, source: row.source || 'findings' };
        cur.n += bi && key === bi ? 3 : 1;
        counts.set(key, cur);
      }
    }
  }

  const formatTopic = (t: string) =>
    t
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  return [...counts.entries()]
    .filter(([_, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit)
    .map(([rawTopic, v]) => {
      const topic = formatTopic(rawTopic);
      return {
        id: `trend_${createHash('sha1').update(topic).digest('hex').slice(0, 8)}`,
        topic,
        source: v.source,
        score: Math.min(100, v.n * 8),
        suggestion: `Nên sản xuất content về “${topic}” tuần này`,
      };
    });
}
