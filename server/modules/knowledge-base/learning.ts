/**
 * Self-learning helpers — AI never auto-writes Knowledge; suggestions need Approve.
 */

import { normalizeLeadText } from '../decision-center/normalize';
import { collectKnownTerms } from './compile';
import {
  addSuggestion,
  bumpConceptHits,
  listConcepts,
  recordUnknownTerm,
  upsertConcept,
} from './store';
import type { KnowledgeCategory, KnowledgeConcept } from './types';

const STOP = new Set([
  'và',
  'của',
  'cho',
  'với',
  'các',
  'một',
  'những',
  'này',
  'khi',
  'là',
  'có',
  'không',
  'được',
  'trong',
  'để',
  'hay',
  'thì',
  'rất',
  'quá',
  'em',
  'anh',
  'chị',
  'mình',
  'bạn',
  'nhà',
  'đất', // covered by property concept as known — still allow if not in known set
]);

/** Extract candidate phrases (1–3 tokens) not in Knowledge */
export function extractUnknownCandidates(normalized: string, known: Set<string>): string[] {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let n = 2; n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (phrase.length < 2) continue;
      if (STOP.has(phrase)) continue;
      if (known.has(phrase)) continue;
      if (/^\d+$/.test(phrase)) continue;
      out.push(phrase);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

export async function observeTextForKnowledge(input: {
  text: string;
  matchedConceptIds?: string[];
}): Promise<{ unknownTerms: string[] }> {
  const concepts = await listConcepts();
  const known = collectKnownTerms(concepts);
  const normalized = normalizeLeadText(input.text);
  const unknowns = extractUnknownCandidates(normalized, known);

  if (input.matchedConceptIds?.length) {
    await bumpConceptHits(input.matchedConceptIds);
  }

  for (const term of unknowns) {
    await recordUnknownTerm(term, normalized.slice(0, 200));
  }

  // Auto-queue high-frequency slang suggestions (no AI write)
  for (const term of unknowns) {
    // light heuristic: multi-word slang often buyer/investor
    if (term.includes('hàng') || term.includes('tiền')) {
      await addSuggestion({
        term,
        proposedCategory: term.includes('ngộp') ? 'investor' : 'buyer',
        proposedConceptId: term.includes('ngộp') ? 'investor_intent' : 'buyer_intent',
        proposedConceptName: term.includes('ngộp') ? 'Investor Intent' : 'Buyer Intent',
        confidence: 0.55,
        occurrences: 1,
        reason: 'heuristic_slang_pattern',
        source: 'unknown_term',
      });
    }
  }

  return { unknownTerms: unknowns };
}

/**
 * Learning source 1 — lead correction from sales UI / control plane (does not import Sales Layer).
 * Strengthens aliases on buyer/seller concepts.
 */
export async function learnFromLeadCorrection(input: {
  text: string;
  correctedIntent: KnowledgeCategory;
  note?: string;
}): Promise<KnowledgeConcept | null> {
  const concepts = await listConcepts();
  const normalized = normalizeLeadText(input.text);
  const known = collectKnownTerms(concepts);
  const unknowns = extractUnknownCandidates(normalized, known);

  let concept =
    concepts.find(c => c.category === input.correctedIntent && c.enabled) ||
    concepts.find(c => c.category === input.correctedIntent);

  if (!concept) {
    concept = {
      id: `kb_${input.correctedIntent}_${Date.now()}`,
      category: input.correctedIntent,
      concept: `${input.correctedIntent} learned`,
      aliases: [],
      synonyms: [],
      weight: input.correctedIntent === 'seller' || input.correctedIntent === 'spam' ? -40 : 30,
      trust: 55,
      examples: [],
      negativeExamples: [],
      campaignMapping: null,
      enabled: true,
      priority: 40,
      hitCount: 0,
      source: 'learning',
      updatedAt: new Date().toISOString(),
    };
  }

  for (const term of unknowns.slice(0, 3)) {
    if (!concept.aliases.includes(term) && !concept.synonyms.includes(term)) {
      concept.synonyms.push(term);
    }
  }
  if (input.note) concept.examples = [...new Set([...concept.examples, input.note])].slice(0, 20);
  concept.hitCount += 1;
  concept.source = 'learning';
  concept.updatedAt = new Date().toISOString();
  await upsertConcept(concept);

  // False-negative / learning analytics
  try {
    const { recordFalseNegative, bumpLearningEvent } = await import('./analyticsStore');
    await bumpLearningEvent();
    for (const term of unknowns.slice(0, 3)) {
      await recordFalseNegative({
        term,
        suggestedConcept: concept.concept,
      });
    }
  } catch {
    /* ignore */
  }

  return concept;
}

/**
 * Learning source 2 — admin edited a decision rule keyword → fold into Knowledge.
 */
export async function learnFromAdminRule(input: {
  keyword: string;
  weight: number;
  category: KnowledgeCategory;
  group?: string;
}): Promise<KnowledgeConcept> {
  const concepts = await listConcepts();
  const kw = input.keyword.trim().toLowerCase();
  let concept =
    concepts.find(c => c.category === input.category && (c.concept === input.group || c.aliases.includes(kw))) ||
    concepts.find(c => c.category === input.category);

  if (!concept) {
    concept = {
      id: `kb_admin_${Date.now()}`,
      category: input.category,
      concept: input.group || input.keyword,
      aliases: [kw],
      synonyms: [],
      weight: input.weight,
      trust: 60,
      examples: [],
      negativeExamples: [],
      campaignMapping: null,
      enabled: true,
      priority: 50,
      hitCount: 0,
      source: 'admin',
      updatedAt: new Date().toISOString(),
    };
  } else {
    if (!concept.aliases.includes(kw) && !concept.synonyms.includes(kw)) concept.aliases.push(kw);
    concept.weight = input.weight;
    concept.source = 'admin';
    concept.updatedAt = new Date().toISOString();
  }
  await upsertConcept(concept);
  try {
    const { bumpLearningEvent } = await import('./analyticsStore');
    await bumpLearningEvent();
  } catch {
    /* ignore */
  }
  return concept;
}

/**
 * Learning source 3 — AI enrichment proposes synonym only (Waiting Approval).
 */
export async function proposeFromAiEnrichment(input: {
  term: string;
  proposedCategory: KnowledgeCategory;
  confidence?: number;
  occurrences?: number;
  conceptName?: string;
}): Promise<void> {
  const term = input.term.trim().toLowerCase();
  if (!term || term.length < 2) return;
  await addSuggestion({
    term,
    proposedCategory: input.proposedCategory,
    proposedConceptId: null,
    proposedConceptName: input.conceptName || `${input.proposedCategory} Intent`,
    confidence: input.confidence ?? 0.7,
    occurrences: input.occurrences ?? 1,
    reason: 'ai_enrichment_proposal',
    source: 'ai_enrichment',
  });
}
