import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { notifyFindingHighScore } from '../agent/agentNotificationService';
import { notifyFindingIfEligible } from '../notifications/telegramNotificationService';
import { runInTransaction, asDb, type DbClient } from '../repositories/shared/repositoryTypes';

export type IngestFindingPayload = {
  ingestionId?: string;
  localWorkerId?: string;
  idempotencyKey?: string;
  parserVersion?: string;
  analysisVersion?: string;
  capturedAt?: string;
  source?: {
    id?: string;
    name?: string;
    type?: string;
    url?: string;
    externalKey?: string;
    externalSourceKey?: string;
    localSourceId?: string;
    remoteSourceId?: string;
    status?: string;
    config?: unknown;
  };
  scannedContent?: {
    id?: string;
    externalId?: string;
    canonicalUrl?: string;
    authorName?: string;
    authorUrl?: string;
    contentText?: string;
    contentHash?: string;
    normalizedContentHash?: string;
    publishedAt?: string | null;
    collectedAt?: string | null;
    rawData?: unknown;
    metrics?: unknown;
  };
  finding?: {
    type?: string;
    title?: string;
    summary?: string;
    score?: number;
    finalScore?: number;
    scoreStatus?: string;
    classification?: string;
    intent?: string;
    actorRole?: string;
    priority?: string;
    primaryPhone?: string;
    primaryLocation?: string;
    needSummary?: string;
    personName?: string;
    budgetMin?: number | string | null;
    budgetMax?: number | string | null;
    askingPrice?: number | string | null;
    propertyType?: string;
    keywordScore?: number;
    aiScore?: number;
    leadFitScore?: number;
    extractedData?: unknown;
    reasons?: unknown;
  };
  structuredData?: Record<string, unknown>;
  intelligence?: Record<string, unknown>;
};

