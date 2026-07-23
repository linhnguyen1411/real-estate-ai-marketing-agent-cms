/**
 * Campaign Planner — turns NL sales intent into a Campaign Board (+ plan checklist).
 * Does not enqueue publish/scan jobs.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CampaignBoard, CampaignBudgetMode, CampaignPriority } from './types';

function extractPropertyHint(text: string): string {
  const m =
    text.match(
      /(?:lô|lo|dự án|du an|căn|can|đất|dat|mai\s*đăng\s*chơn|mai\s*dang\s*chon|fpt|ngũ\s*hành\s*sơn|ngu\s*hanh\s*son|nam\s*đà\s*nẵng|nam\s*da\s*nang)[^,.!]{0,60}/i,
    ) || text.match(/bán\s+mạnh\s+(.+)$/i) || text.match(/ban\s+manh\s+(.+)$/i);
  if (m) return (m[0] || '').replace(/^(bán mạnh|ban manh)\s+/i, '').trim();
  return 'BĐS Đà Nẵng';
}

function detectPriority(text: string): CampaignPriority {
  if (/urgent|gấp|gap|ngay|hôm nay|hom nay|priority\s*high|ưu tiên cao/.test(text)) return 'high';
  if (/low|thấp|cham/.test(text)) return 'low';
  return 'medium';
}

function detectBudget(text: string): CampaignBudgetMode {
  if (/ads|paid|chi tiêu|budget\s*paid/.test(text)) return 'paid';
  if (/hybrid|kết hợp|ket hop/.test(text)) return 'hybrid';
  return 'organic';
}

function detectAudiences(text: string): string[] {
  const audiences: string[] = [];
  if (/hà nội|ha noi|hn\b/.test(text)) audiences.push('Nhà đầu tư Hà Nội');
  if (/đà nẵng|da nang|dn\b/.test(text)) audiences.push('Người mua ở Đà Nẵng');
  if (/nghỉ dưỡng|nghi duong|resort/.test(text)) audiences.push('Đầu tư nghỉ dưỡng');
  if (/đổi nhà|doi nha/.test(text)) audiences.push('Đổi nhà');
  if (!audiences.length) {
    audiences.push('Nhà đầu tư Hà Nội', 'Người mua ở Đà Nẵng');
  }
  return audiences;
}

export function planCampaignBoard(input: {
  utterance: string;
  companyId?: string | null;
}): CampaignBoard {
  const propertyHint = extractPropertyHint(input.utterance);
  const name = propertyHint.replace(/^(lô|lo)\s+/i, '').trim() || 'Campaign BĐS';
  const priority = detectPriority(input.utterance);
  const budget = detectBudget(input.utterance);
  const audience = detectAudiences(input.utterance);
  const id = `camp_${createHash('sha1').update(`${name}:${Date.now()}`).digest('hex').slice(0, 12)}`;

  return {
    id,
    name,
    goal: /tháng|thang|month/.test(input.utterance) ? 'Bán trong tháng' : 'Tăng lead & chốt giao dịch',
    audience,
    budget,
    priority,
    propertyHint,
    planChecklist: [
      { key: 'research', label: 'Research', done: true },
      { key: 'competitor', label: 'Competitor', done: true },
      { key: 'market_price', label: 'Market Price', done: true },
      { key: 'buyer_mission', label: 'Buyer Mission', done: true },
      { key: 'facebook', label: 'Facebook Campaign', done: true },
      { key: 'threads', label: 'Threads', done: true },
      { key: 'seo', label: 'SEO', done: true },
    ],
    tasks: [
      'Research giá',
      'So sánh dự án cạnh tranh',
      'Tìm buyer',
      'Viết content',
      'Lập lịch',
      'Theo dõi',
      'Tối ưu',
    ],
    health: priority === 'high' ? 92 : 80,
    createdAt: new Date().toISOString(),
    metadata: {
      utterance: input.utterance.slice(0, 500),
      companyId: input.companyId ?? null,
      planner: 'campaign_planner_v1',
      nonce: randomUUID(),
    },
  };
}
