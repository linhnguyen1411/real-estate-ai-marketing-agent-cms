/**
 * Compile Knowledge Concepts → Decision Rules + Campaign map.
 */

import type { DecisionRule } from '../decision-center/types';
import type { KnowledgeConcept } from './types';

function categoryToRuleCategory(category: KnowledgeConcept['category']): DecisionRule['category'] {
  if (category === 'property') return 'signal';
  return category as DecisionRule['category'];
}

export function compileRulesFromKnowledge(concepts: KnowledgeConcept[]): DecisionRule[] {
  const rules: DecisionRule[] = [];
  const enabled = concepts.filter(c => c.enabled);
  for (const concept of enabled) {
    const terms = [...concept.aliases, ...concept.synonyms]
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(terms)];
    let i = 0;
    for (const term of unique) {
      rules.push({
        id: `${concept.id}__${i++}_${term.replace(/\s+/g, '_')}`,
        group: concept.concept,
        keyword: term,
        weight: concept.weight,
        category: categoryToRuleCategory(concept.category),
        enabled: true,
        priority: concept.priority,
      });
    }
  }
  return rules.sort((a, b) => a.priority - b.priority || a.keyword.localeCompare(b.keyword));
}

export function compileCampaignMapFromKnowledge(
  concepts: KnowledgeConcept[],
): Array<{ keyword: string; campaignName: string }> {
  const rows: Array<{ keyword: string; campaignName: string }> = [];
  for (const concept of concepts.filter(c => c.enabled && c.campaignMapping)) {
    const campaignName = String(concept.campaignMapping);
    for (const alias of [...concept.aliases, ...concept.synonyms]) {
      const keyword = alias.trim().toLowerCase();
      if (!keyword) continue;
      rows.push({ keyword, campaignName });
    }
  }
  // de-dupe by keyword (first wins)
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.keyword)) return false;
    seen.add(r.keyword);
    return true;
  });
}

/** All known terms for unknown-term detection */
export function collectKnownTerms(concepts: KnowledgeConcept[]): Set<string> {
  const set = new Set<string>();
  for (const c of concepts) {
    for (const t of [...c.aliases, ...c.synonyms, c.concept]) {
      const n = t.trim().toLowerCase();
      if (n) set.add(n);
    }
  }
  return set;
}
