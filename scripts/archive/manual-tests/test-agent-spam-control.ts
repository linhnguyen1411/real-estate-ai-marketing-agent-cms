#!/usr/bin/env node
/**
 * AI Scanner 2.0 — spam control pure + phone normalization tests.
 * Run: npm run test:agent-spam-control
 */
import assert from 'node:assert/strict';
import { evaluateSpamPolicy } from '../server/agent/spam/evaluateSpamPolicy';
import { normalizeSpamPhoneInput, phonesMatch, collectPhonesFromText } from '../server/agent/spam/phoneSpam';
import type { SpamRule } from '../server/agent/spam/spamTypes';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

function rule(partial: Partial<SpamRule> & Pick<SpamRule, 'id' | 'type' | 'action' | 'rawValue'>): SpamRule {
  return {
    priority: 100,
    isActive: true,
    normalizedValue: partial.normalizedValue ?? null,
    e164Value: partial.e164Value ?? null,
    ...partial,
  };
}

function main() {
  // 1. Phone normalization formats
  const formats = [
    '0905777594',
    '0905 777 594',
    '0905.777.594',
    '+84905777594',
    '84 905 777 594',
  ];
  for (const f of formats) {
    const n = normalizeSpamPhoneInput(f);
    ok(`normalize ${f} → 0905777594`, n?.normalizedValue === '0905777594');
    ok(`normalize ${f} e164`, n?.e164Value === '+84905777594');
  }

  // 2. Block phone — spaced content
  const blockPhone = rule({
    id: 'r-phone-block',
    type: 'phone',
    action: 'block',
    rawValue: '0905777594',
    normalizedValue: '0905777594',
    e164Value: '+84905777594',
    reason: 'spam_hotline',
  });
  const d1 = evaluateSpamPolicy({
    contentText: 'Bán đất... LH 0905 777 594',
    rules: [blockPhone],
  });
  ok('block phone decision', d1.decision === 'block');
  ok('block phone reason', d1.primaryReason === 'blocked_phone');
  ok('block phone hardGate', d1.hardGate === true);

  // 3. Same number +849 format
  const d2 = evaluateSpamPolicy({
    contentText: 'Liên hệ +84905777594 ngay',
    rules: [blockPhone],
  });
  ok('block +84 format', d2.decision === 'block' && d2.hardGate);

  // 4. Whitelist overrides
  const allowPhone = rule({
    id: 'r-phone-allow',
    type: 'phone',
    action: 'allow',
    rawValue: '0905777594',
    normalizedValue: '0905777594',
    e164Value: '+84905777594',
    priority: 10,
  });
  const d3 = evaluateSpamPolicy({
    contentText: 'LH 0905777594',
    rules: [blockPhone, allowPhone],
  });
  ok('whitelist overrides block', d3.decision === 'allow' && !d3.hardGate);

  // 5. Two phones — one blocked one allowed: allow only covers its value;
  // blocked phone still wins overall when no allow for that phone.
  const otherBlock = rule({
    id: 'r-other',
    type: 'phone',
    action: 'block',
    rawValue: '0912345678',
    normalizedValue: '0912345678',
    e164Value: '+84912345678',
  });
  const allowOnlyMain = rule({
    id: 'r-allow-main',
    type: 'phone',
    action: 'allow',
    rawValue: '0905777594',
    normalizedValue: '0905777594',
    e164Value: '+84905777594',
  });
  const d4 = evaluateSpamPolicy({
    contentText: 'A 0905777594 B 0912345678',
    rules: [otherBlock, allowOnlyMain],
  });
  ok('two phones: blocked other still blocks', d4.decision === 'block');

  // Explicit: both phones allowed → allow
  const allowOther = rule({
    id: 'r-allow-other',
    type: 'phone',
    action: 'allow',
    rawValue: '0912345678',
    normalizedValue: '0912345678',
    e164Value: '+84912345678',
  });
  const d4b = evaluateSpamPolicy({
    contentText: 'A 0905777594 B 0912345678',
    rules: [otherBlock, allowOnlyMain, allowOther],
  });
  ok('two phones: both allowed → allow', d4b.decision === 'allow');

  // 6. Recruitment phrase
  const phrase = rule({
    id: 'r-phrase',
    type: 'keyword_phrase',
    action: 'block',
    rawValue: 'tuyển sale',
  });
  const d5 = evaluateSpamPolicy({
    contentText: 'Công ty tuyển sale BĐS khu vực Đà Nẵng',
    rules: [phrase],
  });
  ok('recruitment phrase blocked', d5.decision === 'block');

  // 7. Buyer valid — no spam rules match
  const d6 = evaluateSpamPolicy({
    contentText: 'Cần mua nhà 4 tỷ tại Hải Châu',
    rules: [blockPhone, phrase],
  });
  ok('buyer valid not spam', d6.decision === 'allow');

  // 8. Seller valid
  const d7 = evaluateSpamPolicy({
    contentText: 'Bán lô đất 100m² mặt tiền Lê Duẩn',
    rules: [blockPhone, phrase],
  });
  ok('seller valid not spam', d7.decision === 'allow');

  // 9. Author profile block
  const profile = rule({
    id: 'r-profile',
    type: 'author_profile_url',
    action: 'block',
    rawValue: 'facebook.com/spam.user',
    normalizedValue: 'facebook.com/spam.user',
  });
  const d8 = evaluateSpamPolicy({
    contentText: 'Bán nhà đẹp',
    authorUrl: 'https://www.facebook.com/spam.user',
    rules: [profile],
  });
  ok('author profile blocked', d8.decision === 'block');

  // 10. Source block
  const src = rule({
    id: 'r-source',
    type: 'source',
    action: 'ignore',
    rawValue: 'src-abc',
    sourceId: 'src-abc',
  });
  const d9 = evaluateSpamPolicy({
    contentText: 'anything',
    sourceId: 'src-abc',
    rules: [src],
  });
  ok('source ignore hardGate', d9.decision === 'ignore' && d9.hardGate);

  // 11. Content hash
  const hash = rule({
    id: 'r-hash',
    type: 'content_hash',
    action: 'block',
    rawValue: 'deadbeef',
    normalizedValue: 'deadbeef',
  });
  const d10 = evaluateSpamPolicy({
    contentText: 'x',
    contentHash: 'deadbeef',
    rules: [hash],
  });
  ok('content hash blocked', d10.decision === 'block');

  // 12. Expiration
  const expired = rule({
    id: 'r-exp',
    type: 'phone',
    action: 'block',
    rawValue: '0905777594',
    normalizedValue: '0905777594',
    e164Value: '+84905777594',
    expiresAt: new Date(Date.now() - 60_000),
  });
  const d11 = evaluateSpamPolicy({
    contentText: 'LH 0905777594',
    rules: [expired],
  });
  ok('expired rule ignored', d11.decision === 'allow');

  // 13. Single common keyword guardrail
  const single = rule({
    id: 'r-single',
    type: 'keyword',
    action: 'block',
    rawValue: 'đất',
  });
  const d12 = evaluateSpamPolicy({
    contentText: 'Cần mua đất Hải Châu',
    rules: [single],
  });
  ok('single keyword đất not blocked', d12.decision === 'allow');

  // 14. phonesMatch helper
  ok(
    'phonesMatch formats',
    phonesMatch({ raw: '0905 777 594' }, { rawValue: '+84905777594' }),
  );

  // 15. collectPhonesFromText
  const collected = collectPhonesFromText('A 0905.777.594 và 0912 345 678');
  ok('collect multiple phones', collected.length >= 2);

  // 16. lower_score not hardGate
  const lower = rule({
    id: 'r-lower',
    type: 'keyword_phrase',
    action: 'lower_score',
    rawValue: 'xem thêm',
    priority: 50,
  });
  const d13 = evaluateSpamPolicy({
    contentText: 'Bán nhà xem thêm tại group',
    rules: [lower],
  });
  ok('lower_score soft', d13.decision === 'lower_score' && !d13.hardGate && d13.scorePenalty > 0);

  console.log(`\n${passed} assertions passed`);
}

main();
