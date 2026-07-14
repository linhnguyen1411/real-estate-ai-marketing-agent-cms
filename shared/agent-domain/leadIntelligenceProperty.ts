export type LeadIntelligenceProperty = {
  propertyTypes: string[];
  areaMinM2: number | null;
  areaMaxM2: number | null;
  frontageMeters: number | null;
  depthMeters: number | null;
  roadWidthMeters: number | null;
  pavementWidthMeters: number | null;
  bedrooms: number | null;
  floors: number | null;
  legalStatus: string | null;
  direction: string | null;
  features: Record<string, boolean>;
  requirements: string[];
};
