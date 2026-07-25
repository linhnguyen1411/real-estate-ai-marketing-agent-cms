/**
 * Lead Intelligence V2 — ranked Lead Cards (probability-oriented presentation).
 * Read-only over findings; does not mutate Scanner/Runtime.
 */

import { prisma } from '../../prisma';
import type { CampaignPriority, LeadCardV2 } from './types';

function priorityFromScore(score: number): CampaignPriority {
  if (score >= 90) return 'urgent';
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function pickName(raw: Record<string, unknown>, fallback: string): string {
  for (const k of ['contactName', 'name', 'fullName', 'displayName']) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
  }
  return fallback;
}

export async function rankLeadCards(input?: {
  companyId?: string | null;
  limit?: number;
  areaHint?: string;
}): Promise<LeadCardV2[]> {
  const limit = Math.min(20, Math.max(1, input?.limit ?? 10));
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);

  const findings = await prisma.agentFinding
    .findMany({
      where: {
        ...(input?.companyId ? { companyId: input.companyId } : {}),
        createdAt: { gte: since },
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      select: {
        id: true,
        title: true,
        summary: true,
        score: true,
        extractedData: true,
        primaryLocation: true,
        budgetMin: true,
        budgetMax: true,
        intent: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  const cards: LeadCardV2[] = [];
  for (const f of findings) {
    const structured =
      f.extractedData && typeof f.extractedData === 'object' && !Array.isArray(f.extractedData)
        ? (f.extractedData as Record<string, unknown>)
        : {};
    const score = typeof f.score === 'number' ? f.score : Number(f.score) || 50;
    const confidence = Math.max(1, Math.min(99, Math.round(score)));
    const area =
      f.primaryLocation ||
      (typeof structured.area === 'string' && structured.area) ||
      (typeof structured.location === 'string' && structured.location) ||
      input?.areaHint ||
      'Đà Nẵng';
    let budget = 'Chưa rõ';
    if (f.budgetMin || f.budgetMax) {
      const min = f.budgetMin ? Number(f.budgetMin) / 1e9 : null;
      const max = f.budgetMax ? Number(f.budgetMax) / 1e9 : null;
      if (min && max) budget = `${min}-${max} tỷ`;
      else if (max) budget = `~${max} tỷ`;
      else if (min) budget = `từ ${min} tỷ`;
    } else if (typeof structured.budget === 'string') {
      budget = structured.budget;
    }
    const name = pickName(structured, (f.title || 'Lead ẩn danh').slice(0, 60));
    const reasons: string[] = [];
    if (confidence >= 85) reasons.push('Score cao trong 36h');
    if (f.summary && /inbox|comment|hỏi|quan tâm/i.test(f.summary)) reasons.push('Có tín hiệu tương tác');
    if (reasons.length < 2) reasons.push('Nổi trong feed findings gần đây');

    cards.push({
      rank: 0,
      confidence,
      name,
      budget,
      need: (f.summary || f.title || 'Nhu cầu BĐS').slice(0, 140),
      area: String(area).slice(0, 80),
      timeline: confidence >= 90 ? '<7 ngày' : confidence >= 70 ? '7–30 ngày' : '>30 ngày',
      intent: f.intent || (typeof structured.intent === 'string' ? structured.intent : 'buyer'),
      mission: typeof structured.mission === 'string' ? structured.mission : 'Lead hot hôm nay',
      reason: reasons.slice(0, 3),
      recommendation: confidence >= 90 ? 'Gọi ngay.' : confidence >= 70 ? 'Inbox trong hôm nay.' : 'Nuôi lead.',
      suggestedReply:
        confidence >= 85
          ? `Chào ${name.split(' ')[0] || 'anh/chị'}, em có thông tin phù hợp khu ${area}. Anh/chị còn đang tìm trong tuần này không ạ?`
          : `Chào anh/chị, em gửi thêm thông tin khu ${area} — anh/chị muốn xem sổ/pháp lý trước không ạ?`,
      priority: priorityFromScore(confidence),
      findingId: f.id,
    });
  }

  cards.sort((a, b) => b.confidence - a.confidence);
  return cards.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 }));
}
