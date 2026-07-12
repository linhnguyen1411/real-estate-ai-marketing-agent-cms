import type { Express, Request, Response } from 'express';
import { getSettings } from '../dbHelper';
import { prisma } from '../prisma';
import type { AgentRouteDeps } from '../agent/agentTypes';
import { canManageAgentConfig } from '../agent/agentDb';
import {
  encryptApiSecret,
  generateApiKeyPair,
  hashApiSecret,
  sha256Hex,
  verifyIngestHmac,
} from './hmacAuth';
import { ingestFindingBatch, ingestFindingPayload, ingestEventEnvelope, type IngestFindingPayload } from './ingestService';

const MAX_BATCH = 50;

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ status: 'error', message });
}

function isIngestEnabled(): boolean {
  return process.env.AGENT_INGEST_ENABLED?.trim().toLowerCase() === 'true';
}

function rejectAuth(res: Response, auth: { ok: false; status: number; message: string }) {
  sendError(res, auth.status, auth.message);
}

function asPayload(body: unknown): IngestFindingPayload {
  if (!body || typeof body !== 'object') return {};
  return body as IngestFindingPayload;
}

function getIdempotencyKey(req: Request, body: IngestFindingPayload): string | undefined {
  const header = String(req.header('X-Idempotency-Key') || '').trim();
  if (header) return header;
  if (body.idempotencyKey) return String(body.idempotencyKey);
  return undefined;
}

