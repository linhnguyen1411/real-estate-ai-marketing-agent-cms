/**
 * Canonical Lead Intelligence classification / intent / actor enums.
 * Pure TS — no Prisma / React.
 */

export const LEAD_INTELLIGENCE_CLASSIFICATIONS = [
  'buyer',
  'renter',
  'investor',
  'seller',
  'landlord',
  'broker',
  'service',
  'discussion',
  'spam',
  'unknown',
] as const;

export const LEAD_INTELLIGENCE_INTENTS = [
  'buy',
  'rent',
  'invest',
  'sell',
  'lease_out',
  'service',
  'unknown',
] as const;

export const LEAD_INTELLIGENCE_ACTOR_ROLES = [
  'demand_side',
  'supply_side',
  'broker',
  'unknown',
] as const;

export type LeadIntelligenceClassification =
  (typeof LEAD_INTELLIGENCE_CLASSIFICATIONS)[number];
export type LeadIntelligenceIntent = (typeof LEAD_INTELLIGENCE_INTENTS)[number];
export type LeadIntelligenceActorRole = (typeof LEAD_INTELLIGENCE_ACTOR_ROLES)[number];

/** @deprecated Prefer LeadIntelligenceClassification — alias for existing backend name */
export type LeadClassification = LeadIntelligenceClassification;
/** @deprecated Prefer LeadIntelligenceIntent */
export type LeadIntent = LeadIntelligenceIntent;
/** @deprecated Prefer LeadIntelligenceActorRole */
export type ActorRole = LeadIntelligenceActorRole;

export const LEAD_CLASSIFICATIONS = LEAD_INTELLIGENCE_CLASSIFICATIONS;
export const LEAD_INTENTS = LEAD_INTELLIGENCE_INTENTS;
export const ACTOR_ROLES = LEAD_INTELLIGENCE_ACTOR_ROLES;

export const DEFAULT_TARGET_CLASSIFICATIONS: LeadIntelligenceClassification[] = [
  'buyer',
  'renter',
  'investor',
];

export const DEFAULT_EXCLUDED_CLASSIFICATIONS: LeadIntelligenceClassification[] = [
  'seller',
  'landlord',
  'broker',
  'spam',
  'discussion',
  'unknown',
];

export const INTELLIGENCE_VERSION = 'lead-intelligence@v1';

export function isLeadIntelligenceClassification(
  value: unknown,
): value is LeadIntelligenceClassification {
  return LEAD_INTELLIGENCE_CLASSIFICATIONS.includes(
    String(value || '') as LeadIntelligenceClassification,
  );
}

export function isLeadIntelligenceIntent(value: unknown): value is LeadIntelligenceIntent {
  return LEAD_INTELLIGENCE_INTENTS.includes(String(value || '') as LeadIntelligenceIntent);
}

export function isLeadIntelligenceActorRole(
  value: unknown,
): value is LeadIntelligenceActorRole {
  return LEAD_INTELLIGENCE_ACTOR_ROLES.includes(String(value || '') as LeadIntelligenceActorRole);
}

export const isLeadClassification = isLeadIntelligenceClassification;

export function normalizeClassification(value: unknown): LeadIntelligenceClassification {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return isLeadIntelligenceClassification(raw) ? raw : 'unknown';
}

export function normalizeIntent(value: unknown): LeadIntelligenceIntent {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return isLeadIntelligenceIntent(raw) ? raw : 'unknown';
}

export function normalizeActorRole(value: unknown): LeadIntelligenceActorRole {
  const raw = String(value || 'unknown').toLowerCase().trim();
  return isLeadIntelligenceActorRole(raw) ? raw : 'unknown';
}

export function actorRoleFromClassification(
  classification: LeadIntelligenceClassification,
): LeadIntelligenceActorRole {
  if (classification === 'buyer' || classification === 'renter' || classification === 'investor') {
    return 'demand_side';
  }
  if (classification === 'seller' || classification === 'landlord') return 'supply_side';
  if (classification === 'broker') return 'broker';
  return 'unknown';
}
