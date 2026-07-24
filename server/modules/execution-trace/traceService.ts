/**
 * Execution Trace service — begin/step/finish + analytics + Telegram format.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getLatestTraceForCampaign, getTrace, listTraces, upsertTrace } from './store';
import type {
  ExecutionAnalytics,
  ExecutionTrace,
  ExecutionTraceStatus,
  TraceStep,
  TraceStepName,
  TraceStepStatus,
} from './types';

const als = new AsyncLocalStorage<{ traceId: string }>();

function nowIso() {
  return new Date().toISOString();
}

function summarizeUtterance(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(empty)';
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function getActiveTraceId(): string | null {
  return als.getStore()?.traceId || null;
}

export async function runWithTraceContext<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ traceId }, fn);
}

export async function beginExecutionTrace(input: {
  utterance: string;
  intentName?: string | null;
  sessionId?: string | null;
  telegramChatId?: string | null;
  telegramUserId?: string | null;
  companyId?: string | null;
}): Promise<ExecutionTrace> {
  const trace: ExecutionTrace = {
    version: 'h06_trace_v1',
    traceId: `tr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    sessionId: input.sessionId || `sess_${Date.now().toString(36)}`,
    telegramChatId: input.telegramChatId || null,
    telegramUserId: input.telegramUserId || null,
    companyId: input.companyId || null,
    campaignId: null,
    campaignName: null,
    missionId: null,
    utteranceSummary: summarizeUtterance(input.utterance),
    intentName: input.intentName || null,
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: null,
    status: 'running',
    steps: [],
  };
  await upsertTrace(trace);
  return trace;
}

async function mutate(traceId: string, fn: (t: ExecutionTrace) => void): Promise<ExecutionTrace | null> {
  const t = await getTrace(traceId);
  if (!t) return null;
  fn(t);
  await upsertTrace(t);
  return t;
}

export async function attachCampaignToTrace(
  traceId: string,
  input: { campaignId: string; campaignName: string; missionId?: string | null },
): Promise<void> {
  await mutate(traceId, t => {
    t.campaignId = input.campaignId;
    t.campaignName = input.campaignName;
    if (input.missionId) t.missionId = input.missionId;
  });
}

export async function startTraceStep(
  traceId: string,
  step: TraceStepName | string,
  summary = 'started',
  metadata?: Record<string, unknown>,
): Promise<void> {
  await mutate(traceId, t => {
    t.steps.push({
      step,
      status: 'running',
      startedAt: nowIso(),
      summary,
      metadata,
    });
  });
}

export async function finishTraceStep(
  traceId: string,
  step: TraceStepName | string,
  input: {
    status: TraceStepStatus;
    summary: string;
    metadata?: Record<string, unknown>;
    errorReason?: string;
    retry?: number;
  },
): Promise<void> {
  await mutate(traceId, t => {
    const existing = [...t.steps].reverse().find(s => s.step === step && s.status === 'running');
    const finishedAt = nowIso();
    if (existing) {
      existing.status = input.status;
      existing.finishedAt = finishedAt;
      existing.durationMs = Math.max(
        0,
        new Date(finishedAt).getTime() - new Date(existing.startedAt).getTime(),
      );
      existing.summary = input.summary;
      if (input.metadata) existing.metadata = { ...(existing.metadata || {}), ...input.metadata };
      if (input.errorReason) existing.errorReason = input.errorReason;
      if (input.retry != null) existing.retry = input.retry;
    } else {
      t.steps.push({
        step,
        status: input.status,
        startedAt: finishedAt,
        finishedAt,
        durationMs: 0,
        summary: input.summary,
        metadata: input.metadata,
        errorReason: input.errorReason,
        retry: input.retry,
      });
    }
  });
}

/** Timed step helper — records start/end + duration. */
export async function tracedStep<T>(
  step: TraceStepName | string,
  work: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<T> {
  const traceId = getActiveTraceId();
  if (!traceId) return work();
  await startTraceStep(traceId, step);
  try {
    const result = await work();
    await finishTraceStep(traceId, step, { status: 'ok', summary: summarize(result) });
    return result;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'failed';
    await finishTraceStep(traceId, step, {
      status: 'failed',
      summary: reason,
      errorReason: reason,
    });
    throw error;
  }
}

export async function finishExecutionTrace(
  traceId: string,
  status: ExecutionTraceStatus,
): Promise<ExecutionTrace | null> {
  return mutate(traceId, t => {
    t.status = status;
    t.finishedAt = nowIso();
    t.durationMs = Math.max(0, new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime());
  });
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export async function buildExecutionAnalytics(): Promise<ExecutionAnalytics> {
  const traces = await listTraces(200);
  const completed = traces.filter(t => t.status === 'completed' || t.status === 'waiting_approval');
  const failed = traces.filter(t => t.status === 'failed');
  const waiting = traces.filter(t => t.status === 'waiting_approval');
  const durations = traces.map(t => t.durationMs).filter((n): n is number => n != null && n >= 0);

  const failCounts = new Map<string, number>();
  const researchMs: number[] = [];
  const contentMs: number[] = [];
  const missionMs: number[] = [];
  for (const t of traces) {
    for (const s of t.steps) {
      if (s.status === 'failed') failCounts.set(s.step, (failCounts.get(s.step) || 0) + 1);
      if (s.durationMs == null) continue;
      if (s.step === 'Research') researchMs.push(s.durationMs);
      if (s.step === 'Content Planner') contentMs.push(s.durationMs);
      if (s.step === 'Mission Planner') missionMs.push(s.durationMs);
    }
  }
  let mostFailedStep: string | null = null;
  let most = 0;
  for (const [step, n] of failCounts) {
    if (n > most) {
      most = n;
      mostFailedStep = step;
    }
  }

  const doneLike = completed.length + failed.length;
  return {
    totalTraces: traces.length,
    completed: completed.length,
    failed: failed.length,
    waitingApproval: waiting.length,
    successRate: doneLike ? Math.round((completed.length / doneLike) * 1000) / 10 : 0,
    averageDurationMs: avg(durations),
    mostFailedStep,
    averageResearchMs: avg(researchMs),
    averageContentMs: avg(contentMs),
    averageMissionMs: avg(missionMs),
  };
}

function fmtDur(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${String(rem).padStart(2, '0')}s`;
}

function stepMark(status: TraceStepStatus): string {
  if (status === 'ok') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'running') return '…';
  return '·';
}

export function formatTraceSummaryLines(trace: ExecutionTrace): string[] {
  const find = (name: string) => trace.steps.find(s => s.step === name);
  const lines = [
    'Execution Trace',
    '',
    `Campaign ${trace.campaignName || '—'}`,
    `Duration ${fmtDur(trace.durationMs)}`,
    `Status ${trace.status}`,
    '',
  ];
  for (const name of [
    'Research',
    'Mission Planner',
    'Keyword Generator',
    'Content Planner',
    'Decision',
    'Waiting Approval',
  ] as const) {
    const s = find(name);
    if (!s) {
      lines.push(`${name} ·`);
      continue;
    }
    const label =
      name === 'Waiting Approval' && s.status === 'ok'
        ? 'Waiting'
        : s.status === 'ok'
          ? '✓'
          : stepMark(s.status);
    lines.push(`${name.replace(' Planner', '').replace(' Generator', '')} ${label}`);
  }
  lines.push('');
  lines.push('Steps');
  for (const s of trace.steps) {
    lines.push(`${s.step} · ${stepMark(s.status)} · ${fmtDur(s.durationMs)} · ${s.summary}`);
  }
  return lines;
}

export function formatTraceTimelineLines(trace: ExecutionTrace): string[] {
  const lines = ['Campaign Trace', trace.campaignName || trace.traceId, ''];
  for (const s of trace.steps) {
    const t = new Date(s.startedAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    lines.push(`${t}`);
    lines.push(`${s.step} · ${stepMark(s.status)}`);
    if (s.summary) lines.push(s.summary);
    lines.push('↓');
  }
  if (lines[lines.length - 1] === '↓') lines.pop();
  return lines;
}

export async function resolveTraceForQuery(query: string): Promise<ExecutionTrace | null> {
  const q = String(query || '').trim();
  if (!q) {
    const all = await listTraces(1);
    return all[0] || null;
  }
  if (q.startsWith('tr_')) return getTrace(q);
  const byCampaign = await getLatestTraceForCampaign(q);
  if (byCampaign) return byCampaign;
  const all = await listTraces(50);
  const named = all.find(
    t =>
      (t.campaignName && t.campaignName.toLowerCase().includes(q.toLowerCase())) ||
      (t.campaignId && t.campaignId.startsWith(q)),
  );
  return named || null;
}

export {
  getLatestTraceForCampaign,
  getTrace,
  listTraces,
};

export type { TraceStep };
