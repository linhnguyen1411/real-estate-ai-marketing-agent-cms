import { generateText } from '../aiService';
import { detectArticleType, type ArticleType } from './categorySuggest';
import {
  assembleBlogSystemPrompt,
  assembleBlogUserPrompt,
} from '../ai/prompts/assemblePrompt';
import { validateAndPolishContent, validateGeneratedContent } from '../ai/prompts/contentValidator';
import { detectBannedHeadings } from '../ai/prompts/boilerplateDetector';

export interface AiDraftInput {
  keyword: string;
  focusProducts?: string;
  area?: string;
  goal?: string;
  audience?: string;
  tone?: string;
  usePersonalExperience?: boolean;
  internalLinks?: string[];
  cta?: string;
  articleType?: ArticleType;
  /** Retry hint when banned headings detected */
  bannedViolations?: string[];
  validationViolations?: string[];
}

function stripMarkdownFences(text: string): string {
  let out = text.trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```(?:markdown|md|yaml)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }
  return out;
}

export async function generateAiDraftMarkdown(input: AiDraftInput): Promise<{
  markdown: string;
  articleType: ArticleType;
  bannedCheck: { passed: boolean; violations: string[] };
  contentValidation: { passed: boolean; violations: string[] };
}> {
  const articleType = input.articleType || detectArticleType(`${input.keyword} ${input.goal || ''}`);
  const systemPrompt = assembleBlogSystemPrompt();
  const userPrompt = assembleBlogUserPrompt({ ...input, articleType });

  let markdown = stripMarkdownFences(
    await generateText(systemPrompt, userPrompt, {
      temperature: 0.42,
      maxOutputTokens: 8192,
      promptContext: 'editorial',
    }),
  );

  let headingViolations = detectBannedHeadings(markdown);

  if (headingViolations.length > 0 && !input.bannedViolations?.length) {
    const retry = await generateAiDraftMarkdown({
      ...input,
      articleType,
      bannedViolations: headingViolations.map(v => v.message),
    });
    return retry;
  }

  const polished = await validateAndPolishContent(markdown, input.keyword, {
    promptContext: 'editorial',
    maxOutputTokens: 8192,
  });
  markdown = polished.markdown;

  const contentValidation = validateGeneratedContent(markdown, input.keyword);
  headingViolations = detectBannedHeadings(markdown);

  if (!contentValidation.passed && !input.validationViolations?.length) {
    const retry = await generateAiDraftMarkdown({
      ...input,
      articleType,
      validationViolations: contentValidation.violations,
    });
    return retry;
  }

  return {
    markdown,
    articleType,
    bannedCheck: {
      passed: headingViolations.length === 0,
      violations: headingViolations.map(v => v.message),
    },
    contentValidation: {
      passed: contentValidation.passed,
      violations: contentValidation.violations,
    },
  };
}
