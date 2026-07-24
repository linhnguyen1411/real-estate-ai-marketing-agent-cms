/**
 * Knowledge Base persistence (AppSetting).
 */

import { prisma } from '../../prisma';
import { DEFAULT_KNOWLEDGE_CONCEPTS } from './defaultConcepts';
import type {
  KnowledgeConcept,
  KnowledgeHealth,
  KnowledgeSuggestion,
  RuleCoverageMetrics,
  UnknownTerm,
} from './types';
import { collectKnownTerms } from './compile';

const SETTING_KEY = 'knowledge_base_h361';

type StoredState = {
  concepts: KnowledgeConcept[];
  unknownTerms: UnknownTerm[];
  suggestions: KnowledgeSuggestion[];
  coverageCounters: {
    scanned: number;
    ruleMatched: number;
    aiNeeded: number;
    discarded: number;
    unknownHits: number;
  };
};

function emptyCoverage() {
  return { scanned: 0, ruleMatched: 0, aiNeeded: 0, discarded: 0, unknownHits: 0 };
}

async function loadState(): Promise<StoredState> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredState>;
  return {
    concepts:
      Array.isArray(data.concepts) && data.concepts.length
        ? data.concepts
        : [...DEFAULT_KNOWLEDGE_CONCEPTS],
    unknownTerms: Array.isArray(data.unknownTerms) ? data.unknownTerms : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    coverageCounters: { ...emptyCoverage(), ...(data.coverageCounters || {}) },
  };
}

async function saveState(state: StoredState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

export async function listConcepts(): Promise<KnowledgeConcept[]> {
  return (await loadState()).concepts;
}

export async function getConcept(id: string): Promise<KnowledgeConcept | null> {
  return (await loadState()).concepts.find(c => c.id === id) || null;
}

export async function upsertConcept(concept: KnowledgeConcept): Promise<KnowledgeConcept[]> {
  const state = await loadState();
  const next = {
    ...concept,
    aliases: [...new Set(concept.aliases.map(a => a.trim()).filter(Boolean))],
    synonyms: [...new Set(concept.synonyms.map(a => a.trim()).filter(Boolean))],
    updatedAt: new Date().toISOString(),
  };
  const idx = state.concepts.findIndex(c => c.id === next.id);
  if (idx >= 0) state.concepts[idx] = next;
  else state.concepts.push(next);
  await saveState(state);
  return state.concepts;
}

export async function deleteConcept(id: string): Promise<KnowledgeConcept[]> {
  const state = await loadState();
  state.concepts = state.concepts.filter(c => c.id !== id);
  await saveState(state);
  return state.concepts;
}

export async function mergeConcepts(sourceId: string, targetId: string): Promise<KnowledgeConcept[]> {
  const state = await loadState();
  const source = state.concepts.find(c => c.id === sourceId);
  const target = state.concepts.find(c => c.id === targetId);
  if (!source || !target) throw new Error('Source or target concept not found');
  target.aliases = [...new Set([...target.aliases, ...source.aliases, ...source.synonyms])];
  target.synonyms = [...new Set([...target.synonyms, ...source.synonyms])];
  target.examples = [...new Set([...target.examples, ...source.examples])].slice(0, 40);
  target.negativeExamples = [
    ...new Set([...target.negativeExamples, ...source.negativeExamples]),
  ].slice(0, 40);
  if (!target.campaignMapping && source.campaignMapping) {
    target.campaignMapping = source.campaignMapping;
  }
  target.hitCount += source.hitCount;
  target.source = 'merge';
  target.updatedAt = new Date().toISOString();
  state.concepts = state.concepts.filter(c => c.id !== sourceId);
  await saveState(state);
  return state.concepts;
}

export async function importConcepts(concepts: KnowledgeConcept[]): Promise<KnowledgeConcept[]> {
  const state = await loadState();
  state.concepts = concepts.filter(c => c.id && c.concept);
  await saveState(state);
  return state.concepts;
}

export async function resetConceptsToDefault(): Promise<KnowledgeConcept[]> {
  const state = await loadState();
  state.concepts = DEFAULT_KNOWLEDGE_CONCEPTS.map(c => ({
    ...c,
    updatedAt: new Date().toISOString(),
  }));
  await saveState(state);
  return state.concepts;
}

export async function exportKnowledgeLibrary(): Promise<{
  concepts: KnowledgeConcept[];
  unknownTerms: UnknownTerm[];
  suggestions: KnowledgeSuggestion[];
}> {
  const state = await loadState();
  return {
    concepts: state.concepts,
    unknownTerms: state.unknownTerms,
    suggestions: state.suggestions,
  };
}

export async function listUnknownTerms(): Promise<UnknownTerm[]> {
  return (await loadState()).unknownTerms
    .filter(t => t.status === 'queued')
    .sort((a, b) => b.count - a.count);
}

export async function listSuggestions(status?: KnowledgeSuggestion['status']): Promise<KnowledgeSuggestion[]> {
  const rows = (await loadState()).suggestions;
  return status ? rows.filter(s => s.status === status) : rows;
}

export async function bumpConceptHits(conceptIds: string[]): Promise<void> {
  if (!conceptIds.length) return;
  const state = await loadState();
  const set = new Set(conceptIds);
  for (const c of state.concepts) {
    if (set.has(c.id)) {
      c.hitCount += 1;
      c.updatedAt = new Date().toISOString();
    }
  }
  await saveState(state);
}

export async function recordUnknownTerm(term: string, sampleText: string): Promise<UnknownTerm | null> {
  const cleaned = term.trim().toLowerCase();
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (/^\d+$/.test(cleaned)) return null;

  const state = await loadState();
  const known = collectKnownTerms(state.concepts);
  if (known.has(cleaned)) return null;

  const now = new Date().toISOString();
  const existing = state.unknownTerms.find(t => t.term === cleaned);
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    if (sampleText && existing.sampleTexts.length < 5) {
      existing.sampleTexts.push(sampleText.slice(0, 160));
    }
  } else {
    state.unknownTerms.unshift({
      id: `unk_${Date.now()}_${cleaned.replace(/\s+/g, '_')}`,
      term: cleaned,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      sampleTexts: sampleText ? [sampleText.slice(0, 160)] : [],
      suggestedCategory: null,
      status: 'queued',
    });
  }
  state.unknownTerms = state.unknownTerms.slice(0, 500);
  await saveState(state);
  return state.unknownTerms.find(t => t.term === cleaned) || null;
}

