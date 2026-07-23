/**
 * In-memory session context — shared across channels by chatId key.
 * Swap for Redis later without changing Copilot Engine API.
 */

import type { CopilotChannel, CopilotSessionContext } from './types';

const store = new Map<string, CopilotSessionContext>();

function key(channel: CopilotChannel, chatId: string): string {
  return `${channel}:${chatId}`;
}

export function getCopilotContext(
  channel: CopilotChannel,
  chatId: string,
  userId: string,
  companyId?: string | null,
): CopilotSessionContext {
  const k = key(channel, chatId);
  const existing = store.get(k);
  if (existing) {
    existing.userId = userId;
    if (companyId !== undefined) existing.companyId = companyId;
    return existing;
  }
  const created: CopilotSessionContext = {
    channel,
    chatId,
    userId,
    companyId: companyId ?? null,
    updatedAt: new Date().toISOString(),
    lastJobIds: [],
    lastMissionIds: [],
    lastFindingIds: [],
    lastAgentIds: [],
    mutedIncidentKeys: [],
    pendingApprovalId: null,
  };
  store.set(k, created);
  return created;
}

export function touchCopilotContext(ctx: CopilotSessionContext): void {
  ctx.updatedAt = new Date().toISOString();
  store.set(key(ctx.channel, ctx.chatId), ctx);
}

export function resetCopilotContextForTests(): void {
  store.clear();
}

export function rememberJobList(ctx: CopilotSessionContext, ids: string[], label?: string): void {
  ctx.lastJobIds = ids.slice(0, 30);
  ctx.lastListLabel = label;
  touchCopilotContext(ctx);
}

export function rememberFindingList(ctx: CopilotSessionContext, ids: string[]): void {
  ctx.lastFindingIds = ids.slice(0, 30);
  touchCopilotContext(ctx);
}

export function rememberMissionList(ctx: CopilotSessionContext, ids: string[]): void {
  ctx.lastMissionIds = ids.slice(0, 30);
  touchCopilotContext(ctx);
}

export function resolveIndexedId(
  list: string[],
  indexOrId: number | string | undefined,
): string | null {
  if (indexOrId == null) return null;
  if (typeof indexOrId === 'number') {
    if (indexOrId < 1 || indexOrId > list.length) return null;
    return list[indexOrId - 1] || null;
  }
  const raw = String(indexOrId).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= list.length) return list[n - 1] || null;
  }
  const hit = list.find(id => id === raw || id.startsWith(raw));
  return hit || raw;
}
