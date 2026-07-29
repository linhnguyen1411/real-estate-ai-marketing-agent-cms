/**
 * H2.4.10 + H2.4.11 — Sales Decision Learning with threshold knowledge.
 * Reuses existing AgentSpamRule + evaluateContentSpam infrastructure.
 * Decision knowledge stored in AppSetting (same pattern as knowledge-base/store.ts).
 */

import { prisma } from '../../prisma';
import { createSpamRule } from '../../agent/spam/spamRuleRepository';

export type IgnoreReason =
  | 'spam'
  | 'duplicate'
  | 'broker'
  | 'irrelevant'
  | 'already_contacted'
  | 'invalid_phone'
  | 'other';

const SPAM_LEARNABLE: Set<IgnoreReason> = new Set(['spam', 'duplicate']);
const LEARNING_THRESHOLD = 2;
const SETTING_KEY = 'decision_knowledge_h2411';

// --- Decision Knowledge Store (AppSetting-backed) ---

export type DecisionEntry = {
  findingId: string;
  reason: IgnoreReason;
  actor: string;
  canonicalUrl: string | null;
  contentHash: string | null;
  fingerprint: string | null;
  sourceId: string | null;
  createdAt: string;
};

export type PendingPattern = {
  key: string;
  type: 'canonical_url' | 'content_hash' | 'fingerprint';
  value: string;
  count: number;
  actors: string[];
  findingIds: string[];
  reason: IgnoreReason;
  firstSeenAt: string;
  lastSeenAt: string;
  promoted: boolean;
};

export type DecisionKnowledgeState = {
  decisions: DecisionEntry[];
  pending: PendingPattern[];
  counters: {
    totalDecisions: number;
    promoted: number;
    falsePositivePrevented: number;
  };
};

function emptyState(): DecisionKnowledgeState {
  return {
    decisions: [],
    pending: [],
    counters: { totalDecisions: 0, promoted: 0, falsePositivePrevented: 0 },
  };
}

export async function loadDecisionKnowledge(): Promise<DecisionKnowledgeState> {
  const row = await prisma.appSetting
    .findUnique({ where: { key: SETTING_KEY } })
    .catch(() => null);
  if (!row?.data || typeof row.data !== 'object') return emptyState();
  const d = row.data as Partial<DecisionKnowledgeState>;
  return {
    decisions: Array.isArray(d.decisions) ? d.decisions.slice(0, 2000) : [],
    pending: Array.isArray(d.pending) ? d.pending : [],
    counters: { ...emptyState().counters, ...(d.counters || {}) },
  };
}