export function registerAgentIngestRoutes(app: Express, deps: AgentRouteDeps) {
  const { getAuthUser, accessDefaults } = deps;

  app.get('/api/agent-ingest/v1/health', async (req: Request, res: Response) => {
    const auth = await verifyIngestHmac(req, { requiredScope: 'findings:ingest' });
    // Also allow authenticated owner/company via session for ops checks
    if (auth.ok === false) {
      let sessionOk = false;
      try {
        const user = getAuthUser(req);
        sessionOk = Boolean(user && (user.role === 'owner' || user.role === 'company'));
      } catch {
        sessionOk = false;
      }
      if (!sessionOk) {
        rejectAuth(res, auth);
        return;
      }
    }

    const settings = getSettings();
    let dbReady = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      dbReady = false;
    }

    res.json({
      status: 'success',
      data: {
        service: 'agent-ingest',
        healthy: dbReady,
        serverTime: new Date().toISOString(),
        apiVersion: 'v1',
        maxBatchSize: MAX_BATCH,
        tenant: auth.ok === true ? auth.companyId : null,
        telegramEnabled: Boolean(settings.telegram_enabled) &&
          process.env.AGENT_TELEGRAM_ENABLED?.trim().toLowerCase() === 'true',
        ingestEnabled: process.env.AGENT_INGEST_ENABLED?.trim().toLowerCase() === 'true',
        dbReady,
      },
    });
  });

  app.post('/api/agent-ingest/v1/findings', async (req: Request, res: Response) => {
    if (!isIngestEnabled()) {
      sendError(res, 503, 'Agent ingestion disabled (AGENT_INGEST_ENABLED≠true).');
      return;
    }
    const auth = await verifyIngestHmac(req, { requiredScope: 'findings:ingest' });
    if (auth.ok === false) {
      rejectAuth(res, auth);
      return;
    }

    const body = asPayload(req.body);
    const idempotencyKey = getIdempotencyKey(req, body);
    const payload: IngestFindingPayload = {
      ...body,
      idempotencyKey: idempotencyKey || body.idempotencyKey,
    };

    const raw =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});
    const result = await ingestFindingPayload({
      companyId: auth.companyId,
      keyId: auth.keyId,
      payload,
      requestHash: sha256Hex(raw),
    });

    const httpStatus = result.status === 'error' ? 500 : 200;
    res.status(httpStatus).json({
      status: result.status === 'error' ? 'error' : 'success',
      data: result,
    });
  });

  app.post('/api/agent-ingest/v1/events', async (req: Request, res: Response) => {
    if (!isIngestEnabled()) {
      sendError(res, 503, 'Agent ingestion disabled (AGENT_INGEST_ENABLED≠true).');
      return;
    }
    const auth = await verifyIngestHmac(req, { requiredScope: 'findings:ingest' });
    if (auth.ok === false) {
      rejectAuth(res, auth);
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const result = await ingestEventEnvelope({
      companyId: auth.companyId,
      keyId: auth.keyId,
      envelope: body,
      requestHash: sha256Hex(raw),
    });
    const httpStatus = result.status === 'error' ? 500 : 200;
    res.status(httpStatus).json({
      status: result.status === 'error' ? 'error' : 'success',
      data: {
        ...result,
        accepted: result.status === 'accepted' || result.status === 'duplicate',
        remoteSourceId: result.remoteSourceId || result.sourceId,
        remoteScannedContentId: result.remoteScannedContentId || result.scannedContentId,
        remoteFindingId: result.remoteFindingId || result.findingId,
      },
    });
  });

  app.post('/api/agent-ingest/v1/events/batch', async (req: Request, res: Response) => {
    if (!isIngestEnabled()) {
      sendError(res, 503, 'Agent ingestion disabled (AGENT_INGEST_ENABLED≠true).');
      return;
    }
    const auth = await verifyIngestHmac(req, { requiredScope: 'findings:ingest' });
    if (auth.ok === false) {
      rejectAuth(res, auth);
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.events)
        ? body.events
        : Array.isArray(req.body)
          ? (req.body as unknown[])
          : [];
    if (!rawItems.length) {
      sendError(res, 400, 'Batch yêu cầu mảng items/events.');
      return;
    }
    const items = rawItems.slice(0, MAX_BATCH);
    const results = [];
    for (const item of items) {
      const envelope = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      results.push(
        await ingestEventEnvelope({
          companyId: auth.companyId,
          keyId: auth.keyId,
          envelope,
          requestHash: sha256Hex(JSON.stringify(envelope)),
        }),
      );
    }
    res.json({
      status: 'success',
      data: {
        results,
        truncated: rawItems.length > MAX_BATCH,
        maxBatchSize: MAX_BATCH,
      },
    });
  });

  app.post('/api/agent-ingest/v1/findings/batch', async (req: Request, res: Response) => {
    if (!isIngestEnabled()) {
      sendError(res, 503, 'Agent ingestion disabled (AGENT_INGEST_ENABLED≠true).');
      return;
    }
    const auth = await verifyIngestHmac(req, { requiredScope: 'findings:ingest' });
    if (auth.ok === false) {
      rejectAuth(res, auth);
      return;
    }

    const body = (req.body || {}) as { items?: unknown[]; findings?: unknown[] };
    const itemsRaw = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.findings)
        ? body.findings
        : Array.isArray(req.body)
          ? req.body
          : [];

    if (!itemsRaw.length) {
      sendError(res, 400, 'Batch yêu cầu mảng items (tối đa 50).');
      return;
    }
    if (itemsRaw.length > MAX_BATCH) {
      sendError(res, 400, `Batch tối đa ${MAX_BATCH} items.`);
      return;
    }

    const raw =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});
    const { results, truncated } = await ingestFindingBatch({
      companyId: auth.companyId,
      keyId: auth.keyId,
      items: itemsRaw.map(item => asPayload(item)),
      requestHash: sha256Hex(raw),
      maxItems: MAX_BATCH,
    });

    res.json({
      status: 'success',
      data: {
        results,
        truncated,
        maxBatchSize: MAX_BATCH,
        accepted: results.filter(r => r.status === 'accepted').length,
        duplicates: results.filter(r => r.status === 'duplicate').length,
        errors: results.filter(r => r.status === 'error').length,
      },
    });
  });

  // --- Owner credential management ---

  app.get('/api/agent/api-credentials', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!canManageAgentConfig(user)) {
        sendError(res, 403, 'Không có quyền.');
        return;
      }
      const where =
        user.role === 'owner'
          ? {}
          : { companyId: user.company_id ?? '__none__' };
      const rows = await prisma.agentApiCredential.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          companyId: true,
          keyId: true,
          name: true,
          status: true,
          scopes: true,
          allowedIps: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          revokedAt: true,
          createdBy: true,
        },
      });
      res.json({ status: 'success', data: rows });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tải được credentials.');
    }
  });

  app.post('/api/agent/api-credentials', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!canManageAgentConfig(user)) {
        sendError(res, 403, 'Không có quyền.');
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || '').trim() || 'Ingest API key';
      const defaults = accessDefaults(req, body);
      const { keyId, secret } = generateApiKeyPair();
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.map(String)
        : ['findings:ingest', 'health:write'];
      const allowedIps = Array.isArray(body.allowedIps)
        ? body.allowedIps.map(String)
        : body.allowed_ips != null && Array.isArray(body.allowed_ips)
          ? (body.allowed_ips as unknown[]).map(String)
          : null;
      const expiresAt =
        body.expiresAt || body.expires_at
          ? new Date(String(body.expiresAt || body.expires_at))
          : null;

      const row = await prisma.agentApiCredential.create({
        data: {
          companyId: user.role === 'owner'
            ? (body.companyId != null ? String(body.companyId) : defaults.company_id)
            : user.company_id,
          keyId,
          secretHash: hashApiSecret(secret),
          encryptedSecret: encryptApiSecret(secret),
          name,
          status: 'active',
          scopes,
          allowedIps: allowedIps ?? undefined,
          expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
          createdBy: user.id,
        },
      });

      res.json({
        status: 'success',
        data: {
          id: row.id,
          keyId: row.keyId,
          name: row.name,
          status: row.status,
          scopes: row.scopes,
          companyId: row.companyId,
          createdAt: row.createdAt,
          // Shown once — client must store securely
          secret,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không tạo được credential.');
    }
  });

  app.delete('/api/agent/api-credentials/:id', async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!canManageAgentConfig(user)) {
        sendError(res, 403, 'Không có quyền.');
        return;
      }
      const existing = await prisma.agentApiCredential.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        sendError(res, 404, 'Không tìm thấy credential.');
        return;
      }
      if (user.role !== 'owner' && existing.companyId !== user.company_id) {
        sendError(res, 403, 'Không có quyền.');
        return;
      }
      const updated = await prisma.agentApiCredential.update({
        where: { id: existing.id },
        data: {
          status: 'revoked',
          revokedAt: new Date(),
        },
      });
      res.json({
        status: 'success',
        data: {
          id: updated.id,
          keyId: updated.keyId,
          status: updated.status,
          revokedAt: updated.revokedAt,
        },
      });
    } catch (error: unknown) {
      sendError(res, 500, error instanceof Error ? error.message : 'Không revoke được credential.');
    }
  });
}
