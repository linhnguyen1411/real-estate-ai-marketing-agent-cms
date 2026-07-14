#!/usr/bin/env node
/**
 * Sprint 3.2 — Website Reader offline tests (no internet).
 * Run: npm run test:website-reader
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import {
  assertSafePublicUrl,
  BROWSER_EXTRACT_SCRIPT,
  computeContentHash,
  normalizeCanonicalUrl,
  normalizeText,
  parseHtmlFixture,
  resolveLink,
} from '../server/agent-worker/services/contentNormalizer.ts';
import {
  resolveRuleSet,
  scoreContent,
} from '../server/agent-worker/services/findingRuleEngine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'server/agent-worker/fixtures/sample-article.html');

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

console.log('\n=== Website Reader — offline tests ===\n');

// --- URL safety ---
console.log('URL safety');
try {
  assertSafePublicUrl('https://example.test/page');
  ok('allows public https');
} catch (e) {
  fail('allows public https', e);
}

try {
  assertSafePublicUrl('http://127.0.0.1/');
  fail('blocks localhost', 'should throw');
} catch {
  ok('blocks localhost');
}

try {
  assertSafePublicUrl('http://192.168.1.10/');
  fail('blocks private IP', 'should throw');
} catch {
  ok('blocks private IP');
}

// --- Fixture HTML parse ---
console.log('\nHTML fixture parse');
const html = fs.readFileSync(fixturePath, 'utf8');
const pageUrl = 'https://example.test/tin-dang/can-ho-cho-thue';
const parsed = parseHtmlFixture(html, pageUrl);

assert(parsed.title.includes('cho thuê'), 'extracts title');
assert(parsed.canonicalUrl === 'https://example.test/tin-dang/can-ho-cho-thue', 'canonical URL');
assert(parsed.bodyText.includes('nhà đầu tư'), 'extracts body text');
assert(parsed.links.includes('https://example.test/tin-dang/khac'), 'extracts same-domain link');
assert(parsed.links.includes('https://other.test/external'), 'extracts external link candidates');
assert(parsed.publishedAt?.includes('2026-06-01'), 'extracts published time');

const normalized = normalizeText(parsed.bodyText);
const hash1 = computeContentHash(normalizeCanonicalUrl(parsed.canonicalUrl), normalized);
const hash2 = computeContentHash(normalizeCanonicalUrl(parsed.canonicalUrl), normalized);
assert(hash1 === hash2, 'content hash is stable');
assert(hash1.length === 64, 'content hash is sha256 hex');

// --- Rule engine ---
console.log('\nFinding rule engine');
const mockSource = {
  id: 'src-1',
  companyId: 'comp-1',
  config: {
    positiveKeywords: ['cho thuê', 'đà nẵng'],
    negativeKeywords: ['bán gấp'],
    minScore: 40,
    notifyScore: 70,
  },
};
const mockMission = {
  id: 'mis-1',
  rules: { keywords: ['nhà đầu tư'], minScore: 30 },
};

const rules = resolveRuleSet(mockSource, mockMission);
const scored = scoreContent(parsed.title, parsed.bodyText, rules);
assert(scored.score >= 30, `score meets threshold (${scored.score})`, `score=${scored.score}`);
assert(scored.matchedPositive.includes('cho thuê'), 'matches positive keyword');
assert(scored.reasons.length > 0, 'produces reasons');

const negative = scoreContent('Bán gấp', 'Bán gấp căn hộ', rules);
assert(negative.score < scored.score, 'negative keywords reduce score');

// --- Playwright setContent (no network) ---
console.log('\nPlaywright DOM extract (setContent, offline)');
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { url: pageUrl });
  const raw = await page.evaluate(BROWSER_EXTRACT_SCRIPT);
  await browser.close();

  assert(String(raw.title).includes('cho thuê'), 'playwright extracts title');
  assert(String(raw.bodyText).includes('Sơn Trà'), 'playwright extracts body');
  assert(Array.isArray(raw.links) && raw.links.length >= 1, 'playwright extracts links');
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("Executable doesn't exist") || message.includes('playwright install')) {
    console.log('  ⊘ skipped — Chromium chưa cài (npm run agent:install-browser)');
  } else {
    fail('playwright offline extract', e);
  }
}

// --- resolveLink ---
console.log('\nLink resolver');
const resolved = resolveLink(pageUrl, '/tin-dang/khac');
assert(resolved === 'https://example.test/tin-dang/khac', 'resolves relative links');
assert(resolveLink(pageUrl, 'javascript:void(0)') === null, 'skips javascript links');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
