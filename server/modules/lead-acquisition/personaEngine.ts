/**
 * Buyer Persona classifier — rule-based (no Gemini).
 */

import type { BuyerPersona, PersonaResult } from './types';

const PERSONA_RULES: Array<{ persona: BuyerPersona; label: string; re: RegExp; weight: number }> = [
  { persona: 'investor', label: 'đầu tư', re: /đầu\s*tư|cashflow|dòng\s*tiền|sinh\s*lời|roi|cho\s*thuê\s*lại/i, weight: 30 },
  { persona: 'developer', label: 'chủ đầu tư', re: /chủ\s*đầu\s*tư|phân\s*lô|dự\s*án|developer/i, weight: 28 },
  { persona: 'hotel', label: 'khách sạn', re: /khách\s*sạn|homestay|nghỉ\s*dưỡng|resort/i, weight: 26 },
  { persona: 'business', label: 'kinh doanh', re: /kinh\s*doanh|mặt\s*bằng|shop\s*house|shophouse|văn\s*phòng/i, weight: 24 },
  { persona: 'land', label: 'đất nền', re: /đất\s*nền|lô\s*đất|mua\s*đất|đất\s*thổ/i, weight: 22 },
  { persona: 'apartment', label: 'căn hộ', re: /căn\s*hộ|chung\s*cư|studio|condo/i, weight: 20 },
  { persona: 'rental', label: 'thuê', re: /thuê\s*nhà|thuê\s*căn|ở\s*thuê|rental/i, weight: 22 },
  { persona: 'first_home', label: 'nhà đầu', re: /nhà\s*đầu\s*tiên|lần\s*đầu\s*mua|mới\s*cưới|vợ\s*chồng\s*trẻ/i, weight: 24 },
  { persona: 'upgrader', label: 'đổi nhà', re: /đổi\s*nhà|nâng\s*cấp|bán\s*để\s*mua|upgrad/i, weight: 22 },
  { persona: 'home_buyer', label: 'mua ở', re: /mua\s*ở|ở\s*thật|gia\s*đình|an\s*cư/i, weight: 18 },
];

export function classifyBuyerPersona(text: string): PersonaResult {
  const hay = String(text || '');
  const scores = new Map<BuyerPersona, { score: number; labels: string[] }>();
  for (const r of PERSONA_RULES) {
    if (!r.re.test(hay)) continue;
    const cur = scores.get(r.persona) || { score: 0, labels: [] };
    cur.score += r.weight;
    cur.labels.push(r.label);
    scores.set(r.persona, cur);
  }

  let best: BuyerPersona = 'unknown';
  let bestScore = 0;
  let reasons: string[] = [];
  for (const [persona, v] of scores) {
    if (v.score > bestScore) {
      best = persona;
      bestScore = v.score;
      reasons = v.labels;
    }
  }

  if (best === 'unknown' && /mua|tìm\s*nhà|cần\s*nhà/i.test(hay)) {
    best = 'home_buyer';
    bestScore = 12;
    reasons = ['default_home_buyer'];
  }

  return {
    persona: best,
    confidence: Math.max(0.2, Math.min(0.95, bestScore / 50)),
    reasons,
  };
}
