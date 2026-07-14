import { generateText, type GenerationOptions } from '../aiService';
import {
  mergeAnalysisMeta,
  tryParseLeadAnalysisJson,
  validateLeadAnalysis,
  type LeadAnalysisMeta,
  type LeadAnalysisResult,
} from './leadAnalysisSchema';
import {
  runLeadPrefilter,
  shouldRunLeadAnalysis,
  type LeadPrefilterResult,
} from './leadPrefilter';
import {
  buildLeadAnalyzerUserPrompt,
  LEAD_ANALYZER_SYSTEM_PROMPT,
  truncateForAnalysis,
} from './prompts/leadAnalyzerPrompt';
import { extractJsonPayload } from './leadAnalysisSchema';
import { detectSubjectDirection } from './subjectDirection';

export interface LeadAnalyzerInput {
  title: string;
  bodyText: string;
  canonicalUrl: string;
  sourceType?: string;
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  deepAnalyze?: boolean;
  prefilterMinScore?: number;
}

export interface LeadAnalyzerOptions {
  maxChars?: number;
  timeoutMs?: number;
  temperature?: number;
  skipAi?: boolean;
}

export interface LeadAnalyzerOutput {
  ran: boolean;
  analysis: LeadAnalysisResult | null;
  prefilter: LeadPrefilterResult;
  extractedData: Record<string, unknown> | null;
  meta: LeadAnalysisMeta | null;
}

export function getLeadAnalysisLimits() {
  return {
    maxChars: clampInt(process.env.AGENT_LEAD_ANALYSIS_MAX_CHARS, 1000, 12_000, 4000),
    maxPerJob: clampInt(process.env.AGENT_LEAD_ANALYSIS_MAX_PER_JOB, 1, 100, 10),
    timeoutMs: clampInt(process.env.AGENT_LEAD_ANALYSIS_TIMEOUT_MS, 10_000, 120_000, 45_000),
  };
}

export async function analyzeLeadContent(
  input: LeadAnalyzerInput,
  options: LeadAnalyzerOptions = {},
): Promise<LeadAnalyzerOutput> {
  const limits = getLeadAnalysisLimits();
  const maxChars = options.maxChars ?? limits.maxChars;

  const prefilter = runLeadPrefilter({
    title: input.title,
    bodyText: input.bodyText,
    positiveKeywords: input.positiveKeywords ?? [],
    negativeKeywords: input.negativeKeywords ?? [],
    prefilterMinScore: input.prefilterMinScore,
  });

  const deepAnalyze = input.deepAnalyze === true;
  if (!shouldRunLeadAnalysis({ prefilter, deepAnalyze })) {
    return {
      ran: false,
      analysis: null,
      prefilter,
      extractedData: null,
      meta: null,
    };
  }

  if (options.skipAi) {
    const fallback = buildDeterministicFallback(input, prefilter);
    const meta: LeadAnalysisMeta = {
      source: 'fallback',
      prefilterScore: prefilter.score,
      analyzedAt: new Date().toISOString(),
    };
    return {
      ran: true,
      analysis: fallback,
      prefilter,
      extractedData: mergeAnalysisMeta(fallback, meta),
      meta,
    };
  }

  const bodyText = truncateForAnalysis(input.bodyText, maxChars);
  const userPrompt = buildLeadAnalyzerUserPrompt({
    title: input.title,
    bodyText,
    canonicalUrl: input.canonicalUrl,
    sourceType: input.sourceType,
    positiveKeywords: input.positiveKeywords,
  });

  const generation: GenerationOptions = {
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: 1200,
    timeoutMs: options.timeoutMs ?? limits.timeoutMs,
    promptContext: 'editorial',
  };

  try {
    const raw = await generateText(LEAD_ANALYZER_SYSTEM_PROMPT, userPrompt, generation);
    const parsed = tryParseLeadAnalysisJson(raw);
    if (parsed.ok) {
      const sanitized = sanitizeAnalysisAgainstSource(parsed.data, input);
      const meta: LeadAnalysisMeta = {
        source: 'ai',
        prefilterScore: prefilter.score,
        analyzedAt: new Date().toISOString(),
      };
      return {
        ran: true,
        analysis: sanitized,
        prefilter,
        extractedData: mergeAnalysisMeta(sanitized, meta),
        meta,
      };
    }

    // Retry parse once on extracted payload variants
    const retry = tryParseLeadAnalysisJson(extractJsonPayloadLoose(raw));
    if (retry.ok) {
      const sanitized = sanitizeAnalysisAgainstSource(retry.data, input);
      const meta: LeadAnalysisMeta = {
        source: 'ai',
        prefilterScore: prefilter.score,
        analyzedAt: new Date().toISOString(),
      };
      return {
        ran: true,
        analysis: sanitized,
        prefilter,
        extractedData: mergeAnalysisMeta(sanitized, meta),
        meta,
      };
    }
  } catch (error) {
    console.warn('[lead-analyzer] AI failed, using fallback:', error instanceof Error ? error.message : error);
  }

  const fallback = buildDeterministicFallback(input, prefilter);
  const meta: LeadAnalysisMeta = {
    source: 'fallback',
    prefilterScore: prefilter.score,
    analyzedAt: new Date().toISOString(),
  };

  return {
    ran: true,
    analysis: fallback,
    prefilter,
    extractedData: mergeAnalysisMeta(fallback, meta),
    meta,
  };
}

