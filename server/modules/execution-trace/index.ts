/**
 * H0.6 — Telegram → Campaign Execution Trace
 * Compose-only. Does not touch Runtime / Fleet / Queue / Browser / Publisher.
 */

export type {
  ExecutionTrace,
  ExecutionAnalytics,
  TraceStep,
  TraceStepName,
  TraceStepStatus,
  ExecutionTraceStatus,
} from './types';

export {
  beginExecutionTrace,
  attachCampaignToTrace,
  startTraceStep,
  finishTraceStep,
  tracedStep,
  finishExecutionTrace,
  runWithTraceContext,
  getActiveTraceId,
  buildExecutionAnalytics,
  formatTraceSummaryLines,
  formatTraceTimelineLines,
  resolveTraceForQuery,
  getLatestTraceForCampaign,
  getTrace,
  listTraces,
} from './traceService';

export { registerExecutionTraceRoutes } from './api/traceRoutes';
