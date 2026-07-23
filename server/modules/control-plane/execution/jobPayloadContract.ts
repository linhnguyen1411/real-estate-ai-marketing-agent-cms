/**
 * G1 — Stateless Execution Agent job payload contract.
 * Control Plane hydrates; worker only reads payload.execution.
 */

export const EXECUTION_PAYLOAD_SCHEMA = 1 as const;

export type SourceExecutionSnapshot = {
  id: string;
  companyId: string | null;
  name: string;
  type: string;
  url: string;
  status: string;
  priority: number;
  scanIntervalMinutes: number;
  config: Record<string, unknown>;
  checkpoint: unknown;
  scanMode?: string | null;
  platform?: string | null;
};

export type MissionExecutionSnapshot = {
  id: string;
  companyId: string | null;
  name: string;
  status: string;
  rules: Record<string, unknown>;
  pipeline?: unknown;
  pipelineVersion?: number | null;
};

export type MissionRunExecutionSnapshot = {
  id: string;
  missionId: string;
  companyId: string | null;
  status: string;
  pipelineSnapshot: unknown;
  pipelineHash: string | null;
  pipelineVersion: string | null;
};

export type BrowserCapabilitySnapshot = {
  browserMode: 'managed' | 'cdp';
  capabilities: string[];
  cdpRequired: boolean;
};

export type RetryPolicySnapshot = {
  maxAttempts: number;
  attempts: number;
};

export type ScanSourceExecutionBundle = {
  jobType: 'scan_source';
  source: SourceExecutionSnapshot;
  mission: MissionExecutionSnapshot | null;
  missionRun: MissionRunExecutionSnapshot | null;
  browser: BrowserCapabilitySnapshot;
  retry: RetryPolicySnapshot;
  checkpoint: unknown;
  hydratedAt: string;
};

export type PublishExecutionBundle = {
  jobType: 'publish_social';
  publishJobId: string;
  missionRunId: string | null;
  publish: {
    publishJobId: string;
    draftId: string;
    destinationId: string;
    destinationKey: string;
    body: string;
    linkUrl: string | null;
    media: Array<{ type: string; fileUrl: string; sortOrder: number }>;
    destinationConfig: Record<string, unknown>;
    dryRun: boolean;
  };
  missionRun: MissionRunExecutionSnapshot | null;
  browser: BrowserCapabilitySnapshot;
  retry: RetryPolicySnapshot;
  hydratedAt: string;
};

export type HydratedExecutionPayload = {
  schemaVersion: typeof EXECUTION_PAYLOAD_SCHEMA;
  scan?: ScanSourceExecutionBundle;
  publish?: PublishExecutionBundle;
};

export type ExecutionEvidence = {
  sourcePatches?: Array<{
    sourceId: string;
    checkpoint?: unknown;
    lastError?: string | null;
    nextScanAt?: string | null;
    lastScannedAt?: string | null;
  }>;
  publishResult?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
};

export function readHydratedExecution(payload: unknown): HydratedExecutionPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const exec = (payload as { execution?: unknown }).execution;
  if (!exec || typeof exec !== 'object') return null;
  const rec = exec as HydratedExecutionPayload;
  if (rec.schemaVersion !== EXECUTION_PAYLOAD_SCHEMA) return null;
  return rec;
}
