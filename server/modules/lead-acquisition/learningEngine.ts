/**
 * Learning loop — sales outcomes feed back into acquisition profile.
 * Stores outcome on finding; adjusts pipeline stage (no ML model training here).
 */

import { prisma } from '../../prisma';
import type { LeadAcquisitionProfile, LeadPipelineStage, LearningOutcome } from './types';
import { readAcquisitionProfile, writeAcquisitionProfile } from './acquisitionService';

const OUTCOME_STAGE: Record<LearningOutcome, LeadPipelineStage> = {
  won: 'won',
  lost: 'lost',
  spam: 'lost',
  wrong: 'lost',
};

export async function recordLeadLearning(input: {
  findingId: string;
  outcome: LearningOutcome;
  note?: string;
  actor?: string | null;
}): Promise<LeadAcquisitionProfile | null> {
  const finding = await prisma.agentFinding.findUnique({ where: { id: input.findingId } });
  if (!finding) return null;

  const profile =
    readAcquisitionProfile(finding.extractedData) ||
    ({
      version: 'h3_v1',
      findingId: finding.id,
      pipelineStage: 'candidate',
      intent: {
        intent: 'unknown',
        confidence: 0.2,
        matchedPatterns: [],
        reasons: [],
      },
      persona: { persona: 'unknown', confidence: 0.2, reasons: [] },
      timeline: 'unknown',
      campaignMatch: {
        campaignId: null,
        campaignName: null,
        propertyHint: null,
        matchScore: 0,
        reasons: [],
      },
      priority: {
        urgency: 0,
        budget: 0,
        areaMatch: 0,
        campaignMatch: 0,
        activity: 0,
        buyingTimeline: 0,
        engagement: 0,
        aiConfidence: 0,
        finalScore: finding.finalScore ?? finding.score ?? 0,
      },
      action: { action: 'monitor', label: 'Monitor', reason: 'learning bootstrap' },
      isBuyer: false,
      isVip: false,
      updatedAt: new Date().toISOString(),
    } satisfies LeadAcquisitionProfile);

  profile.learningOutcome = input.outcome;
  profile.pipelineStage = OUTCOME_STAGE[input.outcome];
  profile.updatedAt = new Date().toISOString();

  const extracted =
    finding.extractedData && typeof finding.extractedData === 'object' && !Array.isArray(finding.extractedData)
      ? { ...(finding.extractedData as Record<string, unknown>) }
      : {};
  writeAcquisitionProfile(extracted, profile);
  extracted.learning = {
    outcome: input.outcome,
    note: input.note || null,
    actor: input.actor || null,
    at: profile.updatedAt,
  };

  await prisma.agentFinding.update({
    where: { id: finding.id },
    data: {
      extractedData: extracted as object,
      status:
        input.outcome === 'won'
          ? 'won'
          : input.outcome === 'spam'
            ? 'dismissed'
            : finding.status,
      scoreStatus: `learning:${input.outcome}`,
    },
  });

  return profile;
}
