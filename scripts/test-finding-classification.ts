#!/usr/bin/env node
/**
 * Lead Intelligence classification + score gating + dedupe normalize tests.
 */
import assert from 'assert';
import { buildDeterministicFallback } from '../server/agent/leadAnalyzer';
import { runLeadPrefilter } from '../server/agent/leadPrefilter';
import {
  computeIntelligenceFinalScore,
  computeLeadFitScore,
  DEFAULT_TARGET_CLASSIFICATIONS,
  actorRoleFromClassification,
} from '../server/agent/leadIntelligence';
import { normalizeLeadContent, hashNormalizedContent } from '../server/agent/dedup/contentNormalizer';
import {
  computeNearDuplicateFingerprint,
  hammingSimilarity,
} from '../server/agent/dedup/contentFingerprint';
import { validateFindingsBulkAction } from '../server/agent/agentValidation';
import { detectSubjectDirection, resolveRebuildAction } from '../server/agent/subjectDirection';

function prefilter(title: string, body: string) {
  return runLeadPrefilter({
    title,
    bodyText: body,
    positiveKeywords: ['cần mua', 'nhà', 'đà nẵng', 'bán', 'thuê'],
    negativeKeywords: [],
    prefilterMinScore: 10,
    minBodyLength: 10,
  });
}

function classify(text: string) {
  const pf = prefilter(text.slice(0, 40), text);
  return buildDeterministicFallback(
    { title: text.slice(0, 60), bodyText: text, canonicalUrl: 'https://example.com/p/1' },
    pf,
  );
}

function scoreFor(
  classification: string,
  actorRole: ReturnType<typeof actorRoleFromClassification>,
  kw: number,
  ai: number,
) {
  const fit = computeLeadFitScore({
    classification: classification as (typeof DEFAULT_TARGET_CLASSIFICATIONS)[number],
    actorRole,
    targetClassifications: DEFAULT_TARGET_CLASSIFICATIONS,
    hasPhone: false,
    hasBudget: true,
    hasLocation: true,
    hasPropertyType: true,
  });
  const finalScore = computeIntelligenceFinalScore({
    leadFitScore: fit,
    aiScore: ai,
    keywordScore: kw,
    targetMatched: DEFAULT_TARGET_CLASSIFICATIONS.includes(
      classification as (typeof DEFAULT_TARGET_CLASSIFICATIONS)[number],
    ),
  });
  return { fit, finalScore };
}

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

{
  const a = classify('Cần mua nhà 3-4 tỷ tại Đà Nẵng gần trung tâm');
  ok('1 classification buyer', a.classification === 'buyer');
  ok(
    '1 demand actor',
    a.actorRole === 'demand_side' ||
      actorRoleFromClassification(a.classification) === 'demand_side',
  );
  const s = scoreFor(a.classification, 'demand_side', 40, a.score);
  ok('1 creates lead (final>0)', s.finalScore > 0 && s.fit > 0);
}

{
  const a = classify('Bán nhà 3-4 tỷ tại Đà Nẵng chính chủ');
  ok('2 classification seller', a.classification === 'seller');
  const s = scoreFor(a.classification, 'supply_side', 100, 90);
  ok('2 seller leadFit 0', s.fit === 0);
  ok('2 seller no buyer finding score', s.finalScore === 0);
}

{
  const a = classify('Cho thuê studio full nội thất mới tại Sơn Trà');
  ok('3 landlord', a.classification === 'landlord');
}

{
  const a = classify('Cần thuê studio full nội thất gần biển Đà Nẵng');
  ok('4 renter', a.classification === 'renter');
}

{
  const a = classify('Em có căn FPT giá tốt ib ngay ạ');
  ok('5 broker supply', a.classification === 'broker');
  const d = detectSubjectDirection('Em có căn FPT giá tốt ib ngay ạ');
  ok('5 brokerActivity supply_listing', d.brokerActivity === 'supply_listing');
}

{
  const d = detectSubjectDirection('Khách cần tìm toà căn hộ 7-10 tầng diện tích lớn');
  ok('A broker demand_request', d.classification === 'broker' && d.brokerActivity === 'demand_request');
  ok('A representedDemand buyer', d.representedDemand === 'buyer');
  const action = resolveRebuildAction({
    classification: d.classification,
    actorRole: d.actorRole,
    representedDemand: d.representedDemand,
    brokerActivity: d.brokerActivity,
    finalScore: 50,
    minFindingScore: 40,
    dedupeStatus: 'unique',
  });
  ok('A needs_review', action.action === 'needs_review');
}

