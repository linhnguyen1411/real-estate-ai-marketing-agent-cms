/** Re-export + legacy shape for banned heading validation */
import { BANNED_HEADING_PATTERNS } from '../ai/prompts/contentRules';
import { detectBannedHeadings as scanBannedHeadings, extractHeadings } from '../ai/prompts/boilerplateDetector';

export { extractHeadings, BANNED_HEADING_PATTERNS };

export function validateBannedHeadings(markdown: string): { passed: boolean; violations: string[] } {
  const hits = scanBannedHeadings(markdown);
  return {
    passed: hits.length === 0,
    violations: hits.map(v => v.message),
  };
}

export const detectBannedHeadings = scanBannedHeadings;
