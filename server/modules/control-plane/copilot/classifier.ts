/**
 * Optional LLM classifier — falls back when rules are low confidence.
 */

import { generateText } from '../../../aiService';
import { COPILOT_SYSTEM_PROMPT, buildClassifyUserPrompt } from './prompts';
import type { ClassifiedIntent, CopilotIntentName, CopilotSlots } from './types';
import { classifyByRules } from './ruleClassifier';

const VALID = new Set<string>([
  'whats_new',
  'lead_count',
  'agents_offline',
  'retry_failed_publish',
  'pause_scanner',
  'resume_publish',
  'search_leads',
  'search_jobs',
  'search_campaigns',
  'dashboard',
  'report',
  'insight',
  'help',
  'unknown',
  'contextual_retry',
  'contextual_cancel',
]);

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export type LlmClassifyFn = (
  system: string,
  prompt: string,
) => Promise<string>;

export async function classifyWithLlm(
  text: string,
  contextSummary: string,
  llm: LlmClassifyFn = async (system, prompt) => generateText(system, prompt, {
    temperature: 0.1,
    maxOutputTokens: 400,
  }),
): Promise<ClassifiedIntent> {
  const prompt = buildClassifyUserPrompt({ text, contextSummary });
  const raw = await llm(COPILOT_SYSTEM_PROMPT, prompt);
  const obj = parseJsonObject(raw);
  if (!obj) {
    return classifyByRules(text);
  }
  const name = String(obj.name || 'unknown');
  if (!VALID.has(name)) {
    return classifyByRules(text);
  }
  const slots =
    obj.slots && typeof obj.slots === 'object' && !Array.isArray(obj.slots)
      ? (obj.slots as CopilotSlots)
      : {};
  const confidence = Number(obj.confidence);
  return {
    name: name as CopilotIntentName,
    confidence: Number.isFinite(confidence) ? confidence : 0.7,
    slots,
    source: 'llm',
  };
}

export async function classifyIntent(input: {
  text: string;
  contextSummary: string;
  useLlm?: boolean;
  llm?: LlmClassifyFn;
  minRuleConfidence?: number;
}): Promise<ClassifiedIntent> {
  const rule = classifyByRules(input.text);
  const min = input.minRuleConfidence ?? 0.75;
  if (rule.confidence >= min || !input.useLlm) {
    return rule;
  }
  try {
    return await classifyWithLlm(input.text, input.contextSummary, input.llm);
  } catch {
    return rule;
  }
}