export type IngestFindingResult = {
  status: 'accepted' | 'duplicate' | 'error';
  ingestionId: string;
  sourceId?: string | null;
  scannedContentId?: string | null;
  findingId?: string | null;
  telegramQueued?: boolean;
  warnings?: string[];
  errorMessage?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function bigIntOrNull(value: unknown): bigint | null {
  if (value == null || value === '') return null;
  try {
    const n = typeof value === 'bigint' ? value : BigInt(String(value).replace(/[^\d-]/g, ''));
    return n;
  } catch {
    return null;
  }
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function contentHashOf(text: string, fallbackUrl: string): string {
  return crypto
    .createHash('sha256')
    .update(`${text || ''}\n${fallbackUrl || ''}`)
    .digest('hex');
}

function mergePreferExisting<T extends Record<string, unknown>>(
  existing: T,
  next: Partial<T>,
): T {
  const out = { ...existing };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null || v === '') continue;
    const cur = out[k as keyof T];
    if (cur === undefined || cur === null || cur === '') {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}

async function upsertSource(input: {
  companyId: string | null;
  source?: IngestFindingPayload['source'] & {
    externalSourceKey?: string;
    localSourceId?: string;
    remoteSourceId?: string;
    status?: string;
    config?: unknown;
  };
  warnings: string[];
  db?: DbClient;
}): Promise<{ id: string }> {
  const client = asDb(input.db);
  const src = input.source || {};
  const url = String(src.url || src.externalKey || src.externalSourceKey || '').trim();
  const name = String(src.name || 'Ingested source').trim() || 'Ingested source';
  const type = String(src.type || 'facebook_group').trim() || 'facebook_group';
  const externalSourceKey = String(src.externalSourceKey || src.externalKey || '').trim() || null;

  if (src.remoteSourceId) {
    const byRemote = await client.agentSource.findUnique({ where: { id: String(src.remoteSourceId) } });
    if (byRemote) return { id: byRemote.id };
  }
  if (src.id) {
    const byId = await client.agentSource.findUnique({ where: { id: src.id } });
    if (byId) return { id: byId.id };
  }

  if (externalSourceKey && input.companyId) {
    const byKey = await client.agentSource.findFirst({
      where: { companyId: input.companyId, externalSourceKey },
    });
    if (byKey) {
      await client.agentSource.update({
        where: { id: byKey.id },
        data: {
          name: name || byKey.name,
          type: type || byKey.type,
          ...(url ? { url } : {}),
          status: src.status || (byKey.status === 'error' ? 'active' : byKey.status),
        },
      });
      return { id: byKey.id };
    }
  }

  if (url) {
    const existing = await client.agentSource.findFirst({
      where: {
        url,
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
    });
    if (existing) {
      await client.agentSource.update({
        where: { id: existing.id },
        data: {
          name: existing.name || name,
          type: existing.type || type,
          status: existing.status === 'error' ? 'active' : existing.status,
          ...(externalSourceKey && !existing.externalSourceKey
            ? { externalSourceKey }
            : {}),
        },
      });
      return { id: existing.id };
    }

    try {
      const created = await client.agentSource.create({
        data: {
          companyId: input.companyId,
          name,
          type,
          url,
          status: String(src.status || 'active'),
          externalSourceKey,
          config: {
            ingested: true,
            externalKey: src.externalKey || externalSourceKey,
            ...(src.config && typeof src.config === 'object' ? (src.config as object) : {}),
          },
        },
      });
      return { id: created.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await client.agentSource.findFirst({
          where: {
            ...(externalSourceKey && input.companyId
              ? { companyId: input.companyId, externalSourceKey }
              : { url, ...(input.companyId ? { companyId: input.companyId } : {}) }),
          },
        });
        if (again) return { id: again.id };
      }
      throw error;
    }
  }

  input.warnings.push('source_url_missing_created_placeholder');
  const placeholderUrl = `ingest://local/${crypto.randomBytes(8).toString('hex')}`;
  const created = await client.agentSource.create({
    data: {
      companyId: input.companyId,
      name,
      type,
      url: placeholderUrl,
      status: 'active',
      externalSourceKey,
      config: { ingested: true, placeholder: true },
    },
  });
  return { id: created.id };
}

async function upsertScannedContent(input: {
  companyId: string | null;
  sourceId: string;
  payload: IngestFindingPayload;
  warnings: string[];
  db?: DbClient;
}): Promise<{ id: string; created: boolean }> {
  const client = asDb(input.db);
  const sc = input.payload.scannedContent || {};
  const canonicalUrl = String(sc.canonicalUrl || '').trim();
  const contentText = String(sc.contentText || '').trim();
  if (!canonicalUrl && !contentText) {
    input.warnings.push('scanned_content_empty');
  }
  const url = canonicalUrl || `ingest://content/${input.payload.ingestionId || crypto.randomBytes(6).toString('hex')}`;
  const hash = String(sc.contentHash || '').trim() || contentHashOf(contentText, url);
  const externalId = sc.externalId ? String(sc.externalId) : null;

  let existing =
    (externalId
      ? await client.scannedContent.findFirst({
          where: { sourceId: input.sourceId, externalId },
        })
      : null) ||
    (await client.scannedContent.findFirst({
      where: { sourceId: input.sourceId, contentHash: hash },
    })) ||
    (canonicalUrl
      ? await client.scannedContent.findFirst({
          where: { sourceId: input.sourceId, canonicalUrl },
        })
      : null);

  if (sc.normalizedContentHash) {
    const byNorm = await client.scannedContent.findFirst({
      where: {
        sourceId: input.sourceId,
        normalizedContentHash: String(sc.normalizedContentHash),
      },
    });
    if (byNorm) existing = byNorm;
  }

  const collectedAt = parseDate(sc.collectedAt) || new Date();
  const publishedAt = parseDate(sc.publishedAt);

  if (existing) {
    const nextRaw = mergePreferExisting(
      asRecord(existing.rawData),
      asRecord(sc.rawData),
    );
    await client.scannedContent.update({
      where: { id: existing.id },
      data: {
        contentText: contentText || existing.contentText,
        authorName: sc.authorName || existing.authorName,
        authorUrl: sc.authorUrl || existing.authorUrl,
        canonicalUrl: canonicalUrl || existing.canonicalUrl,
        externalId: externalId || existing.externalId,
        normalizedContentHash:
          sc.normalizedContentHash != null
            ? String(sc.normalizedContentHash)
            : existing.normalizedContentHash,
        publishedAt: publishedAt || existing.publishedAt,
        rawData: nextRaw as Prisma.InputJsonValue,
        metrics: (sc.metrics as Prisma.InputJsonValue) ?? existing.metrics ?? undefined,
      },
    });
    return { id: existing.id, created: false };
  }

  const created = await client.scannedContent.create({
    data: {
      companyId: input.companyId,
      sourceId: input.sourceId,
      externalId,
      canonicalUrl: url,
      authorName: sc.authorName ? String(sc.authorName) : null,
      authorUrl: sc.authorUrl ? String(sc.authorUrl) : null,
      contentText: contentText || '(empty)',
      contentHash: hash,
      normalizedContentHash: sc.normalizedContentHash
        ? String(sc.normalizedContentHash)
        : null,
      publishedAt,
      collectedAt,
      status: 'collected',
      rawData: (sc.rawData as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      metrics: (sc.metrics as Prisma.InputJsonValue) ?? undefined,
    },
  });
  return { id: created.id, created: true };
}

function pickFindingFields(payload: IngestFindingPayload) {
  const finding = payload.finding || {};
  const intelligence = asRecord(payload.intelligence);
  const structured = asRecord(payload.structuredData);
  const type = String(finding.type || intelligence.type || 'lead_signal').trim() || 'lead_signal';
  const finalScore = Number(
    finding.finalScore ?? intelligence.finalScore ?? finding.score ?? intelligence.score ?? 0,
  );
  const score = Number(finding.score ?? finalScore ?? 0);
  const title =
    String(finding.title || intelligence.title || structured.title || 'Finding ingested').slice(0, 500);
  const summary = String(
    finding.summary || intelligence.summary || structured.summary || title,
  ).slice(0, 8000);

  return {
    type,
    score: Number.isFinite(score) ? Math.round(score) : 0,
    finalScore: Number.isFinite(finalScore) ? Math.round(finalScore) : 0,
    title,
    summary,
    scoreStatus: (finding.scoreStatus || intelligence.scoreStatus || null) as string | null,
    classification:
      (finding.classification || intelligence.classification || null) as string | null,
    intent: (finding.intent || intelligence.intent || null) as string | null,
    actorRole: (finding.actorRole || intelligence.actorRole || null) as string | null,
    priority: (finding.priority || intelligence.priority || null) as string | null,
    primaryPhone:
      (finding.primaryPhone || intelligence.primaryPhone || null) as string | null,
    primaryLocation:
      (finding.primaryLocation || intelligence.primaryLocation || null) as string | null,
    needSummary:
      (finding.needSummary || intelligence.needSummary || null) as string | null,
    personName: (finding.personName || intelligence.personName || null) as string | null,
    budgetMin: bigIntOrNull(finding.budgetMin ?? intelligence.budgetMin),
    budgetMax: bigIntOrNull(finding.budgetMax ?? intelligence.budgetMax),
    askingPrice: bigIntOrNull(finding.askingPrice ?? intelligence.askingPrice),
    propertyType:
      (finding.propertyType || intelligence.propertyType || null) as string | null,
    keywordScore:
      finding.keywordScore != null
        ? Number(finding.keywordScore)
        : intelligence.keywordScore != null
          ? Number(intelligence.keywordScore)
          : null,
    aiScore:
      finding.aiScore != null
        ? Number(finding.aiScore)
        : intelligence.aiScore != null
          ? Number(intelligence.aiScore)
          : null,
    leadFitScore:
      finding.leadFitScore != null
        ? Number(finding.leadFitScore)
        : intelligence.leadFitScore != null
          ? Number(intelligence.leadFitScore)
          : null,
    extractedData: {
      ...structured,
      ...asRecord(finding.extractedData),
      intelligence,
      parserVersion: payload.parserVersion,
      analysisVersion: payload.analysisVersion,
    } as Prisma.InputJsonValue,
    reasons: (Array.isArray(finding.reasons)
      ? finding.reasons
      : Array.isArray(intelligence.reasons)
        ? intelligence.reasons
        : []) as Prisma.InputJsonValue,
    intelligenceVersion: payload.analysisVersion || null,
  };
}

export async function ingestFindingPayload(input: {
  companyId: string | null;
  keyId?: string | null;
  payload: IngestFindingPayload;
  requestHash?: string | null;
  /** When true, upsert source+content only (no Finding). */
  contentOnly?: boolean;
}): Promise<IngestFindingResult> {
  const warnings: string[] = [];
  const ingestionId =
    String(input.payload.ingestionId || '').trim() ||
    `ing_${crypto.randomBytes(10).toString('hex')}`;
  const idempotencyKey =
    String(input.payload.idempotencyKey || '').trim() || null;

  try {
    if (idempotencyKey) {
      const prior = await prisma.agentIngestionEvent.findFirst({
        where: {
          companyId: input.companyId,
          idempotencyKey,
        },
      });
      if (prior && (prior.findingId || (input.contentOnly && prior.scannedContentId))) {
        return {
          status: 'duplicate',
          ingestionId: prior.ingestionId,
          sourceId: prior.sourceId,
          scannedContentId: prior.scannedContentId,
          findingId: prior.findingId,
          telegramQueued: prior.telegramQueued,
          warnings: Array.isArray(prior.warnings) ? (prior.warnings as string[]) : [],
        };
      }
    }

    const priorIngestion = await prisma.agentIngestionEvent.findFirst({
      where: { companyId: input.companyId, ingestionId },
    });
    if (priorIngestion && (priorIngestion.findingId || (input.contentOnly && priorIngestion.scannedContentId))) {
      return {
        status: 'duplicate',
        ingestionId,
        sourceId: priorIngestion.sourceId,
        scannedContentId: priorIngestion.scannedContentId,
        findingId: priorIngestion.findingId,
        telegramQueued: priorIngestion.telegramQueued,
        warnings: Array.isArray(priorIngestion.warnings)
          ? (priorIngestion.warnings as string[])
          : [],
      };
    }

    const persisted = await runInTransaction(async tx => {
      const source = await upsertSource({
        companyId: input.companyId,
        source: input.payload.source,
        warnings,
        db: tx,
      });
      const content = await upsertScannedContent({
        companyId: input.companyId,
        sourceId: source.id,
        payload: input.payload,
        warnings,
        db: tx,
      });

      // Content-only ingest (no Finding required)
      if (input.contentOnly || !input.payload.finding) {
        const hasFindingFields =
          input.payload.finding &&
          Object.values(input.payload.finding).some((v) => v != null && v !== '');
        if (input.contentOnly || !hasFindingFields) {
          await tx.agentIngestionEvent.upsert({
            where: {
              companyId_ingestionId: {
                companyId: input.companyId,
                ingestionId,
              },
            },
            create: {
              companyId: input.companyId,
              ingestionId,
              idempotencyKey,
              localWorkerId: input.payload.localWorkerId || null,
              keyId: input.keyId || null,
              status: content.created ? 'accepted' : 'duplicate',
              sourceId: source.id,
              scannedContentId: content.id,
              findingId: null,
              requestHash: input.requestHash || null,
              payloadMeta: {
                parserVersion: input.payload.parserVersion,
                analysisVersion: input.payload.analysisVersion,
                capturedAt: input.payload.capturedAt,
                contentOnly: true,
              },
              warnings,
              telegramQueued: false,
            },
            update: {
              status: content.created ? 'accepted' : 'duplicate',
              sourceId: source.id,
              scannedContentId: content.id,
              warnings,
              errorMessage: null,
            },
          });
          return {
            kind: 'content_only' as const,
            status: content.created ? ('accepted' as const) : ('duplicate' as const),
            sourceId: source.id,
            scannedContentId: content.id,
            findingId: null as string | null,
            created: content.created,
          };
        }
      }

      const fields = pickFindingFields(input.payload);
      let finding = await tx.agentFinding.findUnique({
        where: {
          scannedContentId_type: {
            scannedContentId: content.id,
            type: fields.type,
          },
        },
      });

      let created = false;
      if (!finding) {
        try {
          finding = await tx.agentFinding.create({
            data: {
              companyId: input.companyId,
              sourceId: source.id,
              scannedContentId: content.id,
              status: 'new',
              dedupeStatus: 'unique',
              ...fields,
            },
          });
          created = true;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            finding = await tx.agentFinding.findUnique({
              where: {
                scannedContentId_type: {
                  scannedContentId: content.id,
                  type: fields.type,
                },
              },
            });
          } else {
            throw error;
          }
        }
      } else {
        await tx.agentFinding.update({
          where: { id: finding.id },
          data: {
            title: fields.title || finding.title,
            summary: fields.summary || finding.summary,
            score: Math.max(finding.score, fields.score),
            finalScore: Math.max(finding.finalScore ?? 0, fields.finalScore),
            classification: fields.classification || finding.classification,
            intent: fields.intent || finding.intent,
            actorRole: fields.actorRole || finding.actorRole,
            priority: fields.priority || finding.priority,
            primaryPhone: fields.primaryPhone || finding.primaryPhone,
            primaryLocation: fields.primaryLocation || finding.primaryLocation,
            needSummary: fields.needSummary || finding.needSummary,
            personName: fields.personName || finding.personName,
            budgetMin: fields.budgetMin ?? finding.budgetMin,
            budgetMax: fields.budgetMax ?? finding.budgetMax,
            askingPrice: fields.askingPrice ?? finding.askingPrice,
            propertyType: fields.propertyType || finding.propertyType,
            keywordScore: fields.keywordScore ?? finding.keywordScore,
            aiScore: fields.aiScore ?? finding.aiScore,
            leadFitScore: fields.leadFitScore ?? finding.leadFitScore,
            scoreStatus: fields.scoreStatus || finding.scoreStatus,
            extractedData: fields.extractedData,
            reasons: fields.reasons,
            intelligenceVersion: fields.intelligenceVersion || finding.intelligenceVersion,
          },
        });
        finding = await tx.agentFinding.findUnique({ where: { id: finding.id } });
      }

      if (!finding) {
        throw new Error('Finding upsert failed.');
      }

      await tx.agentIngestionEvent.upsert({
        where: {
          companyId_ingestionId: {
            companyId: input.companyId,
            ingestionId,
          },
        },
        create: {
          companyId: input.companyId,
          ingestionId,
          idempotencyKey,
          localWorkerId: input.payload.localWorkerId || null,
          keyId: input.keyId || null,
          status: created ? 'accepted' : 'duplicate',
          sourceId: source.id,
          scannedContentId: content.id,
          findingId: finding.id,
          requestHash: input.requestHash || null,
          payloadMeta: {
            parserVersion: input.payload.parserVersion,
            analysisVersion: input.payload.analysisVersion,
            capturedAt: input.payload.capturedAt,
          },
          warnings,
          telegramQueued: false,
        },
        update: {
          status: created ? 'accepted' : 'duplicate',
          sourceId: source.id,
          scannedContentId: content.id,
          findingId: finding.id,
          warnings,
          telegramQueued: false,
          errorMessage: null,
        },
      });

      return {
        kind: 'finding' as const,
        status: created ? ('accepted' as const) : ('duplicate' as const),
        sourceId: source.id,
        scannedContentId: content.id,
        findingId: finding.id,
        created,
        findingScore: finding.finalScore ?? finding.score,
        findingTitle: finding.title,
      };
    });

    if (persisted.kind === 'content_only') {
      return {
        status: persisted.status,
        ingestionId,
        sourceId: persisted.sourceId,
        scannedContentId: persisted.scannedContentId,
        findingId: null,
        telegramQueued: false,
        warnings,
      };
    }

    let telegramQueued = false;
    if (persisted.created && persisted.findingId) {
      void notifyFindingHighScore({
        companyId: input.companyId,
        findingId: persisted.findingId,
        score: persisted.findingScore,
        title: persisted.findingTitle,
        canonicalUrl: input.payload.scannedContent?.canonicalUrl,
        sourceId: persisted.sourceId,
      }).catch(() => undefined);

      // Network side effect AFTER commit — never rollback ingest on Telegram failure
      void notifyFindingIfEligible({ findingId: persisted.findingId })
        .then(r => {
          if (r.ok) {
            void prisma.agentIngestionEvent
              .updateMany({
                where: { companyId: input.companyId, ingestionId },
                data: { telegramQueued: true },
              })
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
      telegramQueued = false;
    }

    return {
      status: persisted.status,
      ingestionId,
      sourceId: persisted.sourceId,
      scannedContentId: persisted.scannedContentId,
      findingId: persisted.findingId,
      telegramQueued,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[ingest] failed:', message);
    try {
      await prisma.agentIngestionEvent.upsert({
        where: {
          companyId_ingestionId: {
            companyId: input.companyId,
            ingestionId,
          },
        },
        create: {
          companyId: input.companyId,
          ingestionId,
          idempotencyKey,
          localWorkerId: input.payload.localWorkerId || null,
          keyId: input.keyId || null,
          status: 'error',
          requestHash: input.requestHash || null,
          errorMessage: message,
          warnings,
        },
        update: {
          status: 'error',
          errorMessage: message,
          warnings,
        },
      });
    } catch {
      // ignore secondary failure
    }
    return {
      status: 'error',
      ingestionId,
      errorMessage: message,
      warnings,
    };
  }
}

export async function ingestFindingBatch(input: {
  companyId: string | null;
  keyId?: string | null;
  items: IngestFindingPayload[];
  requestHash?: string | null;
  maxItems?: number;
}): Promise<{ results: IngestFindingResult[]; truncated: boolean }> {
  const max = input.maxItems ?? 50;
  const items = input.items.slice(0, max);
  const results: IngestFindingResult[] = [];
  for (const payload of items) {
    results.push(
      await ingestFindingPayload({
        companyId: input.companyId,
        keyId: input.keyId,
        payload,
        requestHash: input.requestHash,
      }),
    );
  }
  return { results, truncated: input.items.length > max };
}

export type IngestEventResult = IngestFindingResult & {
  eventType?: string;
  remoteSourceId?: string | null;
  remoteScannedContentId?: string | null;
  remoteFindingId?: string | null;
};

/**
 * Envelope-aware ingest for local→VPS full sync.
 */
export async function ingestEventEnvelope(input: {
  companyId: string | null;
  keyId?: string | null;
  envelope: Record<string, unknown>;
  requestHash?: string | null;
}): Promise<IngestEventResult> {
  const eventType = String(input.envelope.eventType || 'finding_upsert');
  const payloadBody = (input.envelope.payload && typeof input.envelope.payload === 'object'
    ? input.envelope.payload
    : input.envelope) as Record<string, unknown>;

  if (eventType === 'scan_completed' || eventType === 'scan_failed' || eventType === 'notification_event') {
    const ingestionId =
      String(input.envelope.ingestionId || input.envelope.idempotencyKey || '').trim() ||
      `evt_${crypto.randomBytes(8).toString('hex')}`;
    await prisma.agentIngestionEvent.upsert({
      where: {
        companyId_ingestionId: {
          companyId: input.companyId,
          ingestionId,
        },
      },
      create: {
        companyId: input.companyId,
        ingestionId,
        idempotencyKey: String(input.envelope.idempotencyKey || ingestionId),
        localWorkerId: input.envelope.localWorkerId != null ? String(input.envelope.localWorkerId) : null,
        keyId: input.keyId || null,
        status: 'accepted',
        requestHash: input.requestHash || null,
        payloadMeta: {
          eventType,
          sourceKey: input.envelope.sourceKey != null ? String(input.envelope.sourceKey) : null,
          capturedAt: input.envelope.capturedAt != null ? String(input.envelope.capturedAt) : null,
          metrics: (payloadBody.metrics as Prisma.InputJsonValue) || (payloadBody as Prisma.InputJsonValue),
        } as Prisma.InputJsonValue,
      },
      update: {
        status: 'accepted',
        payloadMeta: {
          eventType,
          sourceKey: input.envelope.sourceKey != null ? String(input.envelope.sourceKey) : null,
          capturedAt: input.envelope.capturedAt != null ? String(input.envelope.capturedAt) : null,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      status: 'accepted',
      ingestionId,
      eventType,
      warnings: [],
    };
  }

  const mapped: IngestFindingPayload = {
    ingestionId: String(input.envelope.ingestionId || '').trim() || undefined,
    idempotencyKey: String(input.envelope.idempotencyKey || '').trim() || undefined,
    localWorkerId: input.envelope.localWorkerId != null ? String(input.envelope.localWorkerId) : undefined,
    parserVersion: input.envelope.parserVersion != null ? String(input.envelope.parserVersion) : undefined,
    analysisVersion:
      input.envelope.analysisVersion != null ? String(input.envelope.analysisVersion) : undefined,
    capturedAt: input.envelope.capturedAt != null ? String(input.envelope.capturedAt) : undefined,
    source: (payloadBody.source || undefined) as IngestFindingPayload['source'],
    scannedContent: (payloadBody.scannedContent || undefined) as IngestFindingPayload['scannedContent'],
    finding: (payloadBody.finding || undefined) as IngestFindingPayload['finding'],
    intelligence:
      ((payloadBody.finding as Record<string, unknown> | undefined)?.extractedData as
        | Record<string, unknown>
        | undefined) || undefined,
  };

  // Enrich source external key from envelope
  if (mapped.source && input.envelope.sourceKey && !mapped.source.externalKey) {
    mapped.source = {
      ...mapped.source,
      externalKey: String(input.envelope.sourceKey),
      externalSourceKey: String(input.envelope.sourceKey),
    } as IngestFindingPayload['source'];
  }

  const contentOnly = eventType === 'scanned_content_upsert' || eventType === 'source_upsert';
  const result = await ingestFindingPayload({
    companyId: input.companyId,
    keyId: input.keyId,
    payload: mapped,
    requestHash: input.requestHash,
    contentOnly,
  });

  return {
    ...result,
    eventType,
    remoteSourceId: result.sourceId,
    remoteScannedContentId: result.scannedContentId,
    remoteFindingId: result.findingId,
  };
}