{
  const d = detectSubjectDirection('Tài chính 4ty trở xuống, cần tìm nhà Thanh Khê');
  ok('B buyer demand', d.classification === 'buyer' && d.actorRole === 'demand_side');
  const action = resolveRebuildAction({
    classification: 'buyer',
    actorRole: 'demand_side',
    representedDemand: 'buyer',
    brokerActivity: 'unknown',
    finalScore: 70,
    minFindingScore: 40,
    dedupeStatus: 'unique',
  });
  ok('B update', action.action === 'update');
}

{
  const d = detectSubjectDirection('Chính chủ bán đất mặt tiền Khái Tây');
  ok('C seller supply', d.classification === 'seller' && d.actorRole === 'supply_side');
  const action = resolveRebuildAction({
    classification: 'seller',
    actorRole: 'supply_side',
    representedDemand: 'none',
    brokerActivity: 'unknown',
    finalScore: 0,
    minFindingScore: 40,
    dedupeStatus: 'unique',
  });
  ok('C dismiss', action.action === 'dismiss');
}

{
  const d = detectSubjectDirection('Studio full nội thất mới tại Sơn Trà giá tốt');
  ok('D not renter by default', d.classification !== 'renter');
}

{
  const d = detectSubjectDirection('Thành 0944359157, mong hữu duyên để vào việc');
  ok('E unknown', d.classification === 'unknown');
  const action = resolveRebuildAction({
    classification: 'unknown',
    actorRole: 'unknown',
    representedDemand: 'unknown',
    brokerActivity: 'unknown',
    finalScore: 0,
    minFindingScore: 40,
    dedupeStatus: 'unique',
  });
  ok('E needs_review never dismiss', action.action === 'needs_review');
}

{
  const d = detectSubjectDirection('E cầm trên tay 1t850 mà đi gần 3 tháng chưa chốt được nhà');
  ok('F buyer or demand signal', d.classification === 'buyer' || d.demandSignals.length > 0);
  const action = resolveRebuildAction({
    classification: d.classification === 'buyer' ? 'buyer' : 'buyer',
    actorRole: 'demand_side',
    representedDemand: 'buyer',
    brokerActivity: 'unknown',
    finalScore: d.classification === 'buyer' ? 60 : 30,
    minFindingScore: 40,
    dedupeStatus: 'unique',
  });
  ok('F not dismiss', action.action === 'update' || action.action === 'needs_review');
}

{
  const s = scoreFor('seller', 'supply_side', 100, 95);
  ok('6 kw100 seller final 0', s.finalScore === 0);
}

{
  const s = scoreFor('buyer', 'demand_side', 10, 85);
  ok('7 buyer low kw still scores', s.finalScore > 0);
}

{
  const a = normalizeLeadContent('Cần mua nhà Đà Nẵng!!! 🏠');
  const b = normalizeLeadContent('cần mua nhà đà nẵng');
  ok('10 emoji/whitespace normalize equal', hashNormalizedContent(a) === hashNormalizedContent(b));

  const title = 'Bán nhà Phú Lộc 75m2 gần chợ';
  const body = `${title}\nBán nhà Phú Lộc 75m2 gần chợ trường học biển`;
  const n = normalizeLeadContent(body, title);
  const full = normalizeLeadContent(body);
  ok('11 title prefix stripped once', n.length < full.length && n.includes('trường học biển'));
}

{
  const fp1 = computeNearDuplicateFingerprint(
    normalizeLeadContent('Cần mua nhà 3 tỷ Lê Duẩn Đà Nẵng gấp'),
  );
  const fp2 = computeNearDuplicateFingerprint(
    normalizeLeadContent('Cần mua nhà 3 tỷ Lê Duẩn Đà Nẵng gấp!!!'),
  );
  ok('near dup high similarity', hammingSimilarity(fp1, fp2) >= 0.9);
}

{
  const bad = validateFindingsBulkAction({ action: 'dismissed', findingIds: [] });
  ok('bulk empty rejected', bad.ok === false);
  const tooMany = validateFindingsBulkAction({
    action: 'dismissed',
    findingIds: Array.from({ length: 501 }, (_, i) => `id-${i}`),
  });
  ok('bulk max 500', tooMany.ok === false);
  const okBulk = validateFindingsBulkAction({
    action: 'reviewed',
    findingIds: ['a', 'b'],
  });
  ok('bulk valid', okBulk.ok === true);
}

console.log(`\n${passed} assertions passed`);
