/**
 * Deterministic + optional LLM insights — grounded on Control Plane metrics.
 */

import { generateText } from '../../../aiService';
import { INSIGHT_SYSTEM_PROMPT, buildInsightUserPrompt } from './prompts';
import type { CopilotInsightBundle } from './ports';

function pctDelta(today: number, yesterday: number): number | null {
  if (!Number.isFinite(today) || !Number.isFinite(yesterday) || yesterday <= 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/** Rule-based insights (always available without LLM). */
export function buildRuleInsights(metrics: {
  leadsToday: number;
  leadsYesterday: number;
  leadsLocationToday?: number;
  locationLabel?: string;
  publishFailToday: number;
  publishFailYesterday: number;
  healthScore: number;
  agentsOffline: number;
  scannerNote?: string | null;
}): string[] {
  const lines: string[] = [];
  const leadDelta = pctDelta(metrics.leadsToday, metrics.leadsYesterday);
  if (leadDelta != null && Math.abs(leadDelta) >= 10) {
    const loc = metrics.locationLabel ? ` ${metrics.locationLabel}` : '';
    lines.push(
      `• Hôm nay lead${loc} ${leadDelta >= 0 ? 'tăng' : 'giảm'} ${Math.abs(leadDelta)}% so với hôm qua (${metrics.leadsToday} vs ${metrics.leadsYesterday}).`,
    );
  } else {
    lines.push(`• Lead hôm nay: ${metrics.leadsToday} (hôm qua ${metrics.leadsYesterday}).`);
  }

  if (metrics.publishFailToday > metrics.publishFailYesterday) {
    lines.push(
      `• Publish fail nhiều hơn hôm qua (${metrics.publishFailToday} vs ${metrics.publishFailYesterday}).`,
    );
  } else if (metrics.publishFailToday === 0) {
    lines.push('• Publish hôm nay chưa ghi nhận fail trong cửa sổ gần.');
  } else {
    lines.push(`• Publish fail hôm nay: ${metrics.publishFailToday}.`);
  }

  if (metrics.agentsOffline > 0) {
    lines.push(`• Có ${metrics.agentsOffline} agent offline — nên Acknowledge/Retry.`);
  }

  if (metrics.healthScore < 70) {
    lines.push(`• Health ${metrics.healthScore}/100 — dưới ngưỡng ổn định.`);
  }

  if (metrics.scannerNote) {
    lines.push(`• ${metrics.scannerNote}`);
  }

  return lines.slice(0, 6);
}

export async function enrichInsightsWithLlm(
  metrics: Record<string, unknown>,
  ruleLines: string[],
  useLlm = false,
): Promise<CopilotInsightBundle> {
  if (!useLlm) {
    return { lines: ruleLines, metrics };
  }
  try {
    const raw = await generateText(INSIGHT_SYSTEM_PROMPT, buildInsightUserPrompt(JSON.stringify(metrics)), {
      temperature: 0.2,
      maxOutputTokens: 350,
    });
    const llmLines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('•') || l.startsWith('-'))
      .map(l => (l.startsWith('•') ? l : `• ${l.replace(/^-\s*/, '')}`))
      .slice(0, 4);
    return { lines: llmLines.length ? llmLines : ruleLines, metrics };
  } catch {
    return { lines: ruleLines, metrics };
  }
}
