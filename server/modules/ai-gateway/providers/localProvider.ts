/**
 * Local LLM provider (Ollama / Qwen) — last model resort before rule engine.
 */

import {
  getProviderMetrics,
  inferStatus,
  recordProviderCall,
} from '../healthMonitor';
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

function endpoint(): string {
  return normalizeEndpoint(process.env.OLLAMA_ENDPOINT || 'http://localhost:11434');
}

function modelName(): string {
  return process.env.OLLAMA_MODEL || 'qwen2.5';
}

export class LocalProvider implements AIProvider {
  readonly id = 'local' as const;
  readonly label = 'Local LLM';
  readonly priority = 3;

  supportsVision(): boolean {
    return false;
  }

  cost(): ProviderCostInfo {
    return {
      currency: 'USD',
      inputPer1k: 0,
      outputPer1k: 0,
      note: 'Local / self-hosted — no API bill',
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const timeout = withTimeout(
      req.timeoutMs || Number(process.env.OLLAMA_TIMEOUT_MS || 45000),
    );
    try {
      const response = await fetch(`${endpoint()}/api/chat`, {
        method: 'POST',
        signal: timeout.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName(),
          think: false,
          messages: req.messages.map(m => ({ role: m.role, content: m.content })),
          stream: false,
          options: {
            temperature: req.temperature ?? 0.2,
            num_ctx: 8192,
            num_predict: req.maxOutputTokens || 700,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
      }
      const json = (await response.json()) as Record<string, any>;
      const text = stripThinking(json.message?.content || json.response || '');
      if (!text) throw new Error('Local LLM empty response');
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return { text, provider: this.id, model: modelName(), latencyMs };
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

  async embeddings(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const started = Date.now();
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const timeout = withTimeout(req.timeoutMs || 30000);
    try {
      const vectors: number[][] = [];
      for (const text of inputs) {
        const response = await fetch(`${endpoint()}/api/embeddings`, {
          method: 'POST',
          signal: timeout.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.OLLAMA_EMBED_MODEL || modelName(),
            prompt: text,
          }),
        });
        if (!response.ok) {
          throw new Error(`Ollama embeddings HTTP ${response.status}`);
        }
        const json = (await response.json()) as { embedding?: number[] };
        vectors.push(json.embedding || []);
      }
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return {
        vectors,
        provider: this.id,
        model: process.env.OLLAMA_EMBED_MODEL || modelName(),
        latencyMs,
      };
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
    const metrics = getProviderMetrics(this.id);
    let online = false;
    let message = 'Local LLM unreachable';
    try {
      const response = await fetch(`${endpoint()}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models = json.models || [];
      const has = models.some(
        m => m.name === modelName() || m.model === modelName() || String(m.name || '').startsWith(modelName()),
      );
      online = true;
      message = has
        ? `Ollama ready · ${modelName()}`
        : `Ollama up but model ${modelName()} missing`;
      if (!has) online = false;
    } catch (error) {
      message = `Không kết nối Ollama: ${error instanceof Error ? error.message : error}`;
    }
    const status = inferStatus({ configured: true, online, metrics });
    return {
      id: this.id,
      label: this.label,
      status: online && metrics.callsToday === 0 ? 'idle' : status,
      online,
      model: modelName(),
      endpoint: endpoint(),
      quotaPercent: null,
      latencyMs: metrics.lastLatencyMs,
      errorRate: metrics.errorRate,
      callsToday: metrics.callsToday,
      successToday: metrics.successToday,
      avgLatencyMs: metrics.avgLatencyMs,
      successRate: metrics.successRate,
      message: metrics.lastError ? `Last error: ${metrics.lastError}` : message,
      supportsVision: false,
      costPer1kTokens: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}
