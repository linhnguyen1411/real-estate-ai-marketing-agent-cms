/**
 * H2 — AI Sales Employee planning layer regression (no Runtime mutation).
 * Run: npx tsx scripts/test-ai-sales-employee.ts
 */
import assert from 'node:assert/strict';
import { classifyByRules } from '../server/modules/control-plane';
import { callbackDataToCommand } from '../server/modules/control-plane/inlineKeyboard';
import {
  detectSalesMode,
  planCampaignBoard,
  proposeMissions,
  planContentSchedule,
  buildCampaignRecommendations,
  campaignCard,
  researchCard,
} from '../server/modules/planning';
import { buildMarketIntelligenceReport } from '../server/modules/planning/researchAgent';

function ok(name: string, cond: unknown) {
  assert.ok(cond, name);
  console.log(`✓ ${name}`);
}

{
  const mode = detectSalesMode('Hôm nay cần bán mạnh lô Mai Đăng Chơn.');
  ok('detect campaign mode', mode === 'campaign_board');
  ok('detect leads mode', detectSalesMode('Lead nổi bật nhất hôm nay') === 'lead_cards');
  ok('detect timeline', detectSalesMode('Hôm nay AI đã làm gì?') === 'timeline');
}

{
  const board = planCampaignBoard({ utterance: 'Hôm nay cần bán mạnh lô Mai Đăng Chơn.' });
  ok('campaign name', /mai đăng chơn|mai dang chon/i.test(board.name) || board.propertyHint.length > 3);
  ok('checklist has research', board.planChecklist.some(c => c.key === 'research' && c.done));
  ok('audience non-empty', board.audience.length >= 1);
  ok('tasks include research giá', board.tasks.some(t => /research/i.test(t)));
  const card = campaignCard(board);
  ok('campaign card lines', card.lines.some(l => /Campaign Card/.test(l)));
  ok('campaign keyboard', card.replyMarkup.inline_keyboard.length >= 1);
}

{
  const missions = proposeMissions({ propertyHint: 'Mai Đăng Chơn' });
  ok('missions >= 5', missions.length >= 5);
  ok('has investor HN', missions.some(m => /Hà Nội|Ha Noi|Investor/i.test(m.name)));
}

{
  const content = planContentSchedule({ campaignName: 'Mai Đăng Chơn', propertyHint: 'Mai Đăng Chơn' });
  ok('content has FB 08:00', content.schedule.some(s => s.time === '08:00' && /facebook/i.test(s.channel)));
  ok('content has threads', content.schedule.some(s => /threads/i.test(s.channel)));
}

{
  const research = await buildMarketIntelligenceReport({ propertyHint: 'Mai Đăng Chơn' });
  ok('research avg price', typeof research.avgPricePerSqm === 'number');
  ok('research sources >= 8', research.sources.length >= 8);
  const rc = researchCard(research);
  ok('research card', rc.lines.some(l => /Research Card/.test(l)));
  const recs = buildCampaignRecommendations({
    board: planCampaignBoard({ utterance: 'bán mạnh Mai Đăng Chơn priority high' }),
    research,
    content: planContentSchedule({ campaignName: 'Mai Đăng Chơn' }),
  });
  ok('recommendations non-empty', recs.length >= 1);
}

{
  ok('classify campaign', classifyByRules('Hôm nay cần bán mạnh lô Mai Đăng Chơn.').name === 'ai_sales_campaign');
  ok('classify leads', classifyByRules('Lead nổi bật nhất hôm nay').name === 'ai_sales_leads');
  ok('classify timeline', classifyByRules('Hôm nay AI đã làm gì?').name === 'ai_sales_timeline');
  ok('callback ai research', callbackDataToCommand('ai:research')?.toLowerCase().includes('research'));
  ok('callback ai leads', callbackDataToCommand('ai:leads')?.toLowerCase().includes('lead'));
}

console.log('\nAI Sales Employee planning: PASS');
