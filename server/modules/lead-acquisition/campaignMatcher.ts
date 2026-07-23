/**
 * Campaign Matching — attach lead to living AiSalesCampaign by area/property hint.
 * Read-only over planning campaigns; does not mutate Campaign Runtime lifecycle.
 */

import { prisma } from '../../prisma';
import type { CampaignMatchResult } from './types';

function tokenize(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

export async function matchLeadToCampaign(input: {
  companyId?: string | null;
  text: string;
  area?: string | null;
}): Promise<CampaignMatchResult> {
  const hay = `${input.text || ''} ${input.area || ''}`.toLowerCase();
  const tokens = new Set(tokenize(hay));

  const campaigns = await prisma.aiSalesCampaign
    .findMany({
      where: {
        ...(input.companyId ? { companyId: input.companyId } : {}),
        status: { notIn: ['completed', 'rejected'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { id: true, name: true, propertyHint: true, status: true },
    })
    .catch(() => []);

  if (!campaigns.length) {
    return {
      campaignId: null,
      campaignName: null,
      propertyHint: null,
      matchScore: 0,
      reasons: ['no_active_campaign'],
    };
  }

  let best = campaigns[0];
  let bestScore = 0;
  let bestReasons: string[] = [];

  for (const c of campaigns) {
    const hintTokens = tokenize(`${c.name} ${c.propertyHint}`);
    let score = 0;
    const reasons: string[] = [];
    for (const t of hintTokens) {
      if (tokens.has(t) || hay.includes(t)) {
        score += t.length >= 4 ? 18 : 10;
        reasons.push(`token:${t}`);
      }
    }
    // Direct phrase match
    const hint = (c.propertyHint || c.name || '').toLowerCase();
    if (hint && hay.includes(hint.slice(0, Math.min(hint.length, 24)))) {
      score += 35;
      reasons.push('phrase_match');
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
      bestReasons = reasons.slice(0, 5);
    }
  }

  if (bestScore < 18) {
    return {
      campaignId: null,
      campaignName: null,
      propertyHint: null,
      matchScore: bestScore,
      reasons: ['weak_campaign_match', ...bestReasons],
    };
  }

  return {
    campaignId: best.id,
    campaignName: best.name,
    propertyHint: best.propertyHint,
    matchScore: Math.min(100, bestScore),
    reasons: bestReasons,
  };
}
