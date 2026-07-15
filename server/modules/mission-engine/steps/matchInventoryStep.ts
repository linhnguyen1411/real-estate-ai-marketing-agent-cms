import { prisma } from '../../../prisma';
import { matchPropertiesForLead } from '../../../agent/propertyMatchingService';
import type { WorkflowStepHandler } from './stepContract';
import { findOutputByStepType, resolveFindingId } from './stepHelpers';

export const matchInventoryStep: WorkflowStepHandler = {
  type: 'match_inventory',
  async execute(ctx) {
    const findingId = resolveFindingId(ctx);
    if (findingId) {
      const finding = await prisma.agentFinding.findUnique({
        where: { id: findingId },
        select: {
          companyId: true,
          classification: true,
          budgetMin: true,
          budgetMax: true,
          primaryLocation: true,
          propertyType: true,
          intent: true,
        },
      });
      if (!finding) {
        return {
          status: 'skipped',
          output: { matched: false, reason: 'finding_not_found' },
          warnings: ['Finding not found for match_inventory'],
        };
      }

      const budgetMin = finding.budgetMin != null ? Number(finding.budgetMin) : null;
      const budgetMax = finding.budgetMax != null ? Number(finding.budgetMax) : null;
      const result = await matchPropertiesForLead({
        companyId: finding.companyId,
        classification: finding.classification || 'buyer',
        budgetMin,
        budgetMax,
        location: finding.primaryLocation,
        propertyTypes: finding.propertyType ? [finding.propertyType] : [],
        purpose: finding.intent,
        limit: typeof ctx.step.config?.limit === 'number' ? ctx.step.config.limit : 5,
      });

      return {
        status: 'completed',
        output: {
          matched: result.items.length > 0,
          officialCount: result.items.length,
          topScore: result.items[0]?.matchScore ?? 0,
          missingReason: result.missingReason,
          itemIds: result.items.map(i => i.propertyId).slice(0, 5),
        },
        metrics: { inventoryMatches: result.items.length },
      };
    }

    const extractOut = findOutputByStepType(ctx, 'extract_structured_data');
    const classifyOut = findOutputByStepType(ctx, 'classify_subject');
    if (!extractOut?.extracted) {
      return {
        status: 'skipped',
        output: { matched: false, reason: 'no_finding_or_extract' },
        warnings: ['match_inventory skipped — no findingId or extract output'],
      };
    }

    const ext = extractOut.extracted as Record<string, unknown>;
    const location =
      typeof ext.location === 'object' && ext.location && 'primary' in ext.location
        ? String((ext.location as { primary?: string }).primary || '')
        : null;
    const propertyTypes = Array.isArray(ext.propertyTypes)
      ? (ext.propertyTypes as string[])
      : [];

    const result = await matchPropertiesForLead({
      companyId: ctx.companyId,
      classification: String(classifyOut?.classification || 'buyer'),
      budgetMin: typeof ext.budgetMin === 'number' ? ext.budgetMin : null,
      budgetMax: typeof ext.budgetMax === 'number' ? ext.budgetMax : null,
      location: location || null,
      propertyTypes,
      limit: 5,
    });

    return {
      status: 'completed',
      output: {
        matched: result.items.length > 0,
        officialCount: result.items.length,
        missingReason: result.missingReason,
      },
    };
  },
};
