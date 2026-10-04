/**
 * Lead Scoring & Intent Classifier (Supply vs. Demand).
 *
 * Implements Stage 1 of Master Plan:
 * 1. Post Type: SUPPLY | DEMAND | UNKNOWN
 * 2. Lead Scoring:
 *    - Valid Vietnam Phone: +30 pts
 *    - Specific Budget Range: +25 pts
 *    - Clear Area/Project (Nam Hoa Xuan, Hoa Xuan, Cam Le...): +25 pts
 *    - High Urgency ("cần gấp", "mua trong tuần"...): +20 pts
 *    Total: 0 - 100
 */

import { extractPhoneData, type PhoneExtractionResult } from './phoneExtractor';
import { extractMoneyData, type MoneyExtractionResult } from './moneyExtractor';
import { extractLocation, type LocationExtractionResult } from './locationExtractor';

export type PostIntentType = 'SUPPLY' | 'DEMAND' | 'UNKNOWN';

export interface LeadScoreBreakdown {
  phoneScore: number;
  budgetScore: number;
  locationScore: number;
  urgencyScore: number;
  totalScore: number;
  reasons: string[];
}

export interface LeadScoringResult {
  postType: PostIntentType;
  intentScore: number;
  isHighPriorityLead: boolean; // >= 70
  breakdown: LeadScoreBreakdown;
  extracted: {
    primaryPhone: string | null;
    allPhones: string[];
    budgetMinVnd: number | null;
    budgetMaxVnd: number | null;
    budgetDisplay: string | null;
    primaryLocation: string | null;
    normalizedLocations: string[];
    isUrgent: boolean;
    urgencyKeywords: string[];
  };
}

// Demand keywords (Tìm mua / Tìm thuê)
const DEMAND_PATTERNS = [
  /cần\s*(?:tìm|mua|thuê|nhà|đất|lô)/i,
  /tìm\s*(?:mua|thuê|nhà|đất|lô|căn\s*hộ)/i,
  /muốn\s*(?:mua|thuê|đầu\s*tư)/i,
  /đang\s*tìm\s*(?:mua|thuê|nhà|đất|căn)/i,
  /ngân\s*sách\s*(?:tầm|khoảng|dưới|từ)/i,
  /tài\s*chính\s*(?:tầm|khoảng|dưới|từ|sẵn)/i,
  /inbox\s*(?:mình|em|giúp\s*mình|báo\s*giá)/i,
  /tư\s*vấn\s*giúp\s*(?:mình|em)/i,
  /cho\s*mình\s*xin\s*thông\s*tin/i,
  /ai\s*có\s*(?:hàng|nhà|đất|lô).{0,20}(?:inbox|báo)/i,
  /có\s*(?:nhà|đất|lô).{0,15}nào\s*(?:bán|cho\s*thuê|không)/i,
];

// Supply keywords (Tin rao bán / cho thuê)
const SUPPLY_PATTERNS = [
  /bán\s*gấp/i,
  /cần\s*bán/i,
  /chính\s*chủ\s*(?:gửi|bán|cần\s*bán)/i,
  /chuyển\s*nhượng/i,
  /ra\s*hàng/i,
  /hạ\s*giá/i,
  /sổ\s*(?:đỏ|hồng)\s*sẵn/i,
  /pháp\s*lý\s*chuẩn/i,
  /giá\s*(?:chỉ|cực\s*tốt|đầu\s*tư|sập\s*hầm)/i,
  /cho\s*thuê\s*(?:nhà|căn\s*hộ|mặt\s*bằng|nguyên\s*căn)/i,
  /còn\s*trống\s*(?:phòng|căn)/i,
  /diện\s*tích\s*[:\-]?\s*\d/i,
  /hướng\s*(?:đông|tây|nam|bắc)/i,
  /đường\s*\d+m/i,
  /lô\s*sạch\s*đẹp/i,
];

// Urgency keywords (+20 pts)
const URGENCY_PATTERNS = [
  /cần\s*gấp/i,
  /mua\s*trong\s*(?:tuần|tháng|ngày)/i,
  /công\s*chứng\s*ngay/i,
  /mua\s*ngay/i,
  /tiền\s*sẵn/i,
  /tài\s*chính\s*sẵn/i,
  /vào\s*ở\s*ngay/i,
  /gấp\s*trong\s*tuần/i,
  /thiện\s*chí\s*chốt\s*nhanh/i,
];

