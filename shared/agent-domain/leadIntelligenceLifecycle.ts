export const LEAD_INTELLIGENCE_LIFECYCLE_STATUSES = [
  'new',
  'reviewed',
  'promoted_to_investor_lead',
  'saved_to_external_inventory',
  'dismissed',
  'duplicate',
  'archived',
] as const;

export type LeadIntelligenceLifecycleStatus =
  (typeof LEAD_INTELLIGENCE_LIFECYCLE_STATUSES)[number];

export type LeadIntelligenceLifecycle = {
  status: LeadIntelligenceLifecycleStatus | string;
  consumptionType: string | null;
  consumedAt: string | null;
  consumedBy: string | null;
  consumedResourceId: string | null;
  consumedResourceType: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  dismissReason: string | null;
};

export function mapFindingStatusToLifecycle(status: string | null | undefined): string {
  const s = String(status || 'new');
  if (s === 'promoted') return 'promoted_to_investor_lead';
  return s;
}
