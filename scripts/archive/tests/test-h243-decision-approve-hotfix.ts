/**
 * H2.4.3 — Decision audit fixtures + re-approve idempotency + regression.
 * Marker: h2.4.3-decision-hotfix
 *
 * Run: npx tsx scripts/test-h243-decision-approve-hotfix.ts
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import {
  approveCampaign,
  createAndRunCampaign,
  getCampaign,
  rejectCampaign,
} from '../server/modules/planning/campaignRuntime';
import {
  DEFAULT_DECISION_RULES,
  applyActorPriorToDecision,
  decideOutcome,
  evaluateLeadDecision,
  mergeDefaultRules,
  processFindingDecision,
  readDecisionProfile,
} from '../server/modules/decision-center';

const MARKER = 'h2.4.3-decision-hotfix';

/** Real H2.4.2 contents (not synthetic toy sentences). */
const FIXTURES: Array<{
  id: string;
  content: string;
  expectHuman: 'broker' | 'seller' | 'irrelevant' | 'buyer' | 'spam' | 'unknown';
  expectDecision: 'discard' | 'manual_review' | 'qualified_candidate' | 'ai_review';
  expectIntent?: string;
}> = [
  {
    id: 'broker_cert',
    content:
      'THU HỒ SƠ THI CHỨNG CHỈ HÀNH NGHỀ MÔI GIỚI BẤT ĐỘNG SẢN ĐỢT 2 TẠI ĐÀ NẴNG -T8/2026 LIÊN HỆ: 0384968080 (THẢO)',
    expectHuman: 'broker',
    expectDecision: 'discard',
    expectIntent: 'broker',
  },
  {
    id: 'seller_listing',
    content: 'Nhà kiệt đường Cù Chính Lan - Chỉ hơn 3 tỷ tl',
    expectHuman: 'seller',
    expectDecision: 'discard',
    expectIntent: 'seller',
  },
  {
    id: 'seller_promo',
    content:
      '📍 Peninsula Private Da Nang - Căn hộ hiếm ngay trung tâm Hải Châu - trung tâm của trung tâm Đà Nẵng - "SẮP RA MẮT"',
    expectHuman: 'seller',
    expectDecision: 'discard',
    expectIntent: 'seller',
  },
  {
    id: 'seller_minh_co',
    content: 'Mình có lo 10 tỷ TL có nhà cấp bốn đường Trần Hưng Đạo điện ngọc đã nang',
    expectHuman: 'seller',
    expectDecision: 'discard',
    expectIntent: 'seller',
  },
  {
    id: 'irrelevant_rooms',
    content: '2 phòng ngủ · 1 phòng tắm · Căn hộ/Chung cư cao cấp',
    expectHuman: 'irrelevant',
    expectDecision: 'manual_review',
    expectIntent: 'unknown',
  },
  {
    id: 'buyer_real',
    content: 'Cần mua đất Mai Đăng Chơn, tài chính 3 tỷ, xin tư vấn',
    expectHuman: 'buyer',
    expectDecision: 'qualified_candidate',
    expectIntent: 'buyer',
  },
  {
    id: 'spam',
    content: 'Tuyển dụng livestream game giveaway',
    expectHuman: 'spam',
    expectDecision: 'discard',
    expectIntent: 'spam',
  },
  {
    id: 'buyer_variant',
    content: 'Đang cần tìm nhà khu FPT, tầm tài chính 2.5 tỷ, ai có lô ib',
    expectHuman: 'buyer',
    expectDecision: 'qualified_candidate',
    expectIntent: 'buyer',
  },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function cleanupCampaigns() {
  const rows = await prisma.aiSalesCampaign.findMany({
    where: {
      OR: [
        { utterance: { contains: MARKER } },
        { name: { contains: MARKER } },
        { goal: { contains: MARKER } },
      ],
    },
    select: { id: true, state: true },
    take: 20,
  });
  const jobIds: string[] = [];
  for (const r of rows) {
    const state = r.state as { acquisitionRequests?: Array<{ jobIds?: string[] }> } | null;
    for (const req of state?.acquisitionRequests || []) {
      for (const jid of req.jobIds || []) jobIds.push(jid);
    }
  }
  if (jobIds.length) {
    await prisma.agentJob.updateMany({
      where: { id: { in: [...new Set(jobIds)] }, status: { in: ['queued', 'claimed', 'running'] } },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: `Cancelled by ${MARKER} cleanup`,
      },
    });
  }
  for (const r of rows) {
    await prisma.aiSalesCampaign.delete({ where: { id: r.id } }).catch(async () => {
      await rejectCampaign({ campaignId: r.id, actor: `${MARKER}-cleanup`, reason: 'cleanup' }).catch(
        () => null,
      );
    });
  }
  return rows.length;
}

