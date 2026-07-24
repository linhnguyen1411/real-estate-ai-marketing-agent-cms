/**
 * Smoke: Continuous Feedback Loop (no AI)
 */
import 'dotenv/config';
import {
  applyOutcomeFeedback,
  buildFeedbackCenterSnapshot,
  formatWeeklyEvolution,
  listConcepts,
} from '../server/modules/knowledge-base';

async function main() {
  const before = (await listConcepts()).find(c => c.id === 'buyer_intent');
  console.log('buyer_intent trust before:', before?.trust, 'weight:', before?.weight);

  await applyOutcomeFeedback({
    outcome: 'won',
    keywords: ['cần mua', 'mai đăng chơn'],
    sourceId: 'src_group_b',
    sourceLabel: 'Group B',
    missionId: 'mis_mdc',
    missionLabel: 'Mai Đăng Chơn',
    campaignKey: 'Mai Đăng Chơn',
    contentId: 'content_tour_a',
    revenue: 1,
  });

  for (let i = 0; i < 6; i++) {
    await applyOutcomeFeedback({
      outcome: 'spam',
      keywords: ['đầu tư'],
      sourceId: 'src_group_a',
      sourceLabel: 'Facebook Group A',
    });
  }

  // Push trust high for weight bump
  for (let i = 0; i < 4; i++) {
    await applyOutcomeFeedback({
      outcome: 'won',
      keywords: ['cần mua'],
      sourceId: 'src_group_b',
      sourceLabel: 'Group B',
      campaignKey: 'Mai Đăng Chơn',
    });
  }

  const after = (await listConcepts()).find(c => c.id === 'buyer_intent');
  const inv = (await listConcepts()).find(c => c.id === 'investor_intent');
  console.log('buyer_intent trust after:', after?.trust, 'weight:', after?.weight);
  console.log('investor_intent trust after:', inv?.trust, 'enabled:', inv?.enabled);

  const snap = await buildFeedbackCenterSnapshot();
  console.log('--- weekly ---');
  console.log(formatWeeklyEvolution(snap));
  console.log('top source', snap.weekly.topSource, 'worst', snap.weekly.worstSource);
  console.log(
    'autoTune',
    snap.autoTune.slice(0, 5).map(a => `${a.kind}:${a.concept}`),
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
