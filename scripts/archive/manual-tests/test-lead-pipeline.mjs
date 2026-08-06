#!/usr/bin/env node
/**
 * Unit tests for lead analysis config + score merge (no live AI).
 * Run: npm run test:lead-pipeline
 */
import {
  computeFinalScore,
  scoreContent,
} from '../server/agent-worker/services/findingRuleEngine.ts';
import { resolveLeadAnalysisConfig } from '../server/agent/analysisConfig.ts';
import { getDefaultPositiveKeywords } from '../server/agent/defaultKeywordSets.ts';

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed += 1;
  console.error(`  ✗ ${label}`, detail || '');
}

function assert(cond, label, detail) {
  if (cond) ok(label);
  else fail(label, detail);
}

console.log('\n=== Lead analysis pipeline — unit tests ===\n');

console.log('Default keyword pack');
assert(getDefaultPositiveKeywords().length > 20, 'default positive pack non-empty');
assert(getDefaultPositiveKeywords().includes('cần mua'), 'includes cần mua');
assert(getDefaultPositiveKeywords().includes('đà nẵng'), 'includes đà nẵng');

console.log('\nresolveLeadAnalysisConfig');
{
  const emptySource = {
    id: 's1',
    companyId: null,
    name: 't',
    type: 'facebook_group',
    url: 'https://facebook.com/groups/x',
    status: 'active',
    priority: 1,
    scanIntervalMinutes: 60,
    config: {},
    checkpoint: null,
    lastScannedAt: null,
    nextScanAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const cfg = resolveLeadAnalysisConfig(emptySource, null);
  assert(cfg.analysisMode === 'hybrid', 'default mode hybrid');
  assert(cfg.usedDefaultKeywords === true, 'uses default keywords when empty');
  assert(cfg.positiveKeywords.includes('mua đất'), 'default has mua đất');
  assert(cfg.minScore === 40, 'hybrid default minScore 40');

  const custom = resolveLeadAnalysisConfig(
    { ...emptySource, config: { positiveKeywords: ['xyz'], analysisMode: 'ai_first', minScore: 35 } },
    null,
  );
  assert(custom.analysisMode === 'ai_first', 'source analysisMode override');
  assert(custom.usedDefaultKeywords === false, 'custom keywords skip defaults');
  assert(custom.positiveKeywords.includes('xyz'), 'keeps custom keyword');
  assert(custom.minScore === 35, 'custom minScore');
}

console.log('\nKeyword score + final score merge');
{
  const scored = scoreContent(
    'Cần mua đất Nam Đà Nẵng',
    'Đang tìm lô đất lớn gần Hòa Xuân',
    {
      positiveKeywords: ['cần mua', 'mua đất', 'hòa xuân', 'đất'],
      negativeKeywords: ['tuyển dụng'],
    },
  );
  assert(scored.score >= 40, `keyword score high enough (${scored.score})`);
  assert(scored.matchedPositive.length >= 2, 'matched positives');

  assert(
    computeFinalScore({ keywordScore: 10, aiScore: 80, analysisMode: 'ai_first' }) >= 80,
    'ai_first prefers AI score',
  );
  assert(
    computeFinalScore({ keywordScore: 70, aiScore: 40, analysisMode: 'hybrid' }) >= 70,
    'hybrid takes max of keyword/AI',
  );
  assert(
    computeFinalScore({ keywordScore: 55, aiScore: null, analysisMode: 'hybrid' }) === 55,
    'null AI falls back to keyword',
  );
  assert(
    computeFinalScore({ keywordScore: 12, aiScore: 90, analysisMode: 'keyword_only' }) === 12,
    'keyword_only ignores AI score',
  );
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
