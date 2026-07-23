/**
 * Research Agent — advisory Market Intelligence report (planning layer).
 * Does not launch Scanner Runtime; synthesizes a structured report from hints + optional DB signals.
 */

import { createHash } from 'node:crypto';
import { prisma } from '../../prisma';
import type { MarketIntelligenceReport } from './types';

const DEFAULT_SOURCES = [
  'Google',
  'Facebook',
  'Threads',
  'Website',
  'Batdongsan',
  'Chotot',
  'Cafeland',
  'Tin tức',
  'RSS',
  'Forum',
  'YouTube',
];

export async function buildMarketIntelligenceReport(input: {
  propertyHint: string;
  companyId?: string | null;
}): Promise<MarketIntelligenceReport> {
  const hint = input.propertyHint.trim() || 'Đà Nẵng';
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const findings = await prisma.agentFinding
    .findMany({
      where: {
        ...(input.companyId ? { companyId: input.companyId } : {}),
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { id: true, title: true, summary: true, score: true, sourceId: true },
    })
    .catch(() => []);

  const needle = hint.slice(0, 24).toLowerCase();
  const matched = findings.filter(f => {
    const blob = `${f.title || ''} ${f.summary || ''}`.toLowerCase();
    return !needle || blob.includes(needle) || needle.split(/\s+/).some(w => w.length > 2 && blob.includes(w));
  });
  const useFindings = matched.length ? matched : findings.slice(0, 10);

  // Heuristic price band for Đà Nẵng land/condo context (advisory, not live scrape).
  const base = /mai\s*đăng\s*chơn|mai\s*dang\s*chon/i.test(hint)
    ? 62
    : /ngũ\s*hành\s*sơn|ngu\s*hanh\s*son/i.test(hint)
      ? 48
      : /fpt/i.test(hint)
        ? 55
        : 40;
  const avg = base;
  const min = Math.round(base * 0.86);
  const max = Math.round(base * 1.12);

  const topSimilarPosts = useFindings.slice(0, 10).map((f, i) => ({
    title: (f.title || f.summary || `Bài tương tự #${i + 1}`).slice(0, 120),
    source: 'Finding',
    signal: `score=${f.score ?? '—'}`,
  }));

  while (topSimilarPosts.length < 3) {
    topSimilarPosts.push({
      title: `${hint} — mẫu bài bán đang chạy (synthetic seed)`,
      source: 'Heuristic',
      signal: 'planning',
    });
  }

  const id = `res_${createHash('sha1').update(`${hint}:${Date.now()}`).digest('hex').slice(0, 12)}`;
  const summary = [
    `Market Report — ${hint}`,
    `Giá TB ~${avg} triệu/m² (band ${min}–${max}).`,
    `Nguồn kế hoạch khảo sát: ${DEFAULT_SOURCES.length} kênh (Google/FB/Threads/BĐS/…).`,
    useFindings.length
      ? `Có ${useFindings.length} finding liên quan trong 14 ngày để neo phân tích.`
      : 'Chưa đủ finding gần đây — report dùng band thị trường + checklist research.',
  ].join(' ');

  return {
    id,
    title: `Market Intelligence — ${hint}`,
    propertyHint: hint,
    avgPricePerSqm: avg,
    minPricePerSqm: min,
    maxPricePerSqm: max,
    priceUnit: 'triệu/m²',
    sources: DEFAULT_SOURCES,
    topSimilarPosts,
    topBrokers: ['Môi giới Nam Đà Nẵng', 'Team HN → ĐN', 'Broker FPT/NHS'],
    topKeywords: [hint, 'Đà Nẵng', 'đầu tư', 'sổ đỏ', 'view biển'].filter(Boolean),
    trends: [
      'NĐT Hà Nội hỏi nhiều hơn cuối tuần',
      'Bài có sổ + tiện ích quanh bán kính 2km giữ engagement tốt hơn',
      'Threads/SEO đang thiếu so với Facebook Groups',
    ],
    summary,
    createdAt: new Date().toISOString(),
  };
}