async function main() {
  console.log('== H2.4.3 Decision + Re-approve Hotfix ==');

  // Unit: merge defaults additive
  const merged = mergeDefaultRules(
    [{ id: 'buyer_can_mua', group: 'Buyer', keyword: 'cần mua', weight: 99, category: 'buyer', enabled: true, priority: 1 }],
    DEFAULT_DECISION_RULES,
  );
  assert(merged.rules.find(r => r.id === 'buyer_can_mua')?.weight === 99, 'merge keeps admin edit');
  assert(merged.rules.some(r => r.id === 'broker_moi_gioi'), 'merge adds broker_moi_gioi');
  console.log('PASS mergeDefaultRules');

  // Unit: decideOutcome ordering
  const sellerOut = decideOutcome({ ruleScore: 0, intent: 'seller' });
  assert(sellerOut.reason === 'seller_discard', `seller reason=${sellerOut.reason}`);
  const unknownOut = decideOutcome({ ruleScore: 0, intent: 'unknown' });
  assert(unknownOut.decision === 'manual_review', 'unknown → manual');
  assert(unknownOut.reason.includes('unknown_insufficient_evidence'), unknownOut.reason);
  const spamOut = decideOutcome({ ruleScore: 0, intent: 'spam' });
  assert(spamOut.reason === 'spam_intent', spamOut.reason);
  console.log('PASS decideOutcome');

  // Actor prior
  const baseUnknown = evaluateLeadDecision({
    text: 'xyz abc không keyword',
    rules: DEFAULT_DECISION_RULES,
    campaignMap: [],
  });
  const prior = applyActorPriorToDecision(baseUnknown, 'broker', 'broker');
  assert(prior.intent === 'broker', `prior intent=${prior.intent}`);
  assert(prior.decision === 'discard', `prior decision=${prior.decision}`);
  console.log('PASS actorPrior');

  // Fixture matrix (rule-first, no AI)
  const counts = {
    buyer: 0,
    seller: 0,
    broker: 0,
    unknown: 0,
    spam: 0,
    irrelevant: 0,
    qualified: 0,
    ai_review: 0,
    manual: 0,
    discard: 0,
  };
  for (const fx of FIXTURES) {
    const result = evaluateLeadDecision({
      text: fx.content,
      rules: DEFAULT_DECISION_RULES,
      campaignMap: [{ keyword: 'mai đăng chơn', campaignName: 'Mai Đăng Chơn' }],
    });
    counts[fx.expectHuman] = (counts[fx.expectHuman] || 0) + 1;
    if (result.decision === 'qualified_candidate') counts.qualified += 1;
    if (result.decision === 'ai_review') counts.ai_review += 1;
    if (result.decision === 'manual_review') counts.manual += 1;
    if (result.decision === 'discard') counts.discard += 1;

    assert(
      result.decision === fx.expectDecision,
      `${fx.id}: decision ${result.decision} != ${fx.expectDecision} (intent=${result.intent} score=${result.ruleScore} reason=${result.reason})`,
    );
    if (fx.expectIntent) {
      assert(
        result.intent === fx.expectIntent,
        `${fx.id}: intent ${result.intent} != ${fx.expectIntent}`,
      );
    }
    assert(Boolean(result.reason), `${fx.id}: missing reason`);
    assert(result.version === 'h36_decision_v1', `${fx.id}: version`);
    console.log(
      'FIXTURE',
      fx.id,
      '→',
      result.decision,
      result.intent,
      result.ruleScore,
      result.reason,
      result.matchedRules.map(m => m.keyword).slice(0, 4).join('|'),
    );
  }
  console.log('PASS fixtures', JSON.stringify(counts));

  // Reprocess live H2.4.2 findings if still present
  const liveIds = [
    'cms2vvina0o84d047ved48a8c',
    'cms2vtsk50o5fd047iova9evw',
    'cms2vtsbw0o52d0477kzatw3u',
    'cms2vtrhy0o3gd047rx2z2par',
    'cms2vtrcs0o38d0476uxbtn0d',
    'cms2vt5b40o0hd0470gyhek89',
    'cms2vt54s0o04d047mj8cnp33',
    'cms2vq9rn0nvad047ljsd6zal',
  ];
  const live = await prisma.agentFinding.findMany({ where: { id: { in: liveIds } }, select: { id: true } });
  console.log('LIVE_FINDINGS', live.length);
  for (const row of live) {
    const { result } = await processFindingDecision(row.id, { force: true });
    const profile = readDecisionProfile(
      (await prisma.agentFinding.findUnique({ where: { id: row.id } }))?.extractedData,
    );
    assert(Boolean(profile?.decision), `live ${row.id} missing decisionCenter`);
    assert(Boolean(profile?.reason), `live ${row.id} missing reason`);
    console.log('LIVE', row.id.slice(0, 10), result.decision, result.intent, result.reason);
  }

  // Re-approve idempotency
  await cleanupCampaigns();
  const created = await createAndRunCampaign({
    utterance: `Hôm nay cần bán mạnh lô Mai Đăng Chơn [${MARKER}]`,
    companyId: null,
    owner: MARKER,
    forceNew: true,
  });
  assert(created.status === 'waiting_approval', `status=${created.status}`);
  const approved = await approveCampaign({ campaignId: created.id, actor: MARKER });
  assert(['optimizing', 'monitoring', 'publishing'].includes(approved.status), approved.status);
  const after = await getCampaign(approved.id);
  const reqs1 = ((after?.state as any)?.acquisitionRequests || []) as any[];
  assert(reqs1.length === 1, `acq count=${reqs1.length}`);
  const jobIds1 = [...(reqs1[0].jobIds || [])].sort();

  // Re-approve must NOT 500
  const re = await approveCampaign({ campaignId: created.id, actor: `${MARKER}-re` });
  assert(['optimizing', 'monitoring', 'publishing', 'completed'].includes(re.status), re.status);
  const after2 = await getCampaign(created.id);
  const reqs2 = ((after2?.state as any)?.acquisitionRequests || []) as any[];
  assert(reqs2.length === 1, `re-approve created extra request: ${reqs2.length}`);
  const jobIds2 = [...(reqs2[0].jobIds || [])].sort();
  assert(JSON.stringify(jobIds1) === JSON.stringify(jobIds2), 'job ids changed on re-approve');
  console.log('PASS re-approve idempotent', reqs2[0].id, 'jobs', jobIds2.length);

  // Second re-approve
  await approveCampaign({ campaignId: created.id, actor: `${MARKER}-re2` });
  const after3 = await getCampaign(created.id);
  const reqs3 = ((after3?.state as any)?.acquisitionRequests || []) as any[];
  assert(reqs3.length === 1, 'third approve created request');

  // Cancel queued jobs from this test (do not wait for live scan)
  if (jobIds1.length) {
    await prisma.agentJob.updateMany({
      where: { id: { in: jobIds1 }, status: { in: ['queued', 'claimed', 'running'] } },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: `Cancelled by ${MARKER} cleanup`,
      },
    });
  }
  await cleanupCampaigns();
  console.log('CLEANUP ok');
  console.log('VERDICT: H2.4.3 HOTFIX PASS');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
