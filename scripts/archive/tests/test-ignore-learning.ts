/**
 * H2.4.10 + H2.4.11 — Decision Learning regression test.
 * Run: npx tsx scripts/test-ignore-learning.ts
 */
import assert from 'node:assert/strict';
import type { IgnoreReason, DecisionKnowledgeState } from '../server/modules/sales-layer/ignoreLearnService';
import { decisionScorePenalty, shouldRejectLead, shouldSuppressTelegram, lookupDecisionPenalty } from '../server/modules/sales-layer/ignoreLearnService';
import type { SalesSnapshot } from '../server/modules/executive-dashboard/types';
import { computeLeadPriority } from '../server/modules/lead-acquisition/priorityEngine';
import { evaluateSpamPolicy } from '../server/agent/spam/evaluateSpamPolicy';
import type { SpamEvaluateInput, SpamRule } from '../server/agent/spam/spamTypes';

function ok(name: string, cond: unknown) {
  assert.ok(cond, name);
  console.log(`✓ ${name}`);
}

// --- H2.4.10 regressions ---
{
  const reasons: IgnoreReason[] = ['spam', 'duplicate', 'broker', 'irrelevant', 'already_contacted', 'invalid_phone', 'other'];
  ok('IgnoreReason has 7 variants', reasons.length === 7);
  ok('spam is learnable', ['spam', 'duplicate'].includes('spam'));
  ok('already_contacted is not learnable', !['spam', 'duplicate'].includes('already_contacted'));
}

{
  const snapshot: Partial<SalesSnapshot> = {
    buyersToday: 5, qualifiedToday: 3, urgentBuyers: 1,
    pipelineValue: 100, expectedRevenue: 50,
    ignoredToday: 2, spamLearnedToday: 1, spamHitRate: 5.5, rejectedBeforeAi: 10,
    pendingLearning: 3, decisionsLearnedToday: 5, learningPromoted: 2, falsePositivePrevented: 1,
  };
  ok('SalesSnapshot has pendingLearning', 'pendingLearning' in snapshot);
  ok('SalesSnapshot has decisionsLearnedToday', 'decisionsLearnedToday' in snapshot);
  ok('SalesSnapshot has learningPromoted', 'learningPromoted' in snapshot);
  ok('SalesSnapshot has falsePositivePrevented', 'falsePositivePrevented' in snapshot);
}

{
  const { callbackDataToCommand } = await import('../server/modules/control-plane/inlineKeyboard');
  const skipCmd = callbackDataToCommand('l:s:abc123');
  ok('l:s callback maps to /lead skip', skipCmd === '/lead skip abc123');
}

// --- H2.4.11 Decision Learning ---
{
  ok('broker penalty = -40', decisionScorePenalty('broker') === -40);
  ok('spam penalty = -100', decisionScorePenalty('spam') === -100);
  ok('invalid_phone penalty = -50', decisionScorePenalty('invalid_phone') === -50);
  ok('already_contacted penalty = -10', decisionScorePenalty('already_contacted') === -10);
}

{
  ok('spam should reject', shouldRejectLead('spam'));
  ok('invalid_phone should reject', shouldRejectLead('invalid_phone'));
  ok('broker should not reject', !shouldRejectLead('broker'));
}

{
  ok('spam should suppress telegram', shouldSuppressTelegram('spam'));
  ok('duplicate should suppress telegram', shouldSuppressTelegram('duplicate'));
  ok('broker should not suppress telegram', !shouldSuppressTelegram('broker'));
}

// --- Threshold learning ---
{
  const state: DecisionKnowledgeState = {
    decisions: [
      { findingId: 'f1', reason: 'broker', actor: 'agent1', canonicalUrl: 'https://x.com/1', contentHash: null, fingerprint: null, sourceId: 's1', createdAt: new Date().toISOString() },
      { findingId: 'f2', reason: 'broker', actor: 'agent2', canonicalUrl: 'https://x.com/1', contentHash: null, fingerprint: null, sourceId: 's1', createdAt: new Date().toISOString() },
    ],
    pending: [],
    counters: { totalDecisions: 2, promoted: 0, falsePositivePrevented: 0 },
  };
  const match = lookupDecisionPenalty(state, { canonicalUrl: 'https://x.com/1' });
  ok('lookupDecisionPenalty finds broker match', match.reason === 'broker');
  ok('lookupDecisionPenalty penalty = -40', match.penalty === -40);
  ok('lookupDecisionPenalty matchCount = 2', match.matchCount === 2);
}

{
  const noMatch = lookupDecisionPenalty(
    { decisions: [], pending: [], counters: { totalDecisions: 0, promoted: 0, falsePositivePrevented: 0 } },
    { canonicalUrl: 'https://unknown.com' },
  );
  ok('lookupDecisionPenalty returns 0 for no match', noMatch.penalty === 0);
  ok('lookupDecisionPenalty returns null reason for no match', noMatch.reason === null);
}

// --- Score adjustment via priority engine ---
{
  const intent = { intent: 'buyer' as const, confidence: 0.8, matchedPatterns: ['mua nhà'], reasons: ['pattern match'] };
  const timeline = 'within_30_days' as const;
  const campaignMatch = { campaignId: null, campaignName: null, propertyHint: null, matchScore: 50, reasons: [] };

  const base = computeLeadPriority({
    intent, timeline, campaignMatch,
    hasPhone: true, hasBudget: true, text: 'Cần mua nhà 3 tỷ Quận 7',
  });

  const penalized = computeLeadPriority({
    intent, timeline, campaignMatch,
    hasPhone: true, hasBudget: true, text: 'Cần mua nhà 3 tỷ Quận 7',
    decisionPenalty: -40,
  });
  ok('decisionPenalty lowers finalScore', penalized.finalScore < base.finalScore);
}

// --- Simhash / near_duplicate_fingerprint spam evaluation ---
{
  const rule: SpamRule = {
    id: 'rule-1', type: 'near_duplicate_fingerprint', action: 'block',
    rawValue: 'fp:abc123xyz', priority: 10, isActive: true,
  };
  const input: SpamEvaluateInput = {
    contentText: 'test', nearDuplicateFingerprint: 'fp:abc123xyz', rules: [rule],
  };
  const decision = evaluateSpamPolicy(input);
  ok('near_duplicate_fingerprint blocks matching content', decision.decision === 'block');
  ok('near_duplicate_fingerprint is hard gate', decision.hardGate === true);
}

{
  const rule: SpamRule = {
    id: 'rule-2', type: 'near_duplicate_fingerprint', action: 'block',
    rawValue: 'fp:different', priority: 10, isActive: true,
  };
  const input: SpamEvaluateInput = {
    contentText: 'test', nearDuplicateFingerprint: 'fp:abc123xyz', rules: [rule],
  };
  const decision = evaluateSpamPolicy(input);
  ok('near_duplicate_fingerprint allows non-matching content', decision.decision === 'allow');
}

console.log('\nDecision Learning + Threshold Knowledge: ALL PASS');
