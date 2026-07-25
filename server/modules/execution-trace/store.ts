/**
 * Persist execution traces in AppSetting (append-only, capped).
 */

import { prisma } from '../../prisma';
import type { ExecutionTrace } from './types';

const SETTING_KEY = 'execution_trace_h06';
const MAX_TRACES = 250;

type StoredState = {
  version: 'h06_trace_v1';
  traces: ExecutionTrace[];
};

async function loadState(): Promise<StoredState> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  const data = (row?.data || {}) as Partial<StoredState>;
  return {
    version: 'h06_trace_v1',
    traces: Array.isArray(data.traces) ? (data.traces as ExecutionTrace[]) : [],
  };
}

async function saveState(state: StoredState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, data: state as object },
    update: { data: state as object },
  });
}

export async function listTraces(limit = 50): Promise<ExecutionTrace[]> {
  const state = await loadState();
  return state.traces.slice(0, Math.min(100, limit));
}

export async function getTrace(traceId: string): Promise<ExecutionTrace | null> {
  const state = await loadState();
  return state.traces.find(t => t.traceId === traceId) || null;
}

export async function getLatestTraceForCampaign(campaignId: string): Promise<ExecutionTrace | null> {
  const state = await loadState();
  return state.traces.find(t => t.campaignId === campaignId) || null;
}

export async function upsertTrace(trace: ExecutionTrace): Promise<ExecutionTrace> {
  const state = await loadState();
  const idx = state.traces.findIndex(t => t.traceId === trace.traceId);
  if (idx >= 0) state.traces[idx] = trace;
  else state.traces.unshift(trace);
  state.traces = state.traces.slice(0, MAX_TRACES);
  await saveState(state);
  return trace;
}
