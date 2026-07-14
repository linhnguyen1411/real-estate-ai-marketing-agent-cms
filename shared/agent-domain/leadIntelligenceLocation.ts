export type LeadIntelligenceLocation = {
  city: string | null;
  district: string | null;
  ward: string | null;
  street: string | null;
  project: string | null;
  normalizedLocations: string[];
  rawMentions: string[];
};
