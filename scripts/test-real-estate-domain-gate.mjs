#!/usr/bin/env node
/**
 * Real-estate domain gate tests.
 *   npm run test:real-estate-domain-gate
 */
import {
  classifyDomain,
  detectTransactionObject,
  domainMatchesMission,
  evaluateRealEstateRelevance,
} from '../server/agent/domainClassification';
import { resolveRebuildAction } from '../server/agent/subjectDirection';
import { runLeadPrefilter } from '../server/agent/leadPrefilter';
import { getDefaultPositiveKeywords, getDefaultNegativeKeywords } from '../server/agent/defaultKeywordSets';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function caseTitle(n, text) {
  console.log(`\n[${n}] ${text.slice(0, 70)}${text.length > 70 ? '…' : ''}`);
}

const MOTORCYCLE =
  'Em cần mua chiếc xe máy hay xe ga cũ gì cũng được càng tốt ạ, anh chị muốn bán inbox em nha, SĐT Zalo em 0774212699.';

console.log('=== test:real-estate-domain-gate ===');

// --- Required real case ---
caseTitle('real', MOTORCYCLE);
{
  const rel = evaluateRealEstateRelevance(MOTORCYCLE);
  const obj = detectTransactionObject(MOTORCYCLE);
  assert(rel.domain.classification === 'vehicle', 'domain = vehicle');
  assert(obj.category === 'vehicle', 'transactionObject.category = vehicle');
  assert(
    obj.normalizedType === 'motorcycle' ||
      obj.normalizedType === 'scooter' ||
      obj.normalizedType === 'motorcycle_or_scooter',
    `normalizedType motorcycle/scooter (got ${obj.normalizedType})`,
  );
  assert(rel.isRealEstateRelevant === false, 'isRealEstateRelevant = false');
  assert(rel.decision === 'reject', 'decision = reject');
  assert(
    rel.reasonCode === 'non_real_estate_vehicle_request',
    `reasonCode vehicle (got ${rel.reasonCode})`,
  );
  assert(!domainMatchesMission(rel.domain.classification, 'real_estate'), 'mission RE blocks vehicle');
}

const cases = [
  {
    n: 1,
    text: 'Cần mua xe máy cũ, Zalo 0774212699',
    domain: 'vehicle',
    decision: 'reject',
  },
  {
    n: 2,
    text: 'Cần mua nhà kiệt xe máy tại Hải Châu',
    domain: 'real_estate',
    decision: 'accept',
  },
  {
    n: 3,
    text: 'Cần mua nhà đường ô tô vào',
    domain: 'real_estate',
    decision: 'accept',
  },
  {
    n: 4,
    text: 'Cần mua ô tô cũ',
    domain: 'vehicle',
    decision: 'reject',
  },
  {
    n: 5,
    text: 'Cần thuê mặt bằng để mở cửa hàng xe máy',
    domain: 'real_estate',
    decision: 'accept',
    purpose: 'motorcycle_shop',
  },
  {
    n: 6,
    text: 'Bán nhà có gara ô tô',
    domain: 'real_estate',
    decision: 'accept',
  },
  {
    n: 7,
    text: 'Cần mua điện thoại cũ',
    domain: 'consumer_goods',
    decision: 'reject',
  },
  {
    n: 8,
    text: 'Cần mua đất để mở cửa hàng điện thoại',
    domain: 'real_estate',
    decision: 'accept',
    purpose: 'phone_store',
  },
  {
    n: 9,
    text: 'Kiệt xe máy, diện tích 75m2, bán nhà giá 2 tỷ',
    domain: 'real_estate',
    decision: 'accept',
  },
  {
    n: 10,
    text: 'Xe máy giá 20 triệu, cần bán gấp',
    domain: 'vehicle',
    decision: 'reject',
  },
];

for (const c of cases) {
  caseTitle(c.n, c.text);
  const rel = evaluateRealEstateRelevance(c.text);
  const obj = detectTransactionObject(c.text);
  assert(
    rel.domain.classification === c.domain,
    `domain=${c.domain} (got ${rel.domain.classification})`,
  );
  assert(rel.decision === c.decision, `decision=${c.decision} (got ${rel.decision})`);
  if (c.purpose) {
    assert(
      obj.businessPurpose === c.purpose,
      `businessPurpose=${c.purpose} (got ${obj.businessPurpose})`,
    );
  }
  if (c.decision === 'accept') {
    assert(rel.isRealEstateRelevant === true, 'isRealEstateRelevant true');
  } else {
    assert(rel.isRealEstateRelevant === false, 'isRealEstateRelevant false');
  }
}

// Integration-ish: prefilter + rebuild action
caseTitle('prefilter', 'motorcycle prefilter hard-block');
{
  const pre = runLeadPrefilter({
    title: '',
    bodyText: MOTORCYCLE,
    positiveKeywords: getDefaultPositiveKeywords(),
    negativeKeywords: getDefaultNegativeKeywords(),
  });
  assert(pre.passed === false, 'prefilter failed');
  assert(pre.outOfDomain === true || pre.isHardSpam === true, 'outOfDomain/hardSpam');
  assert(pre.score === 0, 'prefilter score 0');
}

caseTitle('rebuild', 'dismiss_out_of_domain action');
{
  const rel = evaluateRealEstateRelevance(MOTORCYCLE);
  const action = resolveRebuildAction({
    classification: 'buyer',
    actorRole: 'demand_side',
    representedDemand: 'buyer',
    brokerActivity: 'unknown',
    finalScore: 80,
    minFindingScore: 40,
    dedupeStatus: 'unique',
    domainDecision: rel.decision,
    domainReasonCode: rel.reasonCode,
  });
  assert(action.action === 'dismiss_out_of_domain', 'rebuild dismiss_out_of_domain');
}

caseTitle('rebuild-keep', 'RE with kiệt xe máy stays update');
{
  const text = 'Cần mua nhà kiệt xe máy tại Hải Châu';
  const rel = evaluateRealEstateRelevance(text);
  const action = resolveRebuildAction({
    classification: 'buyer',
    actorRole: 'demand_side',
    representedDemand: 'buyer',
    brokerActivity: 'unknown',
    finalScore: 80,
    minFindingScore: 40,
    dedupeStatus: 'unique',
    domainDecision: rel.decision,
    domainReasonCode: rel.reasonCode,
  });
  assert(rel.decision === 'accept', 'RE accept');
  assert(action.action === 'update', `rebuild update (got ${action.action})`);
}

caseTitle('phone', 'phone does not save out-of-domain');
{
  const rel = evaluateRealEstateRelevance(MOTORCYCLE);
  assert(rel.decision === 'reject', 'still reject with phone');
  assert(rel.relevanceScore === 0, 'relevanceScore 0');
}

caseTitle('unknown', 'domain unknown does not auto-accept');
{
  const rel = evaluateRealEstateRelevance('Ai biết chỗ nào vui không mọi người');
  assert(rel.decision === 'needs_review' || rel.decision === 'reject', 'no auto-accept');
  assert(rel.domain.classification !== 'real_estate' || rel.decision !== 'accept', 'not forced RE');
}

caseTitle('classify', 'classifyDomain API');
{
  const d = classifyDomain('Cần mua laptop cũ giá rẻ');
  assert(d.classification === 'consumer_goods', 'laptop → consumer_goods');
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
