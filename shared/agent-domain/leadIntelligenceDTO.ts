import type { ResolvedLeadIntelligence } from './resolveLeadIntelligence';
import { moneyToVndString } from './leadIntelligenceMoney';
import { mapFindingStatusToLifecycle } from './leadIntelligenceLifecycle';
import { validateLeadIntelligenceDTO } from './validateLeadIntelligence';

/**
 * List-card DTO — no full original content.
 */
export type LeadIntelligenceListDTO = {
  id: string | null;
  status: string | null;
  classification: string | null;
  intent: string | null;
  actorRole: string | null;
  score: {
    finalScore: number | null;
    scoreStatus: string | null;
    displayScoreLabel: string;
    showAsConfirmedLead: boolean;
  };
  person: { name: string; type: string };
  contact: { primaryPhone: string | null; phones: string[] };
  needSummary: string;
  budgetDisplay: string;
  locationDisplay: string | null;
  propertyTypeDisplay: string;
  shortDescription: string;
  source: {
    sourceName: string | null;
    sourceType: string | null;
    canonicalUrl: string | null;
  };
  lifecycle: {
    status: string;
    promoteAvailable: boolean;
    externalInventoryPreferred: boolean;
    matchingEnabled: boolean;
  };
  actionsAvailability: {
    promoteAvailable: boolean;
    externalInventoryPreferred: boolean;
    matchingEnabled: boolean;
  };
  warnings: string[];
};

export type LeadIntelligenceDetailDTO = {
  intelligence: ResolvedLeadIntelligence;
  originalContent: string | null;
  list: LeadIntelligenceListDTO;
  validationWarnings: string[];
};

export function toLeadIntelligenceListDTO(
  resolved: ResolvedLeadIntelligence,
  opts?: { status?: string | null; findingId?: string | null },
): LeadIntelligenceListDTO {
  const status = mapFindingStatusToLifecycle(opts?.status ?? null);
  return {
    id: opts?.findingId ?? resolved.findingId,
    status,
    classification: resolved.classification,
    intent: resolved.intent,
    actorRole: resolved.actorRole,
    score: {
      finalScore: resolved.finalScore,
      scoreStatus: resolved.scoreStatus,
      displayScoreLabel: resolved.displayScoreLabel,
      showAsConfirmedLead: resolved.showAsConfirmedLead,
    },
    person: { name: resolved.person.name, type: resolved.person.type },
    contact: {
      primaryPhone: resolved.primaryPhone,
      phones: resolved.phones,
    },
    needSummary: resolved.demand.needSummary || resolved.summary,
    budgetDisplay: resolved.displayBudgetLabel,
    locationDisplay: resolved.primaryLocation,
    propertyTypeDisplay: resolved.propertyTypes.join(', ') || '—',
    shortDescription: resolved.content.shortDescription || resolved.summary,
    source: {
      sourceName: resolved.source.sourceName,
      sourceType: resolved.source.sourceType,
      canonicalUrl: resolved.source.canonicalUrl,
    },
    lifecycle: {
      status,
      promoteAvailable: resolved.promoteAvailable,
      externalInventoryPreferred: resolved.externalInventoryPreferred,
      matchingEnabled: resolved.matchingEnabled,
    },
    actionsAvailability: {
      promoteAvailable: resolved.promoteAvailable,
      externalInventoryPreferred: resolved.externalInventoryPreferred,
      matchingEnabled: resolved.matchingEnabled,
    },
    warnings: resolved.consistencyWarnings || [],
  };
}

export function toLeadIntelligenceDetailDTO(
  resolved: ResolvedLeadIntelligence,
  opts?: { status?: string | null },
): LeadIntelligenceDetailDTO {
  const validation = validateLeadIntelligenceDTO(resolved);
  return {
    intelligence: resolved,
    originalContent: resolved.content.fullOriginalContent,
    list: toLeadIntelligenceListDTO(resolved, {
      status: opts?.status,
      findingId: resolved.findingId,
    }),
    validationWarnings: validation.warnings,
  };
}

/** Serialize money fields safely for JSON (never BigInt). */
export function serializeMoneyFields<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const key of ['budgetMin', 'budgetMax', 'askingPrice'] as const) {
    if (key in out) out[key] = moneyToVndString(out[key]);
  }
  return out as T;
}