export async function mapUnknownTerm(input: {
  termId: string;
  category: KnowledgeConcept['category'];
  conceptId?: string | null;
  conceptName?: string;
  weight?: number;
}): Promise<{ concepts: KnowledgeConcept[]; unknownTerms: UnknownTerm[] }> {
  const state = await loadState();
  const term = state.unknownTerms.find(t => t.id === input.termId);
  if (!term) throw new Error('Unknown term not found');

  let concept =
    (input.conceptId && state.concepts.find(c => c.id === input.conceptId)) ||
    state.concepts.find(c => c.category === input.category && c.concept === input.conceptName);

  if (!concept) {
    concept = {
      id: `kb_${input.category}_${Date.now()}`,
      category: input.category,
      concept: input.conceptName || term.term,
      aliases: [term.term],
      synonyms: [],
      weight: typeof input.weight === 'number' ? input.weight : input.category === 'seller' ? -40 : 25,
      examples: term.sampleTexts.slice(0, 3),
      negativeExamples: [],
      campaignMapping: null,
      enabled: true,
      priority: 50,
      hitCount: term.count,
      source: 'learning',
      updatedAt: new Date().toISOString(),
    };
    state.concepts.push(concept);
  } else if (!concept.aliases.includes(term.term) && !concept.synonyms.includes(term.term)) {
    concept.aliases.push(term.term);
    concept.source = 'learning';
    concept.updatedAt = new Date().toISOString();
  }

  term.status = 'mapped';
  term.suggestedCategory = input.category;
  await saveState(state);
  return { concepts: state.concepts, unknownTerms: state.unknownTerms.filter(t => t.status === 'queued') };
}

export async function ignoreUnknownTerm(termId: string): Promise<UnknownTerm[]> {
  const state = await loadState();
  const term = state.unknownTerms.find(t => t.id === termId);
  if (term) term.status = 'ignored';
  await saveState(state);
  return state.unknownTerms.filter(t => t.status === 'queued');
}

