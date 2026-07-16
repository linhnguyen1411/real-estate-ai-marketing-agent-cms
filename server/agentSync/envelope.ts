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

/**
 * Local→VPS sync gate.
 * - Explicit false/0/no → OFF (production VPS must stay off).
 * - Otherwise ON (local workers default hard-on; env true or unset).
 */
export function isLocalSyncEnabled(): boolean {
  const raw = process.env.AGENT_LOCAL_SYNC_ENABLED?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return true;
}

export function syncIdempotencyKey(parts: string[]): string {
  return parts.map((p) => String(p || '').trim() || '_').join(':');
}
