import type { WorkflowStepHandler } from './stepContract';
import { aiEnrichStep } from './aiEnrichStep';
import { classifySubjectStep } from './classifySubjectStep';
import { conditionStep } from './conditionStep';
import { dedupeStep, markIgnoredStep, stopStep } from './controlSteps';
import { createExternalInventoryCandidateStep } from './createExternalInventoryCandidateStep';
import { createLeadIntelligenceStep } from './createLeadIntelligenceStep';
import { extractStructuredDataStep } from './extractStructuredDataStep';
import { generateReplyDraftStep } from './generateReplyDraftStep';
import { matchInventoryStep } from './matchInventoryStep';
import { notifyCmsStep } from './notifyCmsStep';
import { notifyTelegramStep } from './notifyTelegramStep';
import { sentimentAnalysisStep } from './sentimentAnalysisStep';
import { spamFilterStep } from './spamFilterStep';
import { summarizeStep } from './summarizeStep';
import { topicMatchStep } from './topicMatchStep';

const ALL_HANDLERS: WorkflowStepHandler[] = [
  spamFilterStep,
  dedupeStep,
  extractStructuredDataStep,
  classifySubjectStep,
  aiEnrichStep,
  summarizeStep,
  topicMatchStep,
  sentimentAnalysisStep,
  createLeadIntelligenceStep,
  createExternalInventoryCandidateStep,
  matchInventoryStep,
  generateReplyDraftStep,
  notifyCmsStep,
  notifyTelegramStep,
  conditionStep,
  stopStep,
  markIgnoredStep,
];

export const workflowStepHandlers = new Map<string, WorkflowStepHandler>(
  ALL_HANDLERS.map(h => [h.type, h]),
);

export function registerWorkflowStepHandler(handler: WorkflowStepHandler): void {
  workflowStepHandlers.set(handler.type, handler);
}

export { ALL_HANDLERS };
