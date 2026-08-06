/**
 * Smoke — H4 Marketing Organization (no Gemini).
 * Run: npx tsx scripts/smoke-marketing-org.ts
 */

import { produceContentPack } from '../server/modules/marketing-org/contentFactory';
import { buildWeeklyContentCalendar } from '../server/modules/marketing-org/contentCalendar';
import { planContentReuse } from '../server/modules/marketing-org/contentReuse';
import { classifyConversation } from '../server/modules/marketing-org/socialCare';
import { detectTrendsFromTexts } from '../server/modules/marketing-org/trendDetection';
import { buildSeoGaps } from '../server/modules/marketing-org/seoOrganization';
import { computeMarketingHealth } from '../server/modules/marketing-org/campaignHealth';
import { formatMarketingBriefing } from '../server/modules/marketing-org/marketingService';
import type { MarketingOrgSnapshot } from '../server/modules/marketing-org/types';
import { FUNNEL_STAGES } from '../server/modules/marketing-org/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const pack = produceContentPack({ topic: 'Mai Đăng Chơn', campaignHint: 'Mai Đăng Chơn' });
assert(pack.variants.length >= 9, 'factory variants');
assert(pack.variants.some(v => v.channel === 'facebook'), 'facebook');
assert(pack.variants.some(v => v.channel === 'tiktok'), 'tiktok');
assert(pack.variants.some(v => v.channel === 'seo'), 'seo');

const cal = buildWeeklyContentCalendar({ topic: 'Mai Đăng Chơn' });
assert(cal.length === 7, '7-day calendar');
assert(cal[0].theme === 'research', 'mon research');
assert(cal[6].theme === 'recap', 'sun recap');

const reuse = planContentReuse({ sourceTitle: 'Video tour Mai Đăng Chơn' });
assert(reuse.cuts.length >= 5, 'reuse cuts');

assert(classifyConversation('Cần mua lô gần FPT, inbox giúp').label === 'buyer', 'buyer care');
assert(classifyConversation('Hack crypto forex vay nhanh').label === 'spam', 'spam care');

const trends = detectTrendsFromTexts([
  { text: 'Mai Đăng Chơn hỏi giá' },
  { text: 'Mai Đăng Chơn xem sổ' },
  { text: 'FPT City pháp lý' },
]);
assert(trends.length > 0, 'trends');

const seo = buildSeoGaps({
  topic: 'Mai Đăng Chơn',
  trendingTopics: trends.map(t => t.topic),
});
assert(seo.length >= 4, 'seo gaps');

const health = computeMarketingHealth({
  contentProduced: 8,
  published: 6,
  reused: 14,
  comments: 37,
  needReply: 9,
  buyerConversations: 5,
  trendingTopics: 2,
  seoGaps: 4,
});
assert(health.healthScore > 50, 'health');

const snap: MarketingOrgSnapshot = {
  version: 'h4_v1',
  funnel: FUNNEL_STAGES,
  packs: [pack],
  calendar: cal,
  reusePlans: [reuse],
  conversationQueue: [],
  trends,
  seoGaps: seo,
  health,
  learning: {
    bestFormats: ['Reel'],
    bestHours: ['20:00'],
    bestCtas: ['Comment INFO'],
    bestCampaigns: ['Mai Đăng Chơn'],
    notes: [],
    updatedAt: new Date().toISOString(),
  },
  updatedAt: new Date().toISOString(),
};

const briefing = formatMarketingBriefing(snap);
assert(briefing.includes('Marketing Health'), 'briefing');
assert(briefing.includes('Need Reply'), 'need reply line');

console.log(briefing);
console.log('\nSmoke OK — marketing org', {
  variants: pack.variants.length,
  calendar: cal.length,
  reuse: reuse.cuts.length,
  trends: trends.length,
  seo: seo.length,
  health: health.healthScore,
});