export async function addSuggestion(
  suggestion: Omit<KnowledgeSuggestion, 'id' | 'createdAt' | 'resolvedAt' | 'status'> & {
    status?: KnowledgeSuggestion['status'];
  },
): Promise<KnowledgeSuggestion> {
  const state = await loadState();
  const existing = state.suggestions.find(
    s =>
      s.status === 'pending' &&
      s.term === suggestion.term &&
      s.proposedCategory === suggestion.proposedCategory,
  );
  if (existing) {
    existing.occurrences = Math.max(existing.occurrences, suggestion.occurrences);
    existing.confidence = Math.max(existing.confidence, suggestion.confidence);
    await saveState(state);
    return existing;
  }
  const row: KnowledgeSuggestion = {
    id: `sug_${Date.now()}`,
    term: suggestion.term,
    proposedCategory: suggestion.proposedCategory,
    proposedConceptId: suggestion.proposedConceptId,
    proposedConceptName: suggestion.proposedConceptName,
    confidence: suggestion.confidence,
    occurrences: suggestion.occurrences,
    reason: suggestion.reason,
    status: suggestion.status || 'pending',
    source: suggestion.source,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  state.suggestions.unshift(row);
  state.suggestions = state.suggestions.slice(0, 300);
  await saveState(state);
  return row;
}

export async function resolveSuggestion(
  id: string,
  action: 'approve' | 'reject',
): Promise<KnowledgeSuggestion> {
  const state = await loadState();
  const row = state.suggestions.find(s => s.id === id);
  if (!row) throw new Error('Suggestion not found');
  if (row.status !== 'pending') return row;

  if (action === 'approve') {
    let concept =
      (row.proposedConceptId && state.concepts.find(c => c.id === row.proposedConceptId)) ||
      state.concepts.find(c => c.concept === row.proposedConceptName && c.category === row.proposedCategory);
    if (!concept) {
      concept = {
        id: `kb_${row.proposedCategory}_${Date.now()}`,
        category: row.proposedCategory,
        concept: row.proposedConceptName,
        aliases: [row.term],
        synonyms: [],
        weight: row.proposedCategory === 'seller' || row.proposedCategory === 'spam' ? -40 : 28,
        examples: [],
        negativeExamples: [],
        campaignMapping: null,
        enabled: true,
        priority: 45,
        hitCount: row.occurrences,
        source: 'learning',
        updatedAt: new Date().toISOString(),
      };
      state.concepts.push(concept);
    } else if (!concept.aliases.includes(row.term) && !concept.synonyms.includes(row.term)) {
      concept.synonyms.push(row.term);
      concept.updatedAt = new Date().toISOString();
      concept.source = 'learning';
    }
    row.status = 'approved';
  } else {
    row.status = 'rejected';
  }
  row.resolvedAt = new Date().toISOString();
  await saveState(state);
  return row;
}

export async function recordCoverageEvent(input: {
  ruleMatched: boolean;
  aiNeeded: boolean;
  discarded: boolean;
  hadUnknown: boolean;
}): Promise<void> {
  const state = await loadState();
  state.coverageCounters.scanned += 1;
  if (input.ruleMatched) state.coverageCounters.ruleMatched += 1;
  if (input.aiNeeded) state.coverageCounters.aiNeeded += 1;
  if (input.discarded) state.coverageCounters.discarded += 1;
  if (input.hadUnknown) state.coverageCounters.unknownHits += 1;
  await saveState(state);
}

export function computeHealth(state: {
  concepts: KnowledgeConcept[];
  unknownTerms: UnknownTerm[];
  suggestions: KnowledgeSuggestion[];
  coverageCounters: StoredState['coverageCounters'];
}): KnowledgeHealth {
  const concepts = state.concepts.filter(c => c.enabled);
  const locationAliases = concepts
    .filter(c => c.category === 'location')
    .reduce((n, c) => n + c.aliases.length + c.synonyms.length, 0);
  const scanned = state.coverageCounters.scanned || 0;
  const coveragePercent = scanned
    ? Math.round((state.coverageCounters.ruleMatched / scanned) * 1000) / 10
    : concepts.length
      ? 95
      : 0;
  return {
    buyerConcepts: concepts.filter(c => c.category === 'buyer').length,
    sellerConcepts: concepts.filter(c => c.category === 'seller').length,
    locationAliases,
    propertyConcepts: concepts.filter(c => c.category === 'property').length,
    unknownQueue: state.unknownTerms.filter(t => t.status === 'queued').length,
    approvalPending: state.suggestions.filter(s => s.status === 'pending').length,
    coveragePercent,
    totalConcepts: concepts.length,
    totalAliases: concepts.reduce((n, c) => n + c.aliases.length + c.synonyms.length, 0),
    updatedAt: new Date().toISOString(),
  };
}

export function computeCoverage(counters: StoredState['coverageCounters']): RuleCoverageMetrics {
  const scanned = counters.scanned || 0;
  const pct = (n: number) => (scanned ? Math.round((n / scanned) * 1000) / 10 : 0);
  return {
    scanned,
    ruleMatchPercent: pct(counters.ruleMatched),
    aiNeededPercent: pct(counters.aiNeeded),
    discardPercent: pct(counters.discarded),
    unknownPercent: pct(counters.unknownHits),
    updatedAt: new Date().toISOString(),
  };
}

export async function getKnowledgeHealth(): Promise<KnowledgeHealth> {
  const state = await loadState();
  return computeHealth(state);
}

export async function getRuleCoverage(): Promise<RuleCoverageMetrics> {
  return computeCoverage((await loadState()).coverageCounters);
}

export async function loadKnowledgeState(): Promise<StoredState> {
  return loadState();
}
