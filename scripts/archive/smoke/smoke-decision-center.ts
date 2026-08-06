/**
 * Smoke: rule-first Lead Decision Engine
 */
import 'dotenv/config';
import {
  evaluateLeadDecision,
  formatDecisionReport,
  normalizeLeadText,
  listDecisionRules,
  getCampaignMap,
  getDecisionMetrics,
} from '../server/modules/decision-center';

async function main() {
  const sample = 'Cầnnnnnnnn muaaaaa nhà Mai Đăng Chơn, tài chính sẵn sàng, xin tư vấn';
  console.log('normalize:', normalizeLeadText(sample));

  const rules = await listDecisionRules();
  const campaignMap = await getCampaignMap();
  const result = evaluateLeadDecision({ text: sample, rules, campaignMap });
  console.log('decision:', result.decision, 'score=', result.ruleScore, 'intent=', result.intent);
  console.log('aiAllowed:', result.aiAllowed);
  console.log(
    'matched:',
    result.matchedRules.map(m => `${m.keyword}:${m.weight}`).join(', '),
  );
  console.log('campaign:', result.campaign?.campaignName || '—');

  const spam = evaluateLeadDecision({
    text: 'Tuyển dụng livestream game giveaway',
    rules,
    campaignMap,
  });
  console.log('spam →', spam.decision, spam.ruleScore, spam.intent);

  const seller = evaluateLeadDecision({
    text: 'Cần bán gấp chính chủ ra hàng ký gửi',
    rules,
    campaignMap,
  });
  console.log('seller →', seller.decision, seller.ruleScore, seller.intent);

  const metrics = await getDecisionMetrics();
  console.log('--- report ---');
  console.log(formatDecisionReport(metrics));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
