import { generateText, type GenerationOptions } from '../../aiService';
import { scanBoilerplate } from './boilerplateDetector';
import { assembleBlogSystemPrompt } from './assemblePrompt';
import { buildValidatorRewritePrompt } from './validatorPrompt';

export interface ContentValidationResult {
  passed: boolean;
  violations: string[];
  details: ReturnType<typeof scanBoilerplate>;
}

export function validateGeneratedContent(markdown: string, keyword = ''): ContentValidationResult {
  const details = scanBoilerplate(markdown, keyword);
  const violations = details.map(v => v.message);
  return {
    passed: violations.length === 0,
    violations,
    details,
  };
}

export async function rewriteContentForViolations(
  markdown: string,
  violations: string[],
  options?: GenerationOptions,
): Promise<string> {
  const system = assembleBlogSystemPrompt();
  const user = buildValidatorRewritePrompt({ markdown, violations });
  return generateText(system, user, { ...options, promptContext: 'editorial', temperature: 0.35 });
}

export async function validateAndPolishContent(
  markdown: string,
  keyword: string,
  options?: GenerationOptions,
  maxPasses = 2,
): Promise<{ markdown: string; validation: ContentValidationResult }> {
  let current = markdown;
  let validation = validateGeneratedContent(current, keyword);

  for (let pass = 0; pass < maxPasses && !validation.passed; pass += 1) {
    current = await rewriteContentForViolations(current, validation.violations, options);
    validation = validateGeneratedContent(current, keyword);
  }

  return { markdown: current, validation };
}
