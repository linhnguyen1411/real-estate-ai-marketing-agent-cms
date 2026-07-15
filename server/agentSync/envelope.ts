/**
 * AgentIngestionEnvelopeV1 — local→VPS sync payloads.
 */
export const AGENT_INGEST_API_VERSION = 'v1' as const;

export type AgentSyncEventType =
  | 'source_upsert'
  | 'scanned_content_upsert'
  | 'finding_upsert'
  | 'scan_completed'
  | 'scan_failed'
  | 'notification_event';

export type AgentIngestionEnvelopeV1 = {
  apiVersion: typeof AGENT_INGEST_API_VERSION;
  ingestionId: string;
  idempotencyKey: string;
  eventType: AgentSyncEventType;
  companyId: string | null;
  localWorkerId: string | null;
  sourceKey: string | null;
  capturedAt: string;
  parserVersion?: string | null;
  analysisVersion?: string | null;
  payload: Record<string, unknown>;
};

/** Hard-on: local→VPS sync is always enabled (env flag ignored). */
export function isLocalSyncEnabled(): boolean {
  return true;
}

export function syncIdempotencyKey(parts: string[]): string {
  return parts.map((p) => String(p || '').trim() || '_').join(':');
}
