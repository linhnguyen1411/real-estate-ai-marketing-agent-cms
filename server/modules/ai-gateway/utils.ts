/**
 * Shared helpers for AI providers.
 */

export function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

export function stripThinking(text: string) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

export function normalizeEndpoint(endpoint: string) {
  return String(endpoint || '').replace(/\/+$/, '');
}
