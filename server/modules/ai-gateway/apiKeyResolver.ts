/**
 * Resolve AI API keys: AppSettings (system config) first, then process.env.
 * Never returns masked placeholders from the settings UI.
 */

import { getSettings } from '../../dbHelper';

function looksMasked(value: string): boolean {
  return value.includes('…') || value.includes('****') || value.includes('...');
}

function fromSettings(key: 'gemini_api_key' | 'openai_api_key'): string | null {
  try {
    const settings = getSettings();
    const raw = String(settings[key] || '').trim();
    if (!raw || looksMasked(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function resolveGeminiApiKey(): string | null {
  return fromSettings('gemini_api_key') || String(process.env.GEMINI_API_KEY || '').trim() || null;
}

export function resolveOpenAiApiKey(): string | null {
  return (
    fromSettings('openai_api_key') ||
    String(process.env.KIRA_API_KEY || process.env.OPENAI_API_KEY || '').trim() ||
    null
  );
}

/** Finding AI gate: keyword → AI → create. Default ON unless explicitly disabled. */
export function isFindingAiGateEnabled(): boolean {
  try {
    const settings = getSettings();
    if (settings.finding_ai_gate_enabled === false) return false;
    return true;
  } catch {
    return true;
  }
}
