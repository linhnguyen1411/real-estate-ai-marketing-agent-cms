/**
 * Kira AI — OpenAI-compatible fallback (also accepts OPENAI_* env).
 */

import {
  getProviderMetrics,
  inferStatus,
  isQuotaExhaustedError,
  recordProviderCall,
} from '../healthMonitor';
import { resolveOpenAiApiKey } from '../apiKeyResolver';
import { getSettings } from '../../../dbHelper';
import type {
  AIProvider,
  ChatRequest,
  ChatResult,
  EmbeddingRequest,
  EmbeddingResult,
  ProviderCostInfo,
  ProviderHealth,
} from '../types';
import { normalizeEndpoint, stripThinking, withTimeout } from '../utils';

function apiKey(): string | null {
  return resolveOpenAiApiKey();
}

function baseUrl(): string {
  return normalizeEndpoint(
    process.env.KIRA_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://kiraai.vn/api/v1',
  );
}

function chatModel(): string {
  try {
    const fromSettings = String(getSettings().openai_model || '').trim();
    if (fromSettings) return fromSettings;
  } catch {
    /* settings not ready */
  }
  return process.env.KIRA_MODEL || process.env.OPENAI_MODEL || 'kira-mini-1.0';
}

function embedModel(): string {
  return process.env.KIRA_EMBED_MODEL || process.env.OPENAI_EMBED_MODEL || 'kira-mini-1.0';
}

export class KiraProvider implements AIProvider {
  readonly id = 'kira' as const;
  readonly label = 'Kira AI';
  readonly priority = 2;

  supportsVision(): boolean {
    return true;
  }

  cost(): ProviderCostInfo {
    return {
      currency: 'USD',
      inputPer1k: 0.00015,
      outputPer1k: 0.0006,
      note: 'OpenAI-compatible; actual cost depends on Kira/OpenAI plan',
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const key = apiKey();
    if (!key) throw new Error('KIRA_API_KEY / OPENAI_API_KEY chưa được cấu hình.');
    const started = Date.now();
    const timeout = withTimeout(req.timeoutMs || Number(process.env.KIRA_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 60000));
    try {
      // Prefer Chat Completions (widely supported by OpenAI-compatible gateways)
      const response = await fetch(`${baseUrl()}/chat/completions`, {
        method: 'POST',
        signal: timeout.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: chatModel(),
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxOutputTokens,
          messages: req.messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const json = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        throw new Error(json.error?.message || `Kira HTTP ${response.status}`);
      }
      const text = stripThinking(
        json.choices?.[0]?.message?.content || json.output_text || '',
      );
      if (!text) throw new Error('Kira empty response');
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return { text, provider: this.id, model: chatModel(), latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const msg = error instanceof Error ? error.message : String(error);
      recordProviderCall(this.id, {
        ok: false,
        latencyMs,
        quotaHint: isQuotaExhaustedError(msg) ? 100 : null,
        error: msg,
      });
      throw error;
    } finally {
      timeout.cancel();
    }
  }

  async embeddings(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const key = apiKey();
    if (!key) throw new Error('KIRA_API_KEY / OPENAI_API_KEY chưa được cấu hình.');
    const started = Date.now();
    const timeout = withTimeout(req.timeoutMs || 30000);
    try {
      const response = await fetch(`${baseUrl()}/embeddings`, {
        method: 'POST',
        signal: timeout.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: embedModel(),
          input: req.input,
        }),
      });
      const json = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        throw new Error(json.error?.message || `Kira embeddings HTTP ${response.status}`);
      }
      const vectors = (json.data || []).map((d: { embedding: number[] }) => d.embedding);
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return { vectors, provider: this.id, model: embedModel(), latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, {
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      timeout.cancel();
    }
  }

  async health(): Promise<ProviderHealth> {
    const configured = Boolean(apiKey());
    const metrics = getProviderMetrics(this.id);
    const status = inferStatus({ configured, online: configured, metrics });
    return {
      id: this.id,
      label: this.label,
      status,
      online: configured,
      model: chatModel(),
      endpoint: baseUrl(),
      quotaPercent: metrics.quotaPercent,
      latencyMs: metrics.lastLatencyMs,
      errorRate: metrics.errorRate,
      callsToday: metrics.callsToday,
      successToday: metrics.successToday,
      avgLatencyMs: metrics.avgLatencyMs,
      successRate: metrics.successRate,
      message: !configured
        ? 'Thiếu KIRA_API_KEY / OPENAI_API_KEY'
        : metrics.lastError
          ? `Last error: ${metrics.lastError}`
          : status === 'idle'
            ? 'Configured · idle'
            : 'Kira ready',
      supportsVision: true,
      costPer1kTokens: this.cost().inputPer1k,
      updatedAt: new Date().toISOString(),
    };
  }
}
