/**
 * H0.6 — Telegram → Campaign Execution Trace
 * Compose-only. Does not touch Runtime / Fleet / Queue / Browser / Publisher.
 */

export type TraceStepStatus = 'running' | 'ok' | 'failed' | 'skipped';

export type TraceStepName =
  | 'Intent Parser'
  | 'Copilot'
  | 'Campaign Planner'
  | 'Research'
  | 'Mission Planner'
  | 'Keyword Generator'
  | 'Content Planner'
  | 'Decision'
  | 'Campaign Created'
  | 'Waiting Approval'
  | 'Response Telegram';

export type TraceStep = {
  step: TraceStepName | string;
  status: TraceStepStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary: string;
  metadata?: Record<string, unknown>;
  errorReason?: string;
  retry?: number;
};

export type ExecutionTraceStatus = 'running' | 'completed' | 'failed' | 'waiting_approval';

export type ExecutionTrace = {
  version: 'h06_trace_v1';
  traceId: string;
  sessionId: string;
  telegramChatId: string | null;
  telegramUserId: string | null;
  companyId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  missionId: string | null;
  utteranceSummary: string;
  intentName: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: ExecutionTraceStatus;
  steps: TraceStep[];
};

export type ExecutionAnalytics = {
  totalTraces: number;
  completed: number;
  failed: number;
  waitingApproval: number;
  successRate: number;
  averageDurationMs: number | null;
  mostFailedStep: string | null;
  averageResearchMs: number | null;
  averageContentMs: number | null;
  averageMissionMs: number | null;
};
