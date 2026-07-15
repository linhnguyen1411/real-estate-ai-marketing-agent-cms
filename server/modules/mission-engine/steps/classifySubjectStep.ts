import { evaluateRealEstateRelevance } from '../../../agent/domainClassification';
import { normalizeClassification, normalizeActorRole } from '../../../agent/leadIntelligence';
import { detectSubjectDirection } from '../../../agent/subjectDirection';
import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, requireScannedContent } from './stepHelpers';

export const classifySubjectStep: WorkflowStepHandler = {
  type: 'classify_subject',
  async execute(ctx) {
    const content = await requireScannedContent(ctx);
    const extractOut = findOutputByStepType(ctx, 'extract_structured_data');
    const combinedText = `${content.authorName || ''}\n${content.contentText}`;
    const relevance = evaluateRealEstateRelevance(combinedText);
    const direction = detectSubjectDirection(content.contentText);

    const fromExtract =
      typeof extractOut?.classification === 'string' ? extractOut.classification : null;
    const classification = normalizeClassification(
      direction.classification || fromExtract || 'unknown',
    );
    const actorRole = normalizeActorRole(direction.actorRole);
    const domainClassification = relevance.domain.classification;

    const allowed = Array.isArray(ctx.step.config?.allowedClassifications)
      ? (ctx.step.config!.allowedClassifications as string[])
      : null;
    const allowedActors = Array.isArray(ctx.step.config?.allowedActors)
      ? (ctx.step.config!.allowedActors as string[])
      : null;

    const classOk = !allowed?.length || allowed.includes(classification);
    const actorOk =
      !allowedActors?.length ||
      allowedActors.includes(actorRole) ||
      (allowedActors.includes('demand_side') &&
        ['buyer', 'renter', 'investor'].includes(classification));

    if (!classOk || !actorOk) {
      return {
        status: 'skipped',
        output: {
          classification,
          actorRole,
          domainClassification,
          relevanceDecision: relevance.decision,
          matched: false,
        },
        warnings: ['Classification outside allowed scope'],
      };
    }

    return {
      status: 'completed',
      output: {
        classification,
        actorRole,
        intent: direction.intent,
        domainClassification,
        relevanceDecision: relevance.decision,
        confidence: direction.confidence,
        matched: true,
      },
    };
  },
};
