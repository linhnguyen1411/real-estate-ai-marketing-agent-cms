/**
 * Smoke: AI Gateway providers + briefing + decision order.
 */
import 'dotenv/config';
import {
  decideProviderOrder,
  formatAiStatusBriefing,
  getGatewayHealth,
  listGatewayProviders,
  ruleKeywordFallback,
} from '../server/modules/ai-gateway';

async function main() {
  const providers = listGatewayProviders();
  console.log(
    'providers:',
    providers.map(p => `${p.id}(p${p.priority},vision=${p.supportsVision()},cost=${p.cost().inputPer1k})`).join(' · '),
  );

  const health = await getGatewayHealth();
  console.log('--- briefing ---');
  console.log(formatAiStatusBriefing(health));
  console.log('--- health rows ---');
  for (const h of health) {
    console.log(
      `${h.id}\t${h.status}\tonline=${h.online}\tquota=${h.quotaPercent}\tlat=${h.latencyMs}\tcalls=${h.callsToday}\tsuccess=${Math.round(h.successRate * 100)}%`,
    );
  }

  const decision = decideProviderOrder({ providers, health });
  console.log('decision order:', decision.order.join(' → '), '|', decision.reason);

  const rule = ruleKeywordFallback('Khách muốn mua nhà Đà Nẵng ngân sách 3 tỷ');
  console.log('rule fallback sample:', rule.text.split('\n')[0], '·', rule.model);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
