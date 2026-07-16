import { prisma } from '../../../prisma';
import { processFindingForContent } from '../../../agent-worker/services/findingRuleEngine';
import type { WorkflowStepHandler } from './stepContract';
import { contentTitle, requireScannedContent } from './stepHelpers';

export const createLeadIntelligenceStep: WorkflowStepHandler = {
  type: 'create_lead_intelligence',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const mission = await prisma.agentMission.findUnique({ where: { id: ctx.missionId } });

    const result = await processFindingForContent({
      content,
      source: content.source,
      mission,
      title: contentTitle(content),
      workflow: {
        missionRunId: ctx.missionRunId,
        deferNotify: true,
        deferTelegram: true,
        deferMatching: true,
      },
    });

    if (result.ignoredByRule || result.outOfDomain || result.outOfScope) {
      return {
        status: 'skipped',
        output: {
          findingCreated: false,
          filterStage: result.filterStage,
          classification: result.classification,
          finalScore: result.finalScore ?? result.score,
          domainClassification: result.domainClassification,
        },
      };
    }

    const findingId = await resolveFindingIdFromContent(content.id);
    const finalScore = result.finalScore ?? result.score;
    return {
      status: 'completed',
      output: {
        findingCreated: result.findingCreated,
        classification: result.classification,
        finalScore,
        keywordScore: result.keywordScore,
        aiScore: result.aiScore,
        analysisRan: result.analysisRan,
        duplicate: result.duplicate,
        resourceIds: findingId ? { findingId } : undefined,
      },
      producedResources: findingId ? { findingId } : undefined,
      metrics: result.findingCreated ? { findingsCreated: 1 } : undefined,
    };
  },
};

async function resolveFindingIdFromContent(scannedContentId: string): Promise<string | null> {
  const row = await prisma.agentFinding.findFirst({
    where: { scannedContentId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}
