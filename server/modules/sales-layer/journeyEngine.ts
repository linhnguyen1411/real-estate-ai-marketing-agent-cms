/**
 * Buyer Journey stage detection — rule patterns (no Gemini).
 */

import {
  JOURNEY_RANK,
  type BuyerJourneyStage,
} from './types';

type JourneyRule = {
  stage: BuyerJourneyStage;
  label: string;
  re: RegExp;
  weight: number;
};

const JOURNEY_RULES: JourneyRule[] = [
  { stage: 'negotiating', label: 'hẹn gặp', weight: 40, re: /hẹn\s*gặp|đàm\s*phán|thương\s*lượng|chốt\s*giá|cọc/i },
  { stage: 'appointment', label: 'xin xem sổ', weight: 36, re: /xem\s*sổ|xin\s*sổ|đi\s*xem|hẹn\s*xem|appointment/i },
  { stage: 'contacted', label: 'inbox', weight: 30, re: /\binbox\b|\bib\b|nhắn\s*tin|messenger|zalo|gọi\s*điện|đã\s*liên\s*hệ/i },
  { stage: 'interested', label: 'comment nhiều', weight: 24, re: /comment\s*(nhiều|lại)|quan\s*tâm|muốn\s*biết\s*thêm|xin\s*báo\s*giá|báo\s*giá/i },
  { stage: 'comparing', label: 'so sánh', weight: 20, re: /so\s*sánh|khu\s*nào|phương\s*án\s*nào|nên\s*chọn/i },
  { stage: 'researching', label: 'hỏi giá', weight: 18, re: /hỏi\s*giá|giá\s*bao\s*nhiêu|xin\s*giá|pháp\s*lý|tìm\s*hiểu/i },
  { stage: 'closed_won', label: 'đã mua', weight: 50, re: /đã\s*mua|đã\s*chốt|closed\s*won|ký\s*hđ/i },
  { stage: 'closed_lost', label: 'không mua', weight: 45, re: /không\s*mua|bỏ\s*ý\s*định|closed\s*lost|spam/i },
];

export function detectJourneyStage(input: {
  text: string;
  previous?: BuyerJourneyStage | null;
  signalKinds?: string[];
}): { stage: BuyerJourneyStage; reasons: string[]; confidence: number } {
  const hay = String(input.text || '');
  const hits = JOURNEY_RULES.filter(r => r.re.test(hay));
  const kinds = new Set((input.signalKinds || []).map(k => k.toLowerCase()));

  let stage: BuyerJourneyStage = input.previous || 'detected';
  let reasons: string[] = [];
  let score = 0;

  if (kinds.has('inbox') || kinds.has('messenger') || kinds.has('call')) {
    stage = advance(stage, 'contacted');
    reasons.push('signal:contact');
    score = Math.max(score, 30);
  }
  if (kinds.has('comment') || kinds.has('reaction')) {
    stage = advance(stage, 'interested');
    reasons.push('signal:engagement');
    score = Math.max(score, 22);
  }
  if (kinds.has('website') || kinds.has('form') || kinds.has('search')) {
    stage = advance(stage, 'researching');
    reasons.push('signal:research');
    score = Math.max(score, 16);
  }

  for (const h of hits.sort((a, b) => b.weight - a.weight)) {
    stage = advance(stage, h.stage);
    reasons.push(`pattern:${h.label}`);
    score = Math.max(score, h.weight);
  }

  if (!reasons.length) {
    stage = input.previous || 'detected';
    reasons = ['default:detected'];
  }

  return {
    stage,
    reasons: reasons.slice(0, 6),
    confidence: Math.max(0.25, Math.min(0.95, score / 50)),
  };
}

function advance(current: BuyerJourneyStage, next: BuyerJourneyStage): BuyerJourneyStage {
  if (next === 'closed_lost' || next === 'closed_won') return next;
  if (current === 'closed_won' || current === 'closed_lost') return current;
  return JOURNEY_RANK[next] >= JOURNEY_RANK[current] ? next : current;
}

/** Map journey → sales pipeline column */
export function journeyToPipeline(stage: BuyerJourneyStage): import('./types').SalesPipelineStage {
  switch (stage) {
    case 'detected':
      return 'detected';
    case 'researching':
    case 'comparing':
      return 'qualified';
    case 'interested':
      return 'assigned';
    case 'contacted':
      return 'contacted';
    case 'appointment':
      return 'appointment';
    case 'negotiating':
      return 'negotiating';
    case 'closed_won':
      return 'won';
    case 'closed_lost':
      return 'lost';
    default:
      return 'detected';
  }
}

/** Migrate H3 pipeline stage → H3.5 */
export function migrateH3PipelineStage(
  stage: string | null | undefined,
): import('./types').SalesPipelineStage {
  switch (stage) {
    case 'candidate':
      return 'detected';
    case 'qualified':
      return 'qualified';
    case 'assigned':
      return 'assigned';
    case 'contacted':
      return 'contacted';
    case 'interested':
      return 'appointment';
    case 'negotiating':
      return 'negotiating';
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    default:
      return 'detected';
  }
}
