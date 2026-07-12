import {
  evaluateRealEstateRelevance,
  type RealEstateRelevanceResult,
} from './domainClassification';
import { textHasKeyword } from './offTopicFilter';

export interface LeadPrefilterInput {
  title: string;
  bodyText: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
  prefilterMinScore?: number;
  minBodyLength?: number;
}

export interface LeadPrefilterResult {
  passed: boolean;
  score: number;
  reasons: string[];
  isHardSpam: boolean;
  /** Domain / RE relevance (set when evaluated) */
  relevance?: RealEstateRelevanceResult;
  outOfDomain?: boolean;
  domainNeedsReview?: boolean;
}

const DEFAULT_MIN_BODY = 80;
const DEFAULT_PREFILTER_MIN_SCORE = 20;

export function runLeadPrefilter(input: LeadPrefilterInput): LeadPrefilterResult {
  const reasons: string[] = [];
  let score = 0;

  const title = input.title.trim().toLowerCase();
  const body = input.bodyText.trim().toLowerCase();
  const combined = `${title}\n${body}`;
  const minBody = input.minBodyLength ?? DEFAULT_MIN_BODY;
  const threshold = input.prefilterMinScore ?? DEFAULT_PREFILTER_MIN_SCORE;

  if (body.length < minBody) {
    reasons.push(`Nội dung quá ngắn (${body.length} ký tự)`);
    return { passed: false, score: 0, reasons, isHardSpam: false };
  }

  const relevance = evaluateRealEstateRelevance(combined);
  if (relevance.decision === 'reject') {
    reasons.push(
      `Ngoài lĩnh vực BĐS: ${relevance.domain.classification} (${relevance.reasonCode})`,
    );
    return {
      passed: false,
      score: 0,
      reasons,
      isHardSpam: true,
      relevance,
      outOfDomain: true,
    };
  }
  if (relevance.decision === 'needs_review') {
    reasons.push(`Domain chưa rõ: ${relevance.reasonCode}`);
    return {
      passed: false,
      score: 0,
      reasons,
      isHardSpam: false,
      relevance,
      domainNeedsReview: true,
    };
  }

  if (hasSpamRepetition(body)) {
    reasons.push('Phát hiện lặp ký tự/từ spam');
    return { passed: false, score: 0, reasons, isHardSpam: true };
  }

  const matchedPositive: string[] = [];
  for (const keyword of input.positiveKeywords) {
    const kw = keyword.toLowerCase();
    if (!kw) continue;
    if (textHasKeyword(title, kw)) {
      score += 12;
      matchedPositive.push(kw);
      reasons.push(`+12 từ khóa "${kw}" trong tiêu đề`);
    } else if (textHasKeyword(body, kw)) {
      score += 8;
      matchedPositive.push(kw);
      reasons.push(`+8 từ khóa "${kw}" trong nội dung`);
    }
  }

  if (matchedPositive.length === 0) {
    reasons.push('Không khớp positive keyword');
    score -= 5;
  }

  let negativeHits = 0;
  for (const keyword of input.negativeKeywords) {
    const kw = keyword.toLowerCase();
    if (!kw) continue;
    if (textHasKeyword(combined, kw)) {
      negativeHits += 1;
      score -= 15;
      reasons.push(`-15 từ khóa loại trừ "${kw}"`);
    }
  }

  if (negativeHits >= 2) {
    reasons.push('Nhiều từ khóa loại trừ — hard spam');
    return { passed: false, score: Math.max(0, score), reasons, isHardSpam: true };
  }

  if (looksLikeBrokerSpam(combined)) {
    score -= 20;
    reasons.push('-20 pattern môi giới/spam');
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= threshold;

  if (!passed) {
    reasons.push(`Điểm prefilter ${score} < ngưỡng ${threshold}`);
  } else {
    reasons.push(`Prefilter đạt ngưỡng (${score}/${threshold})`);
  }

  return { passed, score, reasons, isHardSpam: false };
}

function hasSpamRepetition(text: string): boolean {
  if (/(.)\1{8,}/.test(text)) return true;

  const tokens = text.split(/\s+/).filter(token => token.length > 2);
  if (tokens.length < 12) return false;

  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  return maxCount / tokens.length > 0.35;
}

function looksLikeBrokerSpam(text: string): boolean {
  const patterns = [
    /zalo\s*:?\s*0\d{8,10}/,
    /inbox\s*ngay/,
    /ib\s*ngay/,
    /liên hệ\s*0\d{8,10}/,
    /cam kết lợi nhuận/,
  ];
  return patterns.filter(pattern => pattern.test(text)).length >= 2;
}

export function shouldRunLeadAnalysis(input: {
  prefilter: LeadPrefilterResult;
  deepAnalyze: boolean;
}): boolean {
  if (input.prefilter.isHardSpam) return false;
  if (input.deepAnalyze) return true;
  return input.prefilter.passed;
}
