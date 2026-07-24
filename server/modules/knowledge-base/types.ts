/**
 * H3.6.1 — Knowledge Base types
 * Does not touch Runtime / Fleet / Browser / Scheduler / Publisher / Scanner /
 * Campaign Runtime / Task Orchestrator / Lead Acquisition / Sales Layer.
 */

export type KnowledgeCategory =
  | 'buyer'
  | 'seller'
  | 'broker'
  | 'rent'
  | 'spam'
  | 'location'
  | 'property'
  | 'signal'
  | 'investor'
  | 'research'
  | 'campaign'
  | 'negative';

export type KnowledgeConcept = {
  id: string;
  category: KnowledgeCategory;
  concept: string;
  aliases: string[];
  synonyms: string[];
  weight: number;
  examples: string[];
  negativeExamples: string[];
  campaignMapping: string | null;
  enabled: boolean;
  priority: number;
  hitCount: number;
  source: 'seed' | 'admin' | 'learning' | 'import' | 'merge';
  updatedAt: string;
};

export type UnknownTerm = {
  id: string;
  term: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sampleTexts: string[];
  suggestedCategory: KnowledgeCategory | null;
  status: 'queued' | 'mapped' | 'ignored';
};

export type KnowledgeSuggestion = {
  id: string;
  term: string;
  proposedCategory: KnowledgeCategory;
  proposedConceptId: string | null;
  proposedConceptName: string;
  confidence: number;
  occurrences: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  source: 'ai_enrichment' | 'unknown_term' | 'admin' | 'lead_correction';
  createdAt: string;
  resolvedAt: string | null;
};

export type KnowledgeHealth = {
  buyerConcepts: number;
  sellerConcepts: number;
  locationAliases: number;
  propertyConcepts: number;
  unknownQueue: number;
  approvalPending: number;
  coveragePercent: number;
  totalConcepts: number;
  totalAliases: number;
  updatedAt: string;
};

export type RuleCoverageMetrics = {
  scanned: number;
  ruleMatchPercent: number;
  aiNeededPercent: number;
  discardPercent: number;
  unknownPercent: number;
  updatedAt: string;
};

export type KnowledgeSnapshot = {
  version: 'h361_kb_v1';
  concepts: KnowledgeConcept[];
  unknownTerms: UnknownTerm[];
  suggestions: KnowledgeSuggestion[];
  health: KnowledgeHealth;
  coverage: RuleCoverageMetrics;
};
