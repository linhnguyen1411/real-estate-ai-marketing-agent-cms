import crypto from 'crypto';
import type { AppSettings } from '../../src/types';
import {
  buildCanonicalString,
  sha256Hex,
  signCanonical,
} from '../agentIngest/hmacAuth';
import type { AgentIngestionEnvelopeV1 } from './envelope';

export type VpsPostResult = {
  ok: boolean;
  findingId?: string;
  scannedContentId?: string;
  sourceId?: string;
  status?: string;
  error?: string;
  warnings?: string[];
};

function resolveVpsBase(settings: AppSettings): string {
  return String(settings.agent_sync_vps_url || process.env.AGENT_SYNC_VPS_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function resolveVpsEventsUrl(settings: AppSettings): string {
  const base = resolveVpsBase(settings);
  if (!base) return '';
  if (base.includes('/api/agent-ingest/')) {
    try {
      const u = new URL(base);
      return `${u.origin}/api/agent-ingest/v1/events`;
    } catch {
      return '';
    }
  }
  return `${base}/api/agent-ingest/v1/events`;
}

function resolveVpsFindingsUrl(settings: AppSettings): string {
  const base = resolveVpsBase(settings);
  if (!base) return '';
  if (base.includes('/api/agent-ingest/')) return base;
  return `${base}/api/agent-ingest/v1/findings`;
}

function resolveVpsHealthUrl(settings: AppSettings): string {
  const base = resolveVpsBase(settings);
  if (!base) return '';
  if (base.includes('/api/agent-ingest/')) {
    try {
      const u = new URL(base);
      return `${u.origin}/api/agent-ingest/v1/health`;
    } catch {
      return '';
    }
  }
  return `${base}/api/agent-ingest/v1/health`;
}

async function signedFetch(
  url: string,
  method: 'GET' | 'POST',
  body: string | null,
  settings: AppSettings,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  const keyId = String(settings.agent_sync_key_id || process.env.AGENT_SYNC_KEY_ID || '').trim();
  const secret = String(settings.agent_sync_secret || process.env.AGENT_SYNC_SECRET || '').trim();
  if (!keyId || !secret) {
    throw new Error('Missing agent_sync_vps_url / key_id / secret');
  }
  const path = new URL(url).pathname;
  const bodyHash = sha256Hex(body || '');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const canonical = buildCanonicalString({
    method,
    path,
    timestamp,
    nonce,
    bodyHash,
  });
  const signature = signCanonical(secret, canonical);
  const timeoutMs = Number(settings.agent_sync_timeout_ms || 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
        'X-Agent-Key-Id': keyId,
        'X-Agent-Timestamp': timestamp,
        'X-Agent-Nonce': nonce,
        'X-Agent-Signature': signature,
        ...(body
          ? {
              'X-Idempotency-Key': (() => {
                try {
                  const parsed = JSON.parse(body) as { idempotencyKey?: string; ingestionId?: string };
                  return String(parsed.idempotencyKey || parsed.ingestionId || nonce);
                } catch {
                  return nonce;
                }
              })(),
            }
          : {}),
      },
      body: body ?? undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, json };
  } finally {
    clearTimeout(timer);
  }
}

export type VpsHealthTestResult = {
  ok: boolean;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
};

export async function testVpsConnection(settings: AppSettings): Promise<VpsHealthTestResult> {
  const url = resolveVpsHealthUrl(settings);
  const keyId = String(settings.agent_sync_key_id || process.env.AGENT_SYNC_KEY_ID || '').trim();
  const secret = String(settings.agent_sync_secret || process.env.AGENT_SYNC_SECRET || '').trim();
  if (!url || !keyId || !secret) {
    return {
      ok: false,
      error: 'Thiếu VPS URL, Key ID hoặc Secret. Hãy lưu cấu hình Đồng bộ VPS trước.',
    };
  }
  try {
    const { res, json } = await signedFetch(url, 'GET', null, settings);
    const data = (json.data || json) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof json.message === 'string' ? json.message : `VPS health HTTP ${res.status}`,
        data,
      };
    }
    const healthy = data.healthy === true || data.dbReady === true;
    return {
      ok: true,
      message: healthy
        ? `Kết nối VPS OK — ingest healthy${data.serverTime ? ` (${data.serverTime})` : ''}.`
        : 'Đã xác thực HMAC nhưng VPS báo chưa healthy (DB).',
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Prefer /events envelope; fallback to legacy /findings for old outbox payloads.
 */
export async function postEnvelopeToVps(
  envelope: AgentIngestionEnvelopeV1 | Record<string, unknown>,
  settings: AppSettings,
): Promise<VpsPostResult> {
  const eventsUrl = resolveVpsEventsUrl(settings);
  const findingsUrl = resolveVpsFindingsUrl(settings);
  const isEnvelope =
    envelope &&
    typeof envelope === 'object' &&
    'eventType' in envelope &&
    'apiVersion' in envelope;

  const url = isEnvelope ? eventsUrl : findingsUrl;
  if (!url) {
    return { ok: false, error: 'Missing agent_sync_vps_url / key_id / secret' };
  }

  const body = JSON.stringify(envelope);
  try {
    const { res, json } = await signedFetch(url, 'POST', body, settings);
    const data = (json.data || json) as Record<string, unknown>;
    if (!res.ok) {
      // Fallback: if events endpoint missing (404), try legacy findings for finding payloads
      if (res.status === 404 && isEnvelope && findingsUrl) {
        const legacy = toLegacyFindingPayload(envelope as AgentIngestionEnvelopeV1);
        if (legacy) {
          return postEnvelopeToVps(legacy, settings);
        }
      }
      return {
        ok: false,
        error:
          typeof json.message === 'string'
            ? json.message
            : `VPS HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      findingId: data.findingId != null ? String(data.findingId) : undefined,
      scannedContentId:
        data.scannedContentId != null
          ? String(data.scannedContentId)
          : data.remoteScannedContentId != null
            ? String(data.remoteScannedContentId)
            : undefined,
      sourceId:
        data.sourceId != null
          ? String(data.sourceId)
          : data.remoteSourceId != null
            ? String(data.remoteSourceId)
            : undefined,
      status: data.status != null ? String(data.status) : undefined,
      warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toLegacyFindingPayload(
  envelope: AgentIngestionEnvelopeV1,
): Record<string, unknown> | null {
  if (envelope.eventType !== 'finding_upsert' && envelope.eventType !== 'scanned_content_upsert') {
    return null;
  }
  const p = envelope.payload || {};
  return {
    ingestionId: envelope.ingestionId,
    idempotencyKey: envelope.idempotencyKey,
    localWorkerId: envelope.localWorkerId,
    parserVersion: envelope.parserVersion,
    analysisVersion: envelope.analysisVersion,
    capturedAt: envelope.capturedAt,
    source: p.source,
    scannedContent: p.scannedContent,
    finding: p.finding,
    intelligence: (p.finding as Record<string, unknown> | undefined)?.extractedData,
  };
}

/** @deprecated use postEnvelopeToVps */
export async function postFindingToVps(
  payload: Record<string, unknown>,
  settings: AppSettings,
): Promise<VpsPostResult> {
  return postEnvelopeToVps(payload, settings);
}
