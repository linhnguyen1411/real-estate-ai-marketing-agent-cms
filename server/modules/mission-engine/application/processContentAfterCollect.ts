/**
 * After collection: Mission 2.0 workflow vs legacy finding pipeline.
 */

import type { AgentJob, AgentMission, AgentSource, ScannedContent } from '@prisma/client';
import {
  processFindingForContent,
  resolveRuleSet,
  type AnalysisBudget,
  type FindingProcessResult,
} from '../../../agent-worker/services/findingRuleEngine';
import { executeContentWorkflow } from '../application/workflowExecutionService';

export type PostCollectProcessResult = {
  mode: 'workflow' | 'legacy';
  findingCreated: boolean;
  notificationCreated: boolean;
  ignoredByRule?: boolean;
  outOfDomain?: boolean;
  outOfScope?: boolean;
  analysisRan?: boolean;
  filterStage?: string;
  domainClassification?: string | null;
  workflow?: {
    stepsCompleted: number;
    stepsSkipped: number;
    stepsFailed: number;
  };
};

function missionRunIdFromJob(job: AgentJob): string | null {
  if ((job as { missionRunId?: string | null }).missionRunId) {
    return String((job as { missionRunId?: string | null }).missionRunId);
  }
  const payload = (job.payload || {}) as Record<string, unknown>;
  if (payload.missionRunId) return String(payload.missionRunId);
  return null;
}

export async function processContentAfterCollect(input: {
  content: ScannedContent;
  source: AgentSource;
  mission: AgentMission | null;
  job: AgentJob;
  title: string;
  analysisBudget?: AnalysisBudget;
}): Promise<PostCollectProcessResult> {
  const missionRunId = missionRunIdFromJob(input.job);

  if (missionRunId) {
    const result = await executeContentWorkflow({
      missionRunId,
      scannedContentId: input.content.id,
      jobId: input.job.id,
      sourceId: input.source.id,
      missionRules:
        input.mission && typeof input.mission.rules === 'object' && input.mission.rules
          ? (input.mission.rules as Record<string, unknown>)
          : {},
    });

    return {
      mode: 'workflow',
      findingCreated: result.findingsCreated > 0,
      notificationCreated: false,
      analysisRan: true,
      workflow: {
        stepsCompleted: result.stepsCompleted,
        stepsSkipped: result.stepsSkipped,
        stepsFailed: result.stepsFailed,
      },
    };
  }

  const rules = resolveRuleSet(input.source, input.mission);
  const finding: FindingProcessResult = await processFindingForContent({
    content: input.content,
    source: input.source,
    mission: input.mission,
    rules,
    title: input.title,
    analysisBudget: input.analysisBudget,
  });

  return {
    mode: 'legacy',
    findingCreated: finding.findingCreated,
    notificationCreated: finding.notificationCreated,
    ignoredByRule: finding.ignoredByRule,
    outOfDomain: finding.outOfDomain,
    outOfScope: finding.outOfScope,
    analysisRan: finding.analysisRan,
    filterStage: finding.filterStage,
    domainClassification: finding.domainClassification,
  };
}
