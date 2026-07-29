/**
 * H2.4.10 — Ignore Learning: create spam rules from ignored findings.
 * Reuses existing AgentSpamRule + evaluateContentSpam infrastructure.
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

export async function learnFromIgnoredFinding(input: {
  findingId: string;
  reason: IgnoreReason;
  actor: string;
}): Promise<{ rulesCreated: number }> {
  if (!SPAM_LEARNABLE.has(input.reason)) return { rulesCreated: 0 };

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
          authorName: true,
          sourceId: true,
        },
      },
    },
  });
  if (!finding?.scannedContent) return { rulesCreated: 0 };

  const sc = finding.scannedContent;
  const label = `auto:ignore_${input.reason}:${input.findingId.slice(0, 12)}`;
  const reasonText = `Learned from ignored finding (${input.reason}) by ${input.actor}`;
  let created = 0;

  if (sc.canonicalUrl) {
    const exists = await prisma.agentSpamRule.findFirst({
      where: { type: 'canonical_url', rawValue: sc.canonicalUrl, isActive: true, archivedAt: null },
    });
    if (!exists) {
      await createSpamRule({
        companyId: finding.companyId,
        sourceId: finding.sourceId,
        type: 'canonical_url',
        action: 'block',
        rawValue: sc.canonicalUrl,
        label,
        reason: reasonText,
        priority: 10,
        metadata: { origin: 'ignore_learning', findingId: input.findingId, ignoreReason: input.reason },
        createdBy: input.actor,
      });
      created++;
    }
  }

  if (sc.contentHash) {
    const exists = await prisma.agentSpamRule.findFirst({
      where: { type: 'content_hash', rawValue: sc.contentHash, isActive: true, archivedAt: null },
    });
    if (!exists) {
      await createSpamRule({
        companyId: finding.companyId,
        sourceId: finding.sourceId,
        type: 'content_hash',
        action: 'block',
        rawValue: sc.contentHash,
        normalizedValue: sc.normalizedContentHash,
        label,
        reason: reasonText,
        priority: 15,
        metadata: {
          origin: 'ignore_learning',
          findingId: input.findingId,
          ignoreReason: input.reason,
          fingerprint: sc.nearDuplicateFingerprint,
        },
        createdBy: input.actor,
      });
      created++;
    }
  }

  return { rulesCreated: created };
}