export function classifyPostType(text: string): { postType: PostIntentType; demandMatches: number; supplyMatches: number } {
  if (!text) return { postType: 'UNKNOWN', demandMatches: 0, supplyMatches: 0 };
  const lower = text.toLowerCase();

  let demandMatches = 0;
  for (const re of DEMAND_PATTERNS) {
    if (re.test(lower)) demandMatches++;
  }

  let supplyMatches = 0;
  for (const re of SUPPLY_PATTERNS) {
    if (re.test(lower)) supplyMatches++;
  }

  // Priority logic:
  // If strong demand signals exist, prioritize DEMAND to never miss potential leads
  if (demandMatches > 0 && demandMatches >= supplyMatches) {
    return { postType: 'DEMAND', demandMatches, supplyMatches };
  }
  if (supplyMatches > 0) {
    return { postType: 'SUPPLY', demandMatches, supplyMatches };
  }
  if (demandMatches > 0) {
    return { postType: 'DEMAND', demandMatches, supplyMatches };
  }
  return { postType: 'UNKNOWN', demandMatches, supplyMatches };
}

export function evaluateLeadScore(text: string): LeadScoringResult {
  const { postType } = classifyPostType(text);
  const phoneResult: PhoneExtractionResult = extractPhoneData(text);
  const moneyResult: MoneyExtractionResult = extractMoneyData(text);
  const locationResult: LocationExtractionResult = extractLocation(text);

  const breakdown: LeadScoreBreakdown = {
    phoneScore: 0,
    budgetScore: 0,
    locationScore: 0,
    urgencyScore: 0,
    totalScore: 0,
    reasons: [],
  };

  // 1. Phone number score (+30 pts)
  const hasValidPhone = phoneResult.primaryPhone != null;
  if (hasValidPhone) {
    breakdown.phoneScore = 30;
    breakdown.reasons.push(`Có SĐT liên hệ hợp lệ: ${phoneResult.primaryPhone} (+30đ)`);
  }

  // 2. Budget score (+25 pts)
  const primaryMoney = moneyResult.money[0];
  const hasBudget =
    (primaryMoney != null && (primaryMoney.minAmountVnd != null || primaryMoney.maxAmountVnd != null)) ||
    moneyResult.budgetMin != null ||
    moneyResult.budgetMax != null ||
    moneyResult.askingPrice != null ||
    moneyResult.rentPrice != null;

  if (hasBudget) {
    breakdown.budgetScore = 25;
    const display = primaryMoney?.display || (moneyResult.budgetMin ? `${(moneyResult.budgetMin / 1e9).toFixed(1)} tỷ` : 'đã xác định');
    breakdown.reasons.push(`Có khoảng giá/ngân sách cụ thể: ${display} (+25đ)`);
  }

  // 3. Location score (+25 pts)
  const hasLocation = locationResult.primaryLocation != null || locationResult.normalizedLocations.length > 0;
  if (hasLocation) {
    breakdown.locationScore = 25;
    const locName = locationResult.primaryLocation || locationResult.normalizedLocations[0];
    breakdown.reasons.push(`Có khu vực/dự án rõ ràng: ${locName} (+25đ)`);
  }

  // 4. Urgency score (+20 pts)
  const lower = text.toLowerCase();
  const matchedUrgency: string[] = [];
  for (const re of URGENCY_PATTERNS) {
    const match = lower.match(re);
    if (match) {
      matchedUrgency.push(match[0]);
    }
  }
  const isUrgent = matchedUrgency.length > 0;
  if (isUrgent) {
    breakdown.urgencyScore = 20;
    breakdown.reasons.push(`Tính cấp thiết cao: "${matchedUrgency.join(', ')}" (+20đ)`);
  }

  breakdown.totalScore = breakdown.phoneScore + breakdown.budgetScore + breakdown.locationScore + breakdown.urgencyScore;

  return {
    postType,
    intentScore: breakdown.totalScore,
    isHighPriorityLead: breakdown.totalScore >= 70,
    breakdown,
    extracted: {
      primaryPhone: phoneResult.primaryPhone,
      allPhones: phoneResult.phones.map(p => p.normalized),
      budgetMinVnd: moneyResult.budgetMin ?? primaryMoney?.minAmountVnd ?? null,
      budgetMaxVnd: moneyResult.budgetMax ?? primaryMoney?.maxAmountVnd ?? null,
      budgetDisplay: primaryMoney?.display ?? null,
      primaryLocation: locationResult.primaryLocation,
      normalizedLocations: locationResult.normalizedLocations,
      isUrgent,
      urgencyKeywords: matchedUrgency,
    },
  };
}
