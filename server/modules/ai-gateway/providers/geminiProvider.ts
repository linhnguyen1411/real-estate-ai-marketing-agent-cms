/**
 * Gemini provider (Primary).
 */

import { GoogleGenAI } from '@google/genai';
import {
  getProviderMetrics,
  inferStatus,
  isQuotaExhaustedError,
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
import { stripThinking } from '../utils';

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function modelName() {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';
  readonly priority = 1;

  supportsVision(): boolean {
    return true;
  }

  cost(): ProviderCostInfo {
    return {
      currency: 'USD',
      inputPer1k: 0.00015,
      outputPer1k: 0.0006,
      note: 'Approx Gemini Flash pricing; verify billing console',
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const ai = client();
    if (!ai) throw new Error('GEMINI_API_KEY chưa được cấu hình.');
    const system = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const user = req.messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: modelName(),
        contents: user || req.messages.map(m => m.content).join('\n'),
        config: {
          systemInstruction: system || undefined,
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxOutputTokens,
        },
      });
      const text = stripThinking(response.text || '');
      if (!text) throw new Error('Gemini empty response');
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return { text, provider: this.id, model: modelName(), latencyMs };
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
    }
  }

  async embeddings(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const ai = client();
    if (!ai) throw new Error('GEMINI_API_KEY chưa được cấu hình.');
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const started = Date.now();
    try {
      const vectors: number[][] = [];
      for (const text of inputs) {
        const res = await ai.models.embedContent({
          model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
          contents: text,
        });
        const values =
          (res as { embeddings?: Array<{ values?: number[] }> }).embeddings?.[0]?.values ||
          (res as { embedding?: { values?: number[] } }).embedding?.values ||
          [];
        vectors.push(values);
      }
      const latencyMs = Date.now() - started;
      recordProviderCall(this.id, { ok: true, latencyMs });
      return {
        vectors,
        provider: this.id,
        model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
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
    }
  }

  async health(): Promise<ProviderHealth> {
    const configured = Boolean(process.env.GEMINI_API_KEY);
    const metrics = getProviderMetrics(this.id);
    const online = configured;
    const status = inferStatus({ configured, online, metrics });
    return {
      id: this.id,
      label: this.label,
      status,
      online,
      model: modelName(),
      endpoint: 'generativelanguage.googleapis.com',
      quotaPercent: metrics.quotaPercent,
      latencyMs: metrics.lastLatencyMs,
      errorRate: metrics.errorRate,
      callsToday: metrics.callsToday,
      successToday: metrics.successToday,
      avgLatencyMs: metrics.avgLatencyMs,
      successRate: metrics.successRate,
      message: !configured
        ? 'Thiếu GEMINI_API_KEY'
        : metrics.lastError
          ? `Last error: ${metrics.lastError}`
          : status === 'idle'
            ? 'Configured · idle'
            : 'Gemini ready',
      supportsVision: true,
      costPer1kTokens: this.cost().inputPer1k,
      updatedAt: new Date().toISOString(),
    };
  }
}
