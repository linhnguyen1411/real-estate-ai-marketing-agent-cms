/**
 * H3.6 AI Provider Gateway — types.
 */

export type GatewayProviderId = 'gemini' | 'kira' | 'local';

/** Legacy aiService names mapped into gateway */
export type LegacyProviderName = 'gemini' | 'openai' | 'ollama';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'down' | 'idle' | 'unconfigured';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export type ChatResult = {
  text: string;
  provider: GatewayProviderId;
  model: string;
  latencyMs: number;
};

export type EmbeddingRequest = {
  input: string | string[];
  timeoutMs?: number;
};

export type EmbeddingResult = {
  vectors: number[][];
  provider: GatewayProviderId;
  model: string;
  latencyMs: number;
};

export type ProviderHealth = {
  id: GatewayProviderId;
  label: string;
  status: ProviderHealthStatus;
  online: boolean;
  model: string;
  endpoint?: string | null;
  quotaPercent: number | null;
  latencyMs: number | null;
  errorRate: number;
  callsToday: number;
  successToday: number;
  avgLatencyMs: number | null;
  successRate: number;
  message: string;
  supportsVision: boolean;
  costPer1kTokens: number;
  updatedAt: string;
};

export type ProviderCostInfo = {
  currency: 'USD';
  inputPer1k: number;
  outputPer1k: number;
  note: string;
};

export interface AIProvider {
  readonly id: GatewayProviderId;
  readonly label: string;
  readonly priority: number;
  chat(req: ChatRequest): Promise<ChatResult>;
  embeddings(req: EmbeddingRequest): Promise<EmbeddingResult>;
  health(): Promise<ProviderHealth>;
  cost(): ProviderCostInfo;
  supportsVision(): boolean;
}

export type GatewayChatOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Prefer gateway ids or legacy names (openai→kira, ollama→local) */
  preferredProviders?: Array<GatewayProviderId | LegacyProviderName>;
  allowRuleFallback?: boolean;
};

export type GatewayDecision = {
  order: GatewayProviderId[];
  reason: string;
};

export function mapLegacyProvider(name: string): GatewayProviderId | null {
  const n = String(name || '').toLowerCase();
  if (n === 'gemini') return 'gemini';
  if (n === 'kira' || n === 'openai') return 'kira';
  if (n === 'local' || n === 'ollama') return 'local';
  return null;
}
