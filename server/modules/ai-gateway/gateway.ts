/**
 * AI Gateway — single entry for all model calls.
 * Fallback: Gemini → Kira → Local → Rule/Keyword.
 */

import { decideProviderOrder } from './decisionEngine';
import { isQuotaExhaustedError } from './healthMonitor';
import { GeminiProvider } from './providers/geminiProvider';
import { KiraProvider } from './providers/kiraProvider';
import { LocalProvider } from './providers/localProvider';
import type {
  AIProvider,
  ChatResult,
  EmbeddingResult,
  GatewayChatOptions,
  GatewayProviderId,
  ProviderHealth,
} from './types';

const providers: AIProvider[] = [
  new GeminiProvider(),
  new KiraProvider(),
  new LocalProvider(),
];

const byId = new Map(providers.map(p => [p.id, p]));

export function listGatewayProviders(): AIProvider[] {
  return [...providers];
}

export function getGatewayProvider(id: GatewayProviderId): AIProvider | undefined {
  return byId.get(id);
}

export async function getGatewayHealth(): Promise<ProviderHealth[]> {
  const rows = await Promise.all(providers.map(p => p.health()));
  return rows;
}

export function formatAiStatusBriefing(health: ProviderHealth[]): string {
  const lines = ['AI Status', ''];
  for (const h of health) {
    const statusLabel =
      h.status === 'healthy'
        ? 'Healthy'
        : h.status === 'idle'
          ? 'Idle'
          : h.status === 'degraded'
            ? 'Degraded'
            : h.status === 'unconfigured'
              ? 'Unconfigured'
              : 'Down';
    // Prefer short display names matching Telegram card
    const name = h.id === 'gemini' ? 'Gemini' : h.id === 'kira' ? 'Kira' : 'Local';
    lines.push(name);
    lines.push(statusLabel);
    if (h.quotaPercent != null) lines.push(`Quota ${Math.round(h.quotaPercent)}%`);
    else if (h.latencyMs != null) lines.push(`Latency ${h.latencyMs}ms`);
    else if (h.status === 'idle') {
      /* Idle alone is enough */
    } else if (h.avgLatencyMs != null) {
      lines.push(`Latency ${Math.round(h.avgLatencyMs)}ms`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Keyword/rule final fallback — never throws empty when allowRuleFallback */
export function ruleKeywordFallback(prompt: string, systemInstruction?: string): ChatResult {
  const hay = `${systemInstruction || ''}\n${prompt}`.toLowerCase();
  const hints: string[] = [];
  if (/mua|buyer|khách/.test(hay)) hints.push('signal:buyer_interest');
  if (/giá|budget|ngân\s*sách/.test(hay)) hints.push('signal:budget');
  if (/pháp\s*lý|sổ/.test(hay)) hints.push('signal:legal');
  if (/thuê|rent/.test(hay)) hints.push('signal:rent');
  const text = [
    'RULE_FALLBACK',
    'AI providers unavailable — keyword enrichment only.',
    hints.length ? `Detected: ${hints.join(', ')}` : 'No strong keyword signals.',
    'Continue with deterministic / rule-engine path.',
  ].join('\n');
  return {
    text,
    provider: 'local',
    model: 'rule-keyword',
    latencyMs: 0,
  };
}

export async function gatewayChat(
  systemInstruction: string,
  prompt: string,
  options: GatewayChatOptions = {},
): Promise<ChatResult> {
  const health = await getGatewayHealth();
  const decision = decideProviderOrder({
    providers,
    health,
    preferred: options.preferredProviders,
  });

  const errors: string[] = [];
  for (const id of decision.order) {
    const provider = byId.get(id);
    if (!provider) continue;
    const h = health.find(x => x.id === id);
    if (h && (h.status === 'unconfigured' || h.status === 'down')) {
      errors.push(`${id}: skip ${h.status}`);
      continue;
    }
    try {
      const result = await provider.chat({
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        timeoutMs: options.timeoutMs,
      });
      if (result.text.trim()) return result;
      errors.push(`${id}: empty`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${id}: ${msg}`);
      console.warn(`[ai-gateway] ${id} failed:`, msg.slice(0, 200));
      // On Gemini quota → continue to Kira automatically (order already encodes this)
      if (id === 'gemini' && isQuotaExhaustedError(msg)) {
        console.warn('[ai-gateway] Gemini quota exceeded → fallback Kira');
      }
    }
  }

  if (options.allowRuleFallback !== false) {
    console.warn('[ai-gateway] all providers failed → rule/keyword fallback');
    return ruleKeywordFallback(prompt, systemInstruction);
  }

  throw new Error(`AI Gateway exhausted. ${errors.join(' | ')} · decision=${decision.reason}`);
}

export async function gatewayEmbeddings(
  input: string | string[],
  preferred?: Array<string | GatewayProviderId>,
): Promise<EmbeddingResult> {
  const health = await getGatewayHealth();
  const decision = decideProviderOrder({ providers, health, preferred });
  const errors: string[] = [];
  for (const id of decision.order) {
    const provider = byId.get(id);
    if (!provider) continue;
    try {
      return await provider.embeddings({ input });
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`AI Gateway embeddings failed. ${errors.join(' | ')}`);
}
