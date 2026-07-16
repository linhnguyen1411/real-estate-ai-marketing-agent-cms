import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, requireScannedContent } from './stepHelpers';

export const aiEnrichStep: WorkflowStepHandler = {
  type: 'ai_enrich',
  async execute(ctx) {
    const priorAnalysis = findOutputByStepType(ctx, 'create_lead_intelligence');
    if (priorAnalysis?.finalScore != null || priorAnalysis?.analysisRan) {
      return {
        status: 'completed',
        output: {
          skippedAi: true,
          finalScore: priorAnalysis.finalScore,
          classification: priorAnalysis.classification,
        },
        warnings: ['AI enrich skipped — analysis already present in prior step output'],
        idempotent: true,
      };
    }

    const classifyOut = findOutputByStepType(ctx, 'classify_subject');
    const extractOut = findOutputByStepType(ctx, 'extract_structured_data');
    if (classifyOut?.classification && extractOut?.extracted) {
      return {
        status: 'completed',
        output: {
          skippedAi: true,
          classification: classifyOut.classification,
          actorRole: classifyOut.actorRole,
          enrichSource: 'deterministic_only',
        },
        warnings: ['AI enrich pass-through — deterministic extract + classify sufficient for MVP'],
      };
    }

    await requireScannedContent(ctx);
    return {
      status: 'completed',
      output: { skippedAi: true, enrichSource: 'none' },
      warnings: ['AI enrich no-op — leadAnalyzer not invoked in MVP workflow step'],
    };
  },
};
