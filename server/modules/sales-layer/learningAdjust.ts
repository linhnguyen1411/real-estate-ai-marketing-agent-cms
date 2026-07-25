/**
 * Learning adjustments — Won/Lost/Spam/Wrong Buyer feed back into scoring knobs.
 */

import type { LearningOutcome } from '../lead-acquisition/types';
import type { SalesLayerProfile } from './types';

export function applyLearningAdjustments(
  profile: SalesLayerProfile,
  outcome: LearningOutcome,
): SalesLayerProfile {
  const prev = profile.learningAdjust || {
    intentBoost: 0,
    scoreBoost: 0,
    priorityBoost: 0,
    campaignBoost: 0,
    outcomes: [],
  };

  const next = { ...prev, outcomes: [...prev.outcomes, outcome].slice(-20) };
  const fromPipeline = profile.pipelineStage;
  const fromJourney = profile.journeyStage;

  switch (outcome) {
    case 'won':
      next.intentBoost += 4;
      next.scoreBoost += 6;
      next.priorityBoost += 5;
      next.campaignBoost += 8;
      profile.journeyStage = 'closed_won';
      profile.pipelineStage = 'won';
      profile.probability = 1;
      break;
    case 'lost':
      next.priorityBoost -= 3;
      next.scoreBoost -= 2;
      profile.journeyStage = 'closed_lost';
      profile.pipelineStage = 'lost';
      profile.probability = 0;
      break;
    case 'spam':
      next.intentBoost -= 10;
      next.scoreBoost -= 15;
      next.priorityBoost -= 12;
      profile.journeyStage = 'closed_lost';
      profile.pipelineStage = 'lost';
      profile.probability = 0;
      break;
    case 'wrong':
      next.intentBoost -= 6;
      next.campaignBoost -= 10;
      next.scoreBoost -= 8;
      profile.journeyStage = 'closed_lost';
      profile.pipelineStage = 'lost';
      profile.probability = 0;
      break;
  }

  profile.learningAdjust = next;
  profile.updatedAt = new Date().toISOString();
  profile.stageHistory = [
    ...profile.stageHistory,
    {
      at: profile.updatedAt,
      from: fromPipeline,
      to: profile.pipelineStage,
      reason: `learning:${outcome}`,
      actor: 'sales',
    },
    {
      at: profile.updatedAt,
      from: fromJourney,
      to: profile.journeyStage,
      reason: `learning_journey:${outcome}`,
      actor: 'sales',
    },
  ].slice(-30);
  profile.timeline = [
    ...profile.timeline,
    {
      at: profile.updatedAt,
      kind: 'learning',
      label: outcome,
      detail: `Sales marked ${outcome}`,
      actor: 'sales',
    },
  ].slice(-50);

  return profile;
}
