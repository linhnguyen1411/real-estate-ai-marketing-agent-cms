import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { getSettings } from '../dbHelper';
import { sanitizeJsonValue } from '../agent-worker/services/contentNormalizer';
import {
  AGENT_INGEST_API_VERSION,
  isLocalSyncEnabled,
  syncIdempotencyKey,
  type AgentIngestionEnvelopeV1,
  type AgentSyncEventType,
} from './envelope';
import { scheduleAgentSyncFlush } from './outboxWorker';

type Tx = Prisma.TransactionClient;

function workerId(settings: ReturnType<typeof getSettings>): string | null {
  return String(settings.agent_sync_worker_id || process.env.AGENT_SYNC_WORKER_ID || '').trim() || null;
}

function sanitizeSourceConfig(config: unknown): Record<string, unknown> {
  const raw = sanitizeJsonValue(
    config && typeof config === 'object' ? (config as Record<string, unknown>) : {},
  ) as Record<string, unknown>;
  const blocked = new Set([
    'password',
    'cookie',
    'cookies',
    'token',
    'accessToken',
    'secret',
    'cdpEndpoint',
    'browserProfile',
    'profileDir',
    'localStorage',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (blocked.has(k) || /password|secret|token|cookie/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function resolveExternalSourceKey(source: {
  id: string;
  companyId?: string | null;
  url: string;
  externalSourceKey?: string | null;
}): string {
  if (source.externalSourceKey?.trim()) return source.externalSourceKey.trim();
  return `url:${String(source.url || '').trim().replace(/\/$/, '').toLowerCase() || source.id}`;
}

async function ensureSourceExternalKey(
  sourceId: string,
  tx: Tx = prisma,
): Promise<{
  id: string;
  companyId: string | null;
  name: string;
  type: string;
  url: string;
  status: string;
  config: unknown;
  lastScannedAt: Date | null;
  nextScanAt: Date | null;
  externalSourceKey: string;
  remoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const source = await tx.agentSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Source not found: ${sourceId}`);
  const key = resolveExternalSourceKey(source);
  if (!source.externalSourceKey) {
    try {
      await tx.agentSource.update({
        where: { id: source.id },
        data: { externalSourceKey: key },
      });
    } catch {
      // unique race — keep computed key for payload
    }
  }
  return { ...source, externalSourceKey: key };
}

async function createOutboxRow(
  tx: Tx,
  input: {
    companyId: string | null;
    eventType: AgentSyncEventType;
    entityId: string;
    ingestionId: string;
    dependencyKey?: string | null;
    envelope: AgentIngestionEnvelopeV1;
  },
): Promise<{ created: boolean; outboxId?: string }> {
  // Check first — Postgres aborts the whole interactive transaction on unique
  // violation, so we must not create-then-catch inside $transaction.
  const existing = await tx.agentSyncOutbox.findUnique({
    where: { ingestionId: input.ingestionId },
  });
  if (existing) {
    return { created: false, outboxId: existing.id };
  }

  try {
    const row = await tx.agentSyncOutbox.create({
      data: {
        companyId: input.companyId,
        ingestionId: input.ingestionId,
        eventType: input.eventType,
        entityId: input.entityId,
        dependencyKey: input.dependencyKey ?? null,
        payload: input.envelope as unknown as Prisma.InputJsonValue,
        status: 'pending',
        nextAttemptAt: new Date(),
      },
    });
    return { created: true, outboxId: row.id };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P2002') {
      // Race with another writer — treat as already enqueued (do not query on aborted tx).
      return { created: false };
    }
    throw error;
  }
}

/**
 * Sync gate used by worker + CMS. Falls back to DB AppSetting when
 * ensureDatabaseReady() has not populated the in-memory cache (worker bug).
 */
export function shouldEnqueueSync(): boolean {
  if (!isLocalSyncEnabled()) return false;
  try {
    return Boolean(getSettings().agent_sync_enabled);
  } catch {
    // Cache not ready — do not block; caller may still enqueue after async resolve
    return process.env.AGENT_SYNC_FORCE === 'true';
  }
}

export async function shouldEnqueueSyncAsync(): Promise<boolean> {
  if (!isLocalSyncEnabled()) return false;
  try {
    return Boolean(getSettings().agent_sync_enabled);
  } catch {
    const row = await prisma.appSetting.findUnique({ where: { key: 'app' } });
    const data = (row?.data || {}) as Record<string, unknown>;
    return Boolean(data.agent_sync_enabled);
  }
}

/**
 * Enqueue scanned_content_upsert (includes source snapshot). Call inside or after content write.
 */
export async function enqueueScannedContentSync(input: {
  scannedContentId: string;
  tx?: Tx;
  kickFlush?: boolean;
}): Promise<{ enqueued: boolean; reason?: string; outboxId?: string }> {
  if (!(await shouldEnqueueSyncAsync())) {
    return { enqueued: false, reason: isLocalSyncEnabled() ? 'disabled' : 'env_disabled' };
  }

  const run = async (tx: Tx) => {
    const content = await tx.scannedContent.findUnique({
      where: { id: input.scannedContentId },
    });
    if (!content) return { enqueued: false, reason: 'not_found' as const };

    const source = await ensureSourceExternalKey(content.sourceId, tx);
    const settings = getSettings();
    const syncVersion =
      content.syncVersion ||
      `c_${content.updatedAt.toISOString()}_${crypto.createHash('sha1').update(content.contentText).digest('hex').slice(0, 8)}`;

    const companyId = content.companyId ?? source.companyId;
    const idempotencyKey = syncIdempotencyKey([
      'content',
      companyId || 'none',
      source.externalSourceKey,
      content.externalId || content.normalizedContentHash || content.contentHash,
      'v1',
      syncVersion,
    ]);

    const envelope: AgentIngestionEnvelopeV1 = {
      apiVersion: AGENT_INGEST_API_VERSION,
      ingestionId: idempotencyKey,
      idempotencyKey,
      eventType: 'scanned_content_upsert',
      companyId,
      localWorkerId: workerId(settings),
      sourceKey: source.externalSourceKey,
      capturedAt: new Date().toISOString(),
      parserVersion: 'facebook-local-v1',
      analysisVersion: null,
      payload: sanitizeJsonValue({
        source: {
          localSourceId: source.id,
          externalSourceKey: source.externalSourceKey,
          remoteSourceId: source.remoteId,
          name: source.name,
          type: source.type,
          url: source.url,
          status: source.status,
          config: sanitizeSourceConfig(source.config),
          lastScannedAt: source.lastScannedAt?.toISOString() ?? null,
          nextScanAt: source.nextScanAt?.toISOString() ?? null,
          createdAt: source.createdAt.toISOString(),
          updatedAt: source.updatedAt.toISOString(),
        },
        scannedContent: {
          localScannedContentId: content.id,
          remoteId: content.remoteId,
          externalId: content.externalId,
          canonicalUrl: content.canonicalUrl,
          authorName: content.authorName,
          authorUrl: content.authorUrl,
          contentText: content.contentText,
          contentHash: content.contentHash,
          normalizedContentHash: content.normalizedContentHash,
          publishedAt: content.publishedAt?.toISOString() ?? null,
          collectedAt: content.collectedAt.toISOString(),
          status: content.status,
          rawData: content.rawData,
          metrics: content.metrics,
          dedupeVersion: content.dedupeVersion,
          syncVersion,
        },
      }) as Record<string, unknown>,
    };

    await tx.scannedContent.update({
      where: { id: content.id },
      data: {
        syncStatus: 'pending',
        syncVersion,
        syncError: null,
      },
    });

    const created = await createOutboxRow(tx, {
      companyId,
      eventType: 'scanned_content_upsert',
      entityId: content.id,
      ingestionId: idempotencyKey,
      dependencyKey: `source:${source.externalSourceKey}`,
      envelope,
    });
    return { enqueued: created.created || Boolean(created.outboxId), outboxId: created.outboxId };
  };

  try {
    const result = input.tx ? await run(input.tx) : await prisma.$transaction(run);
    if (result.enqueued && input.kickFlush !== false) scheduleAgentSyncFlush();
    return result;
  } catch (error) {
    console.warn(
      '[agent-sync] enqueueScannedContentSync failed:',
      error instanceof Error ? error.message : error,
    );
    return {
      enqueued: false,
      reason: error instanceof Error ? error.message : 'enqueue_error',
    };
  }
}

/**
 * Enqueue finding_upsert with nested source + scannedContent (atomic on VPS).
 */
export async function enqueueFindingUpsertSync(input: {
  findingId: string;
  tx?: Tx;
  kickFlush?: boolean;
}): Promise<{ enqueued: boolean; reason?: string; outboxId?: string }> {
  if (!(await shouldEnqueueSyncAsync())) {
    return { enqueued: false, reason: isLocalSyncEnabled() ? 'disabled' : 'env_disabled' };
  }

  const run = async (tx: Tx) => {
    const finding = await tx.agentFinding.findUnique({
      where: { id: input.findingId },
      include: { scannedContent: true, source: true },
    });
    if (!finding || !finding.scannedContent) {
      return { enqueued: false, reason: 'not_found' as const };
    }

    const source = await ensureSourceExternalKey(finding.sourceId, tx);
    const content = finding.scannedContent;
    const settings = getSettings();
    const syncVersion =
      finding.syncVersion ||
      `f_${finding.updatedAt.toISOString()}_${finding.finalScore ?? finding.score}`;

    const companyId = finding.companyId ?? content.companyId ?? source.companyId;
    const idempotencyKey = syncIdempotencyKey([
      'finding',
      companyId || 'none',
      finding.id,
      syncVersion,
      'v1',
    ]);

    const envelope: AgentIngestionEnvelopeV1 = {
      apiVersion: AGENT_INGEST_API_VERSION,
      ingestionId: idempotencyKey,
      idempotencyKey,
      eventType: 'finding_upsert',
      companyId,
      localWorkerId: workerId(settings),
      sourceKey: source.externalSourceKey,
      capturedAt: new Date().toISOString(),
      parserVersion: 'facebook-local-v1',
      analysisVersion: finding.intelligenceVersion,
      payload: sanitizeJsonValue({
        source: {
          localSourceId: source.id,
          externalSourceKey: source.externalSourceKey,
          remoteSourceId: source.remoteId,
          name: source.name,
          type: source.type,
          url: source.url,
          status: source.status,
          config: sanitizeSourceConfig(source.config),
          lastScannedAt: source.lastScannedAt?.toISOString() ?? null,
          nextScanAt: source.nextScanAt?.toISOString() ?? null,
          createdAt: source.createdAt.toISOString(),
          updatedAt: source.updatedAt.toISOString(),
        },
        scannedContent: {
          localScannedContentId: content.id,
          remoteId: content.remoteId,
          externalId: content.externalId,
          canonicalUrl: content.canonicalUrl,
          authorName: content.authorName,
          authorUrl: content.authorUrl,
          contentText: content.contentText,
          contentHash: content.contentHash,
          normalizedContentHash: content.normalizedContentHash,
          publishedAt: content.publishedAt?.toISOString() ?? null,
          collectedAt: content.collectedAt.toISOString(),
          status: content.status,
          rawData: content.rawData,
          metrics: content.metrics,
          dedupeVersion: content.dedupeVersion,
        },
        finding: {
          localFindingId: finding.id,
          remoteId: finding.remoteId,
          type: finding.type,
          status: finding.status,
          classification: finding.classification,
          intent: finding.intent,
          actorRole: finding.actorRole,
          priority: finding.priority,
          confidence: finding.confidence,
          keywordScore: finding.keywordScore,
          aiScore: finding.aiScore,
          leadFitScore: finding.leadFitScore,
          finalScore: finding.finalScore ?? finding.score,
          score: finding.score,
          scoreStatus: finding.scoreStatus,
          title: finding.title,
          summary: finding.summary,
          reasons: finding.reasons,
          extractedData: finding.extractedData,
          primaryPhone: finding.primaryPhone,
          personName: finding.personName,
          needSummary: finding.needSummary,
          budgetMin: finding.budgetMin != null ? finding.budgetMin.toString() : null,
          budgetMax: finding.budgetMax != null ? finding.budgetMax.toString() : null,
          askingPrice: finding.askingPrice != null ? finding.askingPrice.toString() : null,
          primaryLocation: finding.primaryLocation,
          propertyType: finding.propertyType,
          dedupeStatus: finding.dedupeStatus,
          duplicateOfFindingId: finding.duplicateOfFindingId,
          consumptionType: finding.consumptionType,
          consumedAt: finding.consumedAt?.toISOString() ?? null,
          consumedResourceId: finding.consumedResourceId,
          consumedResourceType: finding.consumedResourceType,
          createdAt: finding.createdAt.toISOString(),
          updatedAt: finding.updatedAt.toISOString(),
          syncVersion,
        },
      }) as Record<string, unknown>,
    };

    await tx.agentFinding.update({
      where: { id: finding.id },
      data: { syncStatus: 'pending', syncVersion, syncError: null },
    });
    await tx.scannedContent.update({
      where: { id: content.id },
      data: {
        syncStatus: content.syncStatus === 'synced' ? 'synced' : 'pending',
        syncError: null,
      },
    });

    const created = await createOutboxRow(tx, {
      companyId,
      eventType: 'finding_upsert',
      entityId: finding.id,
      ingestionId: idempotencyKey,
      dependencyKey: `content:${content.id}`,
      envelope,
    });
    return { enqueued: created.created || Boolean(created.outboxId), outboxId: created.outboxId };
  };

  try {
    const result = input.tx ? await run(input.tx) : await prisma.$transaction(run);
    if (result.enqueued && input.kickFlush !== false) scheduleAgentSyncFlush();
    return result;
  } catch (error) {
    console.warn(
      '[agent-sync] enqueueFindingUpsertSync failed:',
      error instanceof Error ? error.message : error,
    );
    return {
      enqueued: false,
      reason: error instanceof Error ? error.message : 'enqueue_error',
    };
  }
}

export async function enqueueScanCompletedSync(input: {
  sourceId: string;
  localJobId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  stopReason?: string | null;
  metrics?: Record<string, unknown>;
}): Promise<{ enqueued: boolean; reason?: string }> {
  if (!shouldEnqueueSync()) {
    return { enqueued: false, reason: 'disabled' };
  }
  try {
    const source = await ensureSourceExternalKey(input.sourceId);
    const settings = getSettings();
    const companyId = source.companyId;
    const completedAt = input.completedAt || new Date().toISOString();
    const idempotencyKey = syncIdempotencyKey([
      'scan_completed',
      companyId || 'none',
      source.externalSourceKey,
      input.localJobId || completedAt,
      'v1',
    ]);
    const envelope: AgentIngestionEnvelopeV1 = {
      apiVersion: AGENT_INGEST_API_VERSION,
      ingestionId: idempotencyKey,
      idempotencyKey,
      eventType: 'scan_completed',
      companyId,
      localWorkerId: workerId(settings),
      sourceKey: source.externalSourceKey,
      capturedAt: completedAt,
      payload: sanitizeJsonValue({
        sourceKey: source.externalSourceKey,
        localSourceId: source.id,
        localJobId: input.localJobId ?? null,
        startedAt: input.startedAt ?? null,
        completedAt,
        stopReason: input.stopReason ?? null,
        metrics: input.metrics || {},
        browserWorkerId: workerId(settings),
      }) as Record<string, unknown>,
    };
    const created = await createOutboxRow(prisma, {
      companyId,
      eventType: 'scan_completed',
      entityId: input.localJobId || source.id,
      ingestionId: idempotencyKey,
      envelope,
    });
    if (created.created) scheduleAgentSyncFlush();
    return { enqueued: created.created };
  } catch (error) {
    return {
      enqueued: false,
      reason: error instanceof Error ? error.message : 'enqueue_error',
    };
  }
}
