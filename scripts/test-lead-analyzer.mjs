#!/usr/bin/env node
/**
 * Sprint 4.1 — Lead Analyzer unit tests (no network / no AI calls).
 * Run: npm run test:lead-analyzer
 */
import {
  parseLeadAnalysisJson,
  tryParseLeadAnalysisJson,
  validateLeadAnalysis,
} from '../server/agent/leadAnalysisSchema.ts';
import {
  analyzeLeadContent,
  buildDeterministicFallback,
  sanitizeAnalysisAgainstSource,
} from '../server/agent/leadAnalyzer.ts';
import {
  runLeadPrefilter,
  shouldRunLeadAnalysis,
} from '../server/agent/leadPrefilter.ts';

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, error) {
  failed += 1;
  console.error(`  ✗ ${label}`);
  console.error('   ', error instanceof Error ? error.message : error);
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail || 'assertion failed');
}

console.log('\n=== Lead Analyzer — unit tests ===\n');

console.log('Schema validator');
const valid = validateLeadAnalysis({
  classification: 'buyer',
  intent: 'buy',
  confidence: 0.82,
  score: 76,
  region: 'Đà Nẵng',
  budgetMin: null,
  budgetMax: null,
  areaMin: 75,
  areaMax: null,
  propertyTypes: ['căn hộ'],
  urgency: 'medium',
  contact: { phone: '0905123456' },
  summary: 'Cần mua căn hộ',
  reasons: ['Có nhu cầu mua'],
});
assert(valid.classification === 'buyer', 'validates classification');
assert(valid.confidence === 0.82, 'clamps confidence 0..1');
assert(valid.score === 76, 'clamps score 0..100');

const invalidEnum = validateLeadAnalysis({
  classification: 'hacker',
  intent: 'fly',
  confidence: 2,
  score: 500,
  urgency: 'urgent',
  propertyTypes: 'not-array',
  contact: 'bad',
  summary: 123,
  reasons: 'nope',
});
assert(invalidEnum.classification === 'unknown', 'invalid classification -> unknown');
assert(invalidEnum.intent === 'unknown', 'invalid intent -> unknown');
assert(invalidEnum.urgency === 'low', 'invalid urgency -> low');
assert(invalidEnum.confidence === 1, 'confidence capped at 1');
assert(invalidEnum.score === 100, 'score capped at 100');
assert(Array.isArray(invalidEnum.propertyTypes), 'propertyTypes array');

console.log('\nJSON parser');
const jsonText = '```json\n{"classification":"renter","intent":"rent","confidence":0.7,"score":65,"region":null,"budgetMin":null,"budgetMax":null,"areaMin":null,"areaMax":null,"propertyTypes":[],"urgency":"low","contact":{},"summary":"Cho thuê","reasons":["cho thuê"]}\n```';
const parsed = parseLeadAnalysisJson(jsonText);
assert(parsed.intent === 'rent', 'parses JSON from markdown fence');

const broken = tryParseLeadAnalysisJson('{not json at all');
assert(broken.ok === false, 'rejects invalid JSON');

console.log('\nPrefilter');
const good = runLeadPrefilter({
  title: 'Căn hộ cho thuê Đà Nẵng',
  bodyText: 'Cho thuê căn hộ 2 phòng ngủ tại Sơn Trà, giá 15 triệu/tháng. Nhà đầu tư quan tâm dòng tiền liên hệ ngay.',
  positiveKeywords: ['cho thuê', 'đà nẵng'],
  negativeKeywords: ['bán gấp'],
});
assert(good.passed, 'prefilter passes relevant content');
assert(good.score >= 20, `prefilter score ${good.score}`);

const short = runLeadPrefilter({
  title: 'Hi',
  bodyText: 'short',
  positiveKeywords: ['cho thuê'],
  negativeKeywords: [],
});
assert(!short.passed, 'rejects short body');

const spam = runLeadPrefilter({
  title: 'spam',
  bodyText: `${'inbox ngay '.repeat(40)} zalo: 0909999999 cam kết lợi nhuận liên hệ 0909999999`,
  positiveKeywords: [],
  negativeKeywords: ['inbox ngay', 'cam kết lợi nhuận'],
});
assert(spam.isHardSpam || !spam.passed, 'blocks spam patterns');

assert(shouldRunLeadAnalysis({ prefilter: good, deepAnalyze: false }), 'runs when prefilter passes');
assert(shouldRunLeadAnalysis({ prefilter: short, deepAnalyze: true }), 'deepAnalyze bypasses score');
assert(!shouldRunLeadAnalysis({ prefilter: { ...spam, isHardSpam: true, passed: false, score: 0, reasons: [] }, deepAnalyze: true }), 'hard spam blocks even deepAnalyze');

console.log('\nSanitizer');
const invented = sanitizeAnalysisAgainstSource(
  validateLeadAnalysis({
    classification: 'buyer',
    intent: 'buy',
    confidence: 0.9,
    score: 80,
    region: 'Hà Nội',
    budgetMin: null,
    budgetMax: null,
    areaMin: null,
    areaMax: null,
    propertyTypes: [],
    urgency: 'low',
    contact: { phone: '0999888777', email: 'fake@example.com' },
    summary: 'test',
    reasons: [],
  }),
  {
    title: 'Căn hộ Đà Nẵng',
    bodyText: 'Nội dung không có số điện thoại hay email.',
    canonicalUrl: 'https://example.test/a',
  },
);
assert(!invented.contact.phone, 'strips invented phone');
assert(!invented.contact.email, 'strips invented email');

console.log('\nDeterministic fallback');
const fallback = buildDeterministicFallback(
  {
    title: 'Cho thuê căn hộ Sơn Trà',
    bodyText: 'Cho thuê căn hộ 2PN gần biển, giá 15 triệu. Liên hệ 0905111222',
    canonicalUrl: 'https://example.test/b',
    positiveKeywords: ['cho thuê'],
    negativeKeywords: [],
  },
  good,
);
assert(fallback.classification === 'renter', 'fallback renter for cho thuê');
assert(fallback.contact.phone === '0905111222', 'extracts phone from text');

console.log('\nAnalyzer orchestration (skip AI)');
const output = await analyzeLeadContent(
  {
    title: 'Cần mua căn hộ Đà Nẵng',
    bodyText: 'Tôi cần mua căn hộ 2 phòng ngủ khu vực Sơn Trà, ngân sách khoảng 3 tỷ. Liên hệ 0905333444',
    canonicalUrl: 'https://example.test/c',
    positiveKeywords: ['cần mua', 'đà nẵng'],
    negativeKeywords: [],
  },
  { skipAi: true },
);
assert(output.ran, 'skipAi still runs deterministic path');
assert(output.analysis?.classification === 'buyer', 'buyer classification from fallback');
assert(output.extractedData?.classification === 'buyer', 'stores extractedData');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
