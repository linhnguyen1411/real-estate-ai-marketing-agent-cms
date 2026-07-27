/**
 * H2.4 — Campaign → Buyer Acquisition Bridge E2E (ADR-007).
 * Marker: h2.4-acq-bridge — cleanup after.
 *
 * Run: npx tsx scripts/test-campaign-acquisition-bridge-h24.ts
 */

import 'dotenv/config';
import { prisma } from '../server/prisma';
import {
  createAndRunCampaign,
  approveCampaign,
  rejectCampaign,
  getCampaign,
} from '../server/modules/planning/campaignRuntime';
import { getCampaignWorkspace } from '../server/modules/planning/campaignWorkspace';
import {
  buildAcquisitionIdempotencyKey,
  ensureAcquisitionRequest,
  startAcquisitionAfterCampaignApproval,
  getCampaignAcquisitionSnapshot,
} from '../server/modules/campaign-acquisition';
import { resolveChannelForEvent } from '../server/notifications/notificationTypes';
import { listGatewayProviders } from '../server/modules/ai-gateway/gateway';

const MARKER = 'h2.4-acq-bridge';
const UTTERANCE = `Hôm nay cần bán mạnh lô Mai Đăng Chơn [${MARKER}]`;

type Cap = 'WORKS' | 'PARTIAL' | 'BROKEN' | 'NOT_WIRED' | 'BLOCKED';
const caps: Record<string, Cap> = {};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function cleanup() {
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
      where: {
        id: { in: [...new Set(jobIds)] },
        status: { in: ['queued', 'claimed', 'running'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        errorMessage: 'Cancelled by h2.4-acq-bridge cleanup',
      },
    });
  }
  for (const r of rows) {
    await prisma.aiSalesCampaign.delete({ where: { id: r.id } }).catch(async () => {
      await rejectCampaign({ campaignId: r.id, actor: 'h2.4-cleanup', reason: 'cleanup' }).catch(
        () => null,
      );
    });
  }
  return rows.length;
}

async function main() {
  console.log('== H2.4 Acquisition Bridge E2E ==');
  await cleanup();

  assert(resolveChannelForEvent('planner') === 'OPS', 'planner OPS');
  assert(resolveChannelForEvent('lead_found') === 'LEAD', 'lead LEAD');
  caps['Telegram routing'] = 'WORKS';

  const providers = listGatewayProviders().map(p => p.id);
  assert(providers.includes('gemini') && providers.length >= 2, 'ai fallback chain');
  caps['AI Fallback'] = 'WORKS';

  const key1 = buildAcquisitionIdempotencyKey({
    campaignId: 'c1',
    missionProposalId: 'm1',
    goal: 'Sell MDC',
    targetProperty: 'Mai Đăng Chơn',
  });
  const key2 = buildAcquisitionIdempotencyKey({
    campaignId: 'c1',
    missionProposalId: 'm1',
    goal: 'Sell MDC',
    targetProperty: 'Mai Đăng Chơn',
  });
  assert(key1 === key2, 'idempotency stable');

  console.log('== create campaign ==');
  const created = await createAndRunCampaign({
    utterance: UTTERANCE,
    companyId: null,
    owner: 'h2.4-e2e',
    forceNew: true,
  });
  assert(created.status === 'waiting_approval', `status=${created.status}`);
  caps['Campaign'] = 'WORKS';
  caps['Mission'] = (created.state.missions?.length || 0) > 0 ? 'WORKS' : 'PARTIAL';

  console.log('== approve → acquisition ==');
  const approved = await approveCampaign({ campaignId: created.id, actor: 'h2.4-e2e' });
  const after = await getCampaign(approved.id);
  assert(Boolean(after), 'campaign after approve');

  const snap = await getCampaignAcquisitionSnapshot(created.id);
  console.log('ACQUISITION', JSON.stringify(snap, null, 2));
  assert(snap.status !== 'NOT_STARTED', `acq status=${snap.status}`);
  caps['Acquisition Request'] = snap.request ? 'WORKS' : 'BROKEN';

  if (snap.status === 'BLOCKED') {
    caps['Scanner Bridge'] = 'BLOCKED';
    caps['Findings'] = 'BLOCKED';
  } else {
    caps['Scanner Bridge'] =
      (snap.request?.jobIds?.length || 0) > 0 || (snap.request?.sourceIds?.length || 0) > 0
        ? 'WORKS'
        : 'PARTIAL';
    caps['Findings'] = snap.postsScanned > 0 || snap.candidates > 0 ? 'WORKS' : 'PARTIAL';
  }

  // Idempotent second approve / ensure
  const again = await startAcquisitionAfterCampaignApproval({
    campaignId: created.id,
    actor: 'h2.4-e2e',
  });
  const ensure = await ensureAcquisitionRequest({ campaignId: created.id, actor: 'h2.4-e2e' });
  assert(ensure.reused || ensure.request.idempotencyKey === again.idempotencyKey, 'reuse request');
  caps['Idempotency'] = 'WORKS';

  const ws = await getCampaignWorkspace(created.id);
  assert(Boolean(ws?.acquisition), 'workspace acquisition');
  console.log(
    'WORKSPACE ACQ',
    ws?.acquisition.status,
    ws?.acquisition.sources,
    ws?.acquisition.candidates,
    ws?.acquisition.qualified,
  );
  caps['Campaign Workspace'] = ws?.acquisition ? 'WORKS' : 'BROKEN';

  // Decision / Lead / Sales — bridge reuses modules when findings exist
  caps['Decision'] = snap.candidates > 0 ? 'PARTIAL' : 'PARTIAL';
  caps['Lead'] = snap.qualified > 0 ? 'WORKS' : 'PARTIAL';
  caps['Sales'] = snap.qualified > 0 ? 'PARTIAL' : 'PARTIAL';
  caps['Buyer Alert'] = snap.hot > 0 ? 'PARTIAL' : 'PARTIAL';
  caps['Trace'] = (after?.state.operationalMemory || []).some(e =>
    /acquisition/i.test(e.title || ''),
  )
    ? 'WORKS'
    : 'PARTIAL';

  // Failure: reject path should not create new acquisition for rejected terminal
  // (approve already ran — just document)

  console.log('== capability ==');
  for (const [k, v] of Object.entries(caps)) console.log(`| ${k} | ${v} |`);

  console.log('== cleanup ==');
  const n = await cleanup();
  const left = await prisma.aiSalesCampaign.count({ where: { utterance: { contains: MARKER } } });
  assert(left === 0, 'cleanup');
  console.log('cleaned', n);

  const blocked = Object.values(caps).filter(v => v === 'BLOCKED' || v === 'BROKEN').length;
  const partial = Object.values(caps).filter(v => v === 'PARTIAL').length;
  const verdict =
    blocked > 0 || caps['Scanner Bridge'] === 'BLOCKED'
      ? 'PARTIAL'
      : caps['Scanner Bridge'] === 'WORKS' && snap.postsScanned > 0
        ? 'GO'
        : 'PARTIAL';
  console.log(`VERDICT ${verdict} (partial_caps=${partial})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => null);
    await prisma.$disconnect();
  });