/** Strip AI-invented contact/numbers not present in source text. */
export function sanitizeAnalysisAgainstSource(
  analysis: LeadAnalysisResult,
  input: LeadAnalyzerInput,
): LeadAnalysisResult {
  const haystack = `${input.title}\n${input.bodyText}`.toLowerCase();
  const contact = { ...analysis.contact };

  if (contact.phone && !haystack.includes(contact.phone.replace(/\s+/g, ''))) {
    delete contact.phone;
  }
  if (contact.email && !haystack.includes(contact.email.toLowerCase())) {
    delete contact.email;
  }
  if (contact.facebookUrl && !haystack.includes(contact.facebookUrl.toLowerCase())) {
    delete contact.facebookUrl;
  }

  return validateLeadAnalysis({
    ...analysis,
    contact,
  });
}

export function buildDeterministicFallback(
  input: LeadAnalyzerInput,
  prefilter: LeadPrefilterResult,
): LeadAnalysisResult {
  const haystack = `${input.title}\n${input.bodyText}`;
  const direction = detectSubjectDirection(haystack);

  let classification = direction.classification;
  let intent = direction.intent;
  let actorRole = direction.actorRole;
  let representedDemand = direction.representedDemand;
  let brokerActivity = direction.brokerActivity;
  let confidence = direction.confidence;

  if (prefilter.isHardSpam || haystack.toLowerCase().includes('spam')) {
    classification = 'spam';
    intent = 'unknown';
    actorRole = 'unknown';
    representedDemand = 'none';
    brokerActivity = 'unknown';
    confidence = 0.9;
  }

  const text = haystack.toLowerCase();
  const propertyTypes: string[] = [];
  if (text.includes('căn hộ') || text.includes('studio')) propertyTypes.push('căn hộ');
  if (text.includes('nhà phố') || text.includes('nhà ')) propertyTypes.push('nhà phố');
  if (text.includes('đất nền') || text.includes('đất ')) propertyTypes.push('đất nền');

  const region = extractRegion(text);
  const contact = extractContactFromText(input.bodyText);
  const score =
    classification === 'spam'
      ? 5
      : Math.max(prefilter.score, Math.round(confidence * 100 * 0.7));
  const shortTitle =
    classification === 'buyer'
      ? `Khách tìm mua${region ? ` tại ${region}` : ''}`
      : classification === 'renter'
        ? `Khách tìm thuê${region ? ` tại ${region}` : ''}`
        : classification === 'seller'
          ? `Bài bán${region ? ` tại ${region}` : ''}`
          : classification === 'landlord'
            ? `Bài cho thuê${region ? ` tại ${region}` : ''}`
            : classification === 'broker' && brokerActivity === 'demand_request'
              ? `Môi giới tìm hộ khách (${representedDemand})`
              : classification === 'broker'
                ? 'Bài môi giới'
                : input.title.slice(0, 90) || 'Lead signal';

  return validateLeadAnalysis({
    classification,
    intent,
    actorRole,
    representedDemand,
    brokerActivity,
    confidence,
    score,
    region,
    budgetMin: null,
    budgetMax: null,
    areaMin: null,
    areaMax: null,
    propertyTypes,
    urgency: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
    contact,
    title: shortTitle.slice(0, 90),
    summary:
      classification === 'buyer' || classification === 'renter' || classification === 'investor'
        ? `Tín hiệu phía cầu (${classification}). ${input.bodyText.slice(0, 160)}`
        : brokerActivity === 'demand_request'
          ? `Môi giới đại diện nhu cầu (${representedDemand}). Cần review thủ công.`
          : `Tín hiệu phía cung/khác (${classification}).`,
    reasons: [
      'Phân tích deterministic (fallback)',
      `classification=${classification}`,
      `actorRole=${actorRole}`,
      `brokerActivity=${brokerActivity}`,
      `representedDemand=${representedDemand}`,
      ...direction.demandSignals.slice(0, 3).map(s => `demand:${s}`),
      ...direction.supplySignals.slice(0, 3).map(s => `supply:${s}`),
      ...prefilter.reasons.slice(0, 3),
    ],
  });
}

function extractRegion(text: string): string | null {
  const regions = ['đà nẵng', 'hà nội', 'tp.hcm', 'hồ chí minh', 'sơn trà', 'ngũ hành sơn'];
  for (const region of regions) {
    if (text.includes(region)) {
      return region.replace('tp.hcm', 'TP.HCM').replace(/^./, c => c.toUpperCase());
    }
  }
  return null;
}

function extractContactFromText(text: string): LeadAnalysisResult['contact'] {
  const contact: LeadAnalysisResult['contact'] = {};
  const phoneMatch = text.match(/(?:0|\+84)\d{8,10}/);
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const fbMatch = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s]+/i);
  if (phoneMatch) contact.phone = phoneMatch[0];
  if (emailMatch) contact.email = emailMatch[0];
  if (fbMatch) contact.facebookUrl = fbMatch[0];
  return contact;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function extractJsonPayloadLoose(text: string): string {
  const base = extractJsonPayload(text);
  return base
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/'/g, '"');
}