async function saveDecisionKnowledge(state: DecisionKnowledgeState): Promise<void> {
  state.decisions = state.decisions.slice(0, 2000);
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

// --- Score Penalty Map ---

const REASON_SCORE_PENALTY: Record<IgnoreReason, number> = {
  spam: -100,
  duplicate: -100,
  broker: -40,
  irrelevant: -30,
  already_contacted: -10,
  invalid_phone: -50,
  other: -15,
};

export function decisionScorePenalty(reason: IgnoreReason): number {
  return REASON_SCORE_PENALTY[reason] ?? -15;
}

export function shouldRejectLead(reason: IgnoreReason): boolean {
  return reason === 'spam' || reason === 'invalid_phone';
}

export function shouldSuppressTelegram(reason: IgnoreReason): boolean {
  return reason === 'spam' || reason === 'duplicate' || reason === 'invalid_phone';
}

// --- Threshold Learning ---

function patternKey(type: string, value: string): string {
  return `${type}::${value}`;
}

function upsertPending(
  state: DecisionKnowledgeState,
  type: PendingPattern['type'],
  value: string,
  entry: DecisionEntry,
): PendingPattern | null {
  if (!value) return null;
  const key = patternKey(type, value);
  let p = state.pending.find(x => x.key === key);
  if (p) {
    p.count++;
    if (!p.actors.includes(entry.actor)) p.actors.push(entry.actor);
    if (!p.findingIds.includes(entry.findingId)) p.findingIds.push(entry.findingId);
    p.lastSeenAt = entry.createdAt;
  } else {
    p = {
      key,
      type,
      value,
      count: 1,
      actors: [entry.actor],
      findingIds: [entry.findingId],
      reason: entry.reason,
      firstSeenAt: entry.createdAt,
      lastSeenAt: entry.createdAt,
      promoted: false,
    };
    state.pending.push(p);
  }
  return p;
}

function meetsThreshold(p: PendingPattern): boolean {
  return p.count >= LEARNING_THRESHOLD || new Set(p.actors).size >= LEARNING_THRESHOLD;
}

// --- Main API ---

export async function learnFromIgnoredFinding(input: {
  findingId: string;
  reason: IgnoreReason;
  actor: string;
}): Promise<{ rulesCreated: number; pendingCount: number; decisionsTotal: number }> {
  const finding = await prisma.agentFinding.findUnique({
    where: { id: input.findingId },
    select: {
      id: true,
      companyId: true,
      sourceId: true,
      scannedContent: {
        select: {
          canonicalUrl: true,
          contentHash: true,
          normalizedContentHash: true,
          nearDuplicateFingerprint: true,
          sourceId: true,
        },
      },
    },
  });

  const sc = finding?.scannedContent || null;
  const now = new Date().toISOString();
  const entry: DecisionEntry = {
    findingId: input.findingId,
    reason: input.reason,
    actor: input.actor,
    canonicalUrl: sc?.canonicalUrl || null,
    contentHash: sc?.contentHash || null,
    fingerprint: sc?.nearDuplicateFingerprint || null,
    sourceId: finding?.sourceId || null,
    createdAt: now,
  };

  const state = await loadDecisionKnowledge();
  state.decisions.unshift(entry);
  state.counters.totalDecisions++;

  if (!SPAM_LEARNABLE.has(input.reason) || !sc) {
    await saveDecisionKnowledge(state);
    return { rulesCreated: 0, pendingCount: state.pending.filter(p => !p.promoted).length, decisionsTotal: state.counters.totalDecisions };
  }

  const patternsToCheck: PendingPattern[] = [];
  if (sc.canonicalUrl) {
    const p = upsertPending(state, 'canonical_url', sc.canonicalUrl, entry);
    if (p) patternsToCheck.push(p);
  }
  if (sc.contentHash) {
    const p = upsertPending(state, 'content_hash', sc.contentHash, entry);
    if (p) patternsToCheck.push(p);
  }
  if (sc.nearDuplicateFingerprint) {
    const p = upsertPending(state, 'fingerprint', sc.nearDuplicateFingerprint, entry);
    if (p) patternsToCheck.push(p);
  }

  let created = 0;
  for (const p of patternsToCheck) {
    if (p.promoted || !meetsThreshold(p)) continue;

    const ruleType = p.type === 'fingerprint' ? 'content_hash' : p.type;
    const rawValue = p.type === 'fingerprint' ? `fp:${p.value}` : p.value;
    const exists = await prisma.agentSpamRule.findFirst({
      where: { type: ruleType, rawValue, isActive: true, archivedAt: null },
    });
    if (exists) {
      p.promoted = true;
      continue;
    }

    const label = `auto:decision_learning:${p.reason}:${p.findingIds[0]?.slice(0, 10)}`;
    await createSpamRule({
      companyId: finding!.companyId,
      sourceId: finding!.sourceId,
      type: ruleType,
      action: 'block',
      rawValue,
      normalizedValue: p.type === 'content_hash' ? sc.normalizedContentHash : null,
      label,
      reason: `Decision learning: ${p.count} ignores (${p.reason}) by ${p.actors.join(', ')}`,
      priority: p.type === 'canonical_url' ? 10 : p.type === 'content_hash' ? 15 : 20,
      metadata: {
        origin: 'decision_learning',
        threshold: LEARNING_THRESHOLD,
        ignoreReason: p.reason,
        findingIds: p.findingIds.slice(0, 10),
        actors: p.actors,
      },
      createdBy: input.actor,
    });
    p.promoted = true;
    state.counters.promoted++;
    created++;
  }

  await saveDecisionKnowledge(state);
  return {
    rulesCreated: created,
    pendingCount: state.pending.filter(p => !p.promoted).length,
    decisionsTotal: state.counters.totalDecisions,
  };
}

/**
 * Query decision knowledge for a pattern match (used by scoring).
 * Returns the strongest penalty reason if any past decision matches.
 */
export function lookupDecisionPenalty(
  state: DecisionKnowledgeState,
  input: {
    canonicalUrl?: string | null;
    contentHash?: string | null;
    fingerprint?: string | null;
    authorName?: string | null;
  },
): { penalty: number; reason: IgnoreReason | null; matchCount: number } {
  let bestPenalty = 0;
  let bestReason: IgnoreReason | null = null;
  let matchCount = 0;

  for (const d of state.decisions) {
    let matched = false;
    if (input.canonicalUrl && d.canonicalUrl && d.canonicalUrl === input.canonicalUrl) matched = true;
    if (input.contentHash && d.contentHash && d.contentHash === input.contentHash) matched = true;
    if (input.fingerprint && d.fingerprint && d.fingerprint === input.fingerprint) matched = true;
    if (!matched) continue;
    matchCount++;
    const pen = decisionScorePenalty(d.reason);
    if (pen < bestPenalty) {
      bestPenalty = pen;
      bestReason = d.reason;
    }
  }

  return { penalty: bestPenalty, reason: bestReason, matchCount };
}

/** Snapshot for executive compose. */
export async function getDecisionLearningMetrics(): Promise<{
  pendingLearning: number;
  decisionsLearnedToday: number;
  totalDecisions: number;
  promoted: number;
  falsePositivePrevented: number;
}> {
  const state = await loadDecisionKnowledge();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const learnedToday = state.decisions.filter(d => d.createdAt >= todayIso).length;
  return {
    pendingLearning: state.pending.filter(p => !p.promoted).length,
    decisionsLearnedToday: learnedToday,
    totalDecisions: state.counters.totalDecisions,
    promoted: state.counters.promoted,
    falsePositivePrevented: state.counters.falsePositivePrevented,
  };
}
