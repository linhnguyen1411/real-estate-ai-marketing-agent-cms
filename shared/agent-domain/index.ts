/**
 * shared/agent-domain — Lead Intelligence canonical types + pure resolver.
 * Must not import React, PrismaClient, Express, Playwright, or secrets.
 */

export * from './leadIntelligence';
export * from './leadIntelligenceScore';
export * from './leadIntelligenceContact';
export * from './leadIntelligenceMoney';
export * from './leadIntelligenceLocation';
export * from './leadIntelligenceProperty';
export * from './leadIntelligenceSource';
export * from './leadIntelligenceLifecycle';
export * from './validateLeadIntelligence';
export * from './leadIntelligenceDTO';

export {
  resolveLeadIntelligence,
  resolveLeadIntelligenceFromSources,
  cleanLeadSummary,
  formatVietnamPhoneDisplay,
  formatResolvedBudget,
} from './resolveLeadIntelligence';

export type {
  FindingLike,
  ResolvedLeadIntelligence,
  LeadIntelligence,
  PersonType,
} from './resolveLeadIntelligence';
