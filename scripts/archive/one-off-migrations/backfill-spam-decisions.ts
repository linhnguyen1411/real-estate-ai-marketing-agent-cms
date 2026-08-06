#!/usr/bin/env node
/**
 * Backfill spam decisions for existing ScannedContent (dry-run by default).
 * Usage:
 *   npm run agent:backfill-spam-decisions
 *   npm run agent:backfill-spam-decisions -- --apply --limit 100 --phone 0905777594
 */
import 'dotenv/config';
import { prisma } from '../server/prisma';
import { evaluateContentSpam } from '../server/agent/spam/spamPolicyService';
import { normalizeSpamPhoneInput } from '../server/agent/spam/phoneSpam';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || null : null;
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const apply = has('--apply');
  const limit = Math.max(1, Number(arg('--limit') || 50));
  const sourceId = arg('--source-id');
  const since = arg('--since');
  const phoneFilter = arg('--phone');
  const ruleType = arg('--rule-type');

  console.log(`[backfill-spam] dryRun=${!apply} limit=${limit}`);

  const where: Record<string, unknown> = {
    status: { notIn: ['archived'] },
  };
  if (sourceId) where.sourceId = sourceId;
  if (since) where.collectedAt = { gte: new Date(since) };

  const contents = await prisma.scannedContent.findMany({
    where,
    orderBy: { collectedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      companyId: true,
      sourceId: true,
      contentText: true,
      authorName: true,
      authorUrl: true,
      canonicalUrl: true,
      contentHash: true,
      normalizedContentHash: true,
      status: true,
      metrics: true,
      rawData: true,
    },
  });

  let matched = 0;
  let wouldBlock = 0;
  let applied = 0;

  for (const row of contents) {
    const { decision } = await evaluateContentSpam({
      contentText: row.contentText,
      authorName: row.authorName,
      authorUrl: row.authorUrl,
      canonicalUrl: row.canonicalUrl,
      contentHash: row.contentHash,
      normalizedContentHash: row.normalizedContentHash,
      companyId: row.companyId,
      sourceId: row.sourceId,
      tier: 'all',
    });

    if (!decision.hardGate) continue;
    if (ruleType && !decision.matchedRules.some(m => m.type === ruleType)) continue;
    if (phoneFilter) {
      const n = normalizeSpamPhoneInput(phoneFilter);
      if (!n || !decision.matchedRules.some(m => m.type === 'phone' && (m.matchedValue === n.normalizedValue || m.matchedValue === n.e164Value))) {
        continue;
      }
    }

    matched += 1;
    if (decision.decision === 'block') wouldBlock += 1;

    console.log(
      `- ${row.id} status=${row.status} → ${decision.decision} (${decision.primaryReason})`,
    );

    if (!apply) continue;

    const prevMetrics =
      row.metrics && typeof row.metrics === 'object' ? (row.metrics as Record<string, unknown>) : {};
    const prevRaw =
      row.rawData && typeof row.rawData === 'object' ? (row.rawData as Record<string, unknown>) : {};

    await prisma.scannedContent.update({
      where: { id: row.id },
      data: {
        status: decision.decision === 'block' ? 'blocked' : 'ignored',
        metrics: {
          ...prevMetrics,
          leadAnalysis: {
            ...((prevMetrics.leadAnalysis as object) || {}),
            filterStage: decision.decision === 'block' ? 'blocked' : 'spam_ignored',
            spamDecision: decision.decision,
            spamReason: decision.primaryReason,
            matchedSpamRuleIds: decision.matchedRules.map(m => m.ruleId),
            blockedAt: new Date().toISOString(),
            blockedByRuleVersion: decision.version,
          },
        },
        rawData: {
          ...prevRaw,
          spamDecision: decision.decision,
          spamReason: decision.primaryReason,
          matchedSpamRuleIds: decision.matchedRules.map(m => m.ruleId),
        },
      },
    });
    applied += 1;
  }

  console.log(
    `\nImpact: scanned=${contents.length} matched=${matched} wouldBlock=${wouldBlock} applied=${applied}`,
  );
  console.log('Note: does not delete Findings / Leads / CRM.');
  if (!apply) console.log('Re-run with --apply to persist.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
