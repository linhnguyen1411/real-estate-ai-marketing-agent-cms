/**
 * Telegram notification channel for the Desktop Agent.
 * Sends lead alerts from the user's own bot to their own chat.
 */

import type { ExtractedLeadData } from '../../shared/types';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(value: string, max: number): string {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function formatLeadMessage(lead: ExtractedLeadData): string {
  const kind =
    lead.classification === 'DEMAND'
      ? '🔴 MUA / CẦU'
      : lead.classification === 'SUPPLY'
        ? '🟢 BÁN / CUNG'
        : '⚪ CHƯA XÁC ĐỊNH';
  const heat = lead.isHotLead ? '🔥 HOT LEAD' : 'LEAD BĐS';
  const lines = [
    `<b>${heat}</b> — ${kind}`,
    `Điểm: <b>${lead.intentScore}/100</b>`,
    `Nguồn: ${escapeHtml(lead.sourceName || lead.sourceType)}`,
  ];
  if (lead.locationArea) lines.push(`Khu vực: ${escapeHtml(lead.locationArea)}`);
  if (lead.projectBlock) lines.push(`Dự án: ${escapeHtml(lead.projectBlock)}`);
  if (lead.askingPrice) lines.push(`Giá: ${escapeHtml(lead.askingPrice)}`);
  if (lead.authorName) lines.push(`Người đăng: ${escapeHtml(lead.authorName)}`);
  if (lead.authorPhone) lines.push(`SĐT: <code>${escapeHtml(lead.authorPhone)}</code>`);
  lines.push('', escapeHtml(truncate(lead.rawText, 500)));
  if (lead.sourceUrl) lines.push('', `<a href="${escapeHtml(lead.sourceUrl)}">Mở bài viết gốc</a>`);
  return lines.join('\n');
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  timeoutMs = 12_000,
): Promise<{ ok: boolean; error?: string }> {
  const token = String(config.botToken || '').trim();
  const chatId = String(config.chatId || '').trim();
  if (!token || !chatId) {
    return { ok: false, error: 'Thiếu Bot Token hoặc Chat ID.' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: body.description || `Telegram HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendLeadToTelegram(
  config: TelegramConfig,
  lead: ExtractedLeadData,
): Promise<{ ok: boolean; error?: string }> {
  if (!config.enabled) return { ok: false, error: 'Telegram đang tắt.' };
  return sendTelegramMessage(config, formatLeadMessage(lead));
}
