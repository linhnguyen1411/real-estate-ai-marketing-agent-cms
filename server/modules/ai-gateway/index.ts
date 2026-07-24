/**
 * H3.6 — Multi-provider AI Gateway
 * Primary Gemini → Fallback Kira → Local Qwen → Rule/Keyword
 * Business modules keep calling generateText(); gateway sits underneath.
 */

export * from './types';
export {
  gatewayChat,
  gatewayEmbeddings,
  getGatewayHealth,
  formatAiStatusBriefing,
  listGatewayProviders,
  getGatewayProvider,
  ruleKeywordFallback,
} from './gateway';
export { decideProviderOrder, resolvePreferredOrder } from './decisionEngine';
export { recordProviderCall, getProviderMetrics, isQuotaExhaustedError } from './healthMonitor';
export { GeminiProvider } from './providers/geminiProvider';
export { KiraProvider } from './providers/kiraProvider';
export { LocalProvider } from './providers/localProvider';
export { registerAiGatewayRoutes } from './api/aiGatewayRoutes';
