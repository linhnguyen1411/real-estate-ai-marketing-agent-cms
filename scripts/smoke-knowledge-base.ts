/**
 * Smoke: Knowledge Base → compiled Rules → Decision
 */
import 'dotenv/config';
import {
  buildKnowledgeSnapshot,
  formatKnowledgeReport,
  getCompiledDecisionRules,
  getCompiledCampaignMap,
  listConcepts,
} from '../server/modules/knowledge-base';
import { evaluateLeadDecision, normalizeLeadText } from '../server/modules/decision-center';

async function main() {
  const concepts = await listConcepts();
  console.log('concepts:', concepts.length);
  const rules = await getCompiledDecisionRules();
  console.log('compiled rules:', rules.length);
  const campaigns = await getCompiledCampaignMap();
  console.log('campaigns:', campaigns.map(c => c.campaignName).join(', '));

  const text = 'Khách muốn gom hàng MDC, ôm tiền sẵn, xin tư vấn';
  console.log('normalize:', normalizeLeadText(text));
  const result = evaluateLeadDecision({
    text,
    rules,
    campaignMap: campaigns,
  });
  console.log('decision:', result.decision, 'score=', result.ruleScore, 'intent=', result.intent);
  console.log(
    'matched:',
    result.matchedRules.map(m => m.keyword).slice(0, 8).join(', '),
  );

  const snap = await buildKnowledgeSnapshot();
  console.log('--- report ---');
  console.log(formatKnowledgeReport(snap.health));
  console.log('coverage:', snap.coverage);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
