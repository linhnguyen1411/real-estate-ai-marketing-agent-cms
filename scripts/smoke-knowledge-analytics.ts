/**
 * Smoke: Knowledge Analytics + Rule Optimizer (measure only)
 */
import 'dotenv/config';
import {
  buildKnowledgeAnalytics,
  formatKnowledgeHealthBriefing,
  recordRuleDecisionEvent,
  recordRuleConversion,
  recordFalseNegative,
} from '../server/modules/knowledge-base';

async function main() {
  // Simulate measured traffic (no AI)
  await recordRuleDecisionEvent({
    matchedKeywords: [
      { keyword: 'cần mua', category: 'buyer', conceptName: 'Buyer Intent' },
      { keyword: 'mai đăng chơn', category: 'location', conceptName: 'Mai Đăng Chơn' },
    ],
    decision: 'qualified_candidate',
    intent: 'buyer',
    locationLabel: 'Mai Đăng Chơn',
    sourceId: 'src_group_b',
    sourceLabel: 'Group B',
    missionId: 'mis_mdc',
    missionLabel: 'Mai Đăng Chơn',
    missionKeyword: 'Mai Đăng Chơn',
  });
  await recordRuleDecisionEvent({
    matchedKeywords: [{ keyword: 'đầu tư', category: 'investor', conceptName: 'Investor Intent' }],
    decision: 'discard',
    intent: 'investor',
    sourceId: 'src_group_a',
    sourceLabel: 'Facebook Group A',
  });
  for (let i = 0; i < 5; i++) {
    await recordRuleDecisionEvent({
      matchedKeywords: [{ keyword: 'đầu tư', category: 'investor', conceptName: 'Investor Intent' }],
      decision: 'manual_review',
      intent: 'investor',
      sourceId: 'src_group_a',
      sourceLabel: 'Facebook Group A',
    });
  }
  await recordRuleConversion({
    keywords: ['cần mua', 'mai đăng chơn'],
    locationLabel: 'Mai Đăng Chơn',
    sourceId: 'src_group_b',
    missionId: 'mis_mdc',
  });
  await recordFalseNegative({ term: 'gom hàng', suggestedConcept: 'Buyer Intent' });

  const snap = await buildKnowledgeAnalytics();
  console.log(formatKnowledgeHealthBriefing(snap));
  console.log('--- top rules ---');
  for (const r of snap.topRules.slice(0, 5)) {
    console.log(
      `${r.keyword}\tmatched=${r.matched}\tqual=${r.qualified}\tconv=${r.converted}\tacc=${r.accuracy}%\troi=${r.roi}`,
    );
  }
  console.log('score', snap.score);
  console.log('recommendations', snap.recommendations.slice(0, 5).map(r => r.title));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
