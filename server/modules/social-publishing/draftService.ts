import { Prisma, type SocialPostDraft } from '@prisma/client';
import { prisma } from '../../prisma';
import { appendAuditLog } from './auditService';
import { validateMediaList, type MediaInput } from './mediaValidation';
import { fingerprintBody } from './safetyService';
import { createPublishJob, enqueueAgentJobForPublishJob } from './jobService';

export async function listDrafts(input: {
  companyId?: string | null;
  status?: string;
  limit?: number;
}) {
  return prisma.socialPostDraft.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
}

export async function getDraftById(id: string) {
  return prisma.socialPostDraft.findUnique({
    where: { id },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  });
}

async function replaceMedia(draftId: string, media?: MediaInput[]) {
  if (media === undefined) return;
  const check = validateMediaList(media);
  if (!check.ok) throw new Error(check.error || 'Invalid media');

  await prisma.socialPostMedia.deleteMany({ where: { draftId } });
  if (media.length === 0) return;

  await prisma.socialPostMedia.createMany({
    data: media.map((m, index) => ({
      draftId,
      type: m.type || 'image',
      fileUrl: m.fileUrl,
      sortOrder: m.sortOrder ?? index,
      altText: m.altText ?? null,
    })),
  });
}

export async function createDraft(input: {
  companyId?: string | null;
  title?: string | null;
  body: string;
  linkUrl?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
  media?: MediaInput[];
  status?: string;
}): Promise<SocialPostDraft> {
  const body = String(input.body || '');
  if (!body.trim()) throw new Error('Draft body is required');
  const hashes = fingerprintBody(body);

  const draft = await prisma.socialPostDraft.create({
    data: {
      companyId: input.companyId ?? null,
      title: input.title ?? null,
      body,
      linkUrl: input.linkUrl ?? null,
      status: input.status || 'draft',
      createdBy: input.createdBy ?? null,
      bodyHash: hashes.bodyHash,
      normalizedBodyHash: hashes.normalizedBodyHash,
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
    },
  });

  await replaceMedia(draft.id, input.media);

  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: draft.id,
    action: 'created',
    actor: input.createdBy,
  });

  return (await getDraftById(draft.id))!;
}

export async function updateDraft(
  id: string,
  patch: {
    title?: string | null;
    body?: string;
    linkUrl?: string | null;
    metadata?: Record<string, unknown>;
    media?: MediaInput[];
    actor?: string | null;
  },
): Promise<SocialPostDraft> {
  const existing = await getDraftById(id);
  if (!existing) throw new Error('Draft not found');
  if (existing.status === 'published' || existing.status === 'archived') {
    throw new Error(`Cannot update draft in status ${existing.status}`);
  }

  const body = patch.body !== undefined ? String(patch.body) : existing.body;
  if (!body.trim()) throw new Error('Draft body is required');
  const hashes = fingerprintBody(body);

  await prisma.socialPostDraft.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body } : {}),
      ...(patch.linkUrl !== undefined ? { linkUrl: patch.linkUrl } : {}),
      ...(patch.metadata !== undefined
        ? { metadata: patch.metadata as Prisma.InputJsonValue }
        : {}),
      bodyHash: hashes.bodyHash,
      normalizedBodyHash: hashes.normalizedBodyHash,
      // Edits after approval reset to draft unless still pending_review
      status:
        existing.status === 'approved' || existing.status === 'scheduled'
          ? 'draft'
          : existing.status,
      approvedBy: existing.status === 'approved' ? null : existing.approvedBy,
      approvedAt: existing.status === 'approved' ? null : existing.approvedAt,
    },
  });

  await replaceMedia(id, patch.media);

  await appendAuditLog({
    companyId: existing.companyId,
    entityType: 'SocialPostDraft',
    entityId: id,
    action: 'updated',
    actor: patch.actor,
  });

  return (await getDraftById(id))!;
}

export async function submitForReview(id: string, actor?: string | null) {
  const draft = await getDraftById(id);
  if (!draft) throw new Error('Draft not found');
  if (!['draft', 'rejected'].includes(draft.status)) {
    throw new Error(`Cannot submit draft in status ${draft.status}`);
  }
  const updated = await prisma.socialPostDraft.update({
    where: { id },
    data: { status: 'pending_review' },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: id,
    action: 'submit_review',
    actor,
  });
  return updated;
}

export async function approveDraft(
  id: string,
  actor?: string | null,
  schedule?: { channelId: string; scheduledAt: Date },
) {
  const draft = await getDraftById(id);
  if (!draft) throw new Error('Draft not found');
  if (!['draft', 'pending_review', 'rejected'].includes(draft.status)) {
    throw new Error(`Cannot approve draft in status ${draft.status}`);
  }

  const updated = await prisma.socialPostDraft.update({
    where: { id },
    data: {
      status: schedule ? 'scheduled' : 'approved',
      approvedBy: actor ?? null,
      approvedAt: new Date(),
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  });

  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: id,
    action: 'approved',
    actor,
  });

  if (schedule) {
    const scheduled = await approveAndSchedule(id, schedule.channelId, schedule.scheduledAt, actor);
    return scheduled.draft ?? updated;
  }

  return updated;
}

export async function rejectDraft(id: string, actor?: string | null, reason?: string) {
  const draft = await getDraftById(id);
  if (!draft) throw new Error('Draft not found');
  const updated = await prisma.socialPostDraft.update({
    where: { id },
    data: {
      status: 'rejected',
      approvedBy: null,
      approvedAt: null,
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: id,
    action: 'rejected',
    actor,
    metadata: { reason },
  });
  return updated;
}

export async function archiveDraft(id: string, actor?: string | null) {
  const draft = await getDraftById(id);
  if (!draft) throw new Error('Draft not found');
  const updated = await prisma.socialPostDraft.update({
    where: { id },
    data: { status: 'archived' },
    include: { media: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: id,
    action: 'archived',
    actor,
  });
  return updated;
}

export async function approveAndSchedule(
  draftId: string,
  channelId: string,
  scheduledAt: Date,
  actor?: string | null,
) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');

  if (draft.status !== 'approved' && draft.status !== 'scheduled') {
    await prisma.socialPostDraft.update({
      where: { id: draftId },
      data: {
        status: 'scheduled',
        approvedBy: actor ?? draft.approvedBy,
        approvedAt: draft.approvedAt ?? new Date(),
      },
    });
  } else {
    await prisma.socialPostDraft.update({
      where: { id: draftId },
      data: { status: 'scheduled' },
    });
  }

  const job = await createPublishJob({
    companyId: draft.companyId,
    draftId,
    channelId,
    scheduledAt,
    actor,
  });

  // If due now, enqueue AgentJob immediately so publish-now does not wait for scheduler tick
  if (scheduledAt.getTime() <= Date.now()) {
    await enqueueAgentJobForPublishJob(job);
  }

  await appendAuditLog({
    companyId: draft.companyId,
    entityType: 'SocialPostDraft',
    entityId: draftId,
    action: 'scheduled',
    actor,
    metadata: { channelId, scheduledAt: scheduledAt.toISOString(), jobId: job.id },
  });

  return { draft: await getDraftById(draftId), job };
}

export async function publishNow(
  draftId: string,
  channelId: string,
  actor?: string | null,
) {
  const draft = await getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');

  if (draft.status !== 'approved' && draft.status !== 'scheduled') {
    if (['draft', 'pending_review', 'rejected'].includes(draft.status)) {
      await approveDraft(draftId, actor);
    } else {
      throw new Error(`Draft must be approved before publish-now (status=${draft.status})`);
    }
  }

  return approveAndSchedule(draftId, channelId, new Date(), actor);
}

/**
 * Mission helper: create AI-generated draft for human review.
 * NEVER auto-approves.
 */
export async function createAiGeneratedDraft(input: {
  companyId?: string | null;
  body: string;
  title?: string | null;
  linkUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  media?: MediaInput[];
}) {
  return createDraft({
    companyId: input.companyId,
    body: input.body,
    title: input.title,
    linkUrl: input.linkUrl,
    createdBy: input.createdBy ?? 'mission',
    status: 'pending_review',
    media: input.media,
    metadata: {
      ...(input.metadata || {}),
      ai_generated: true,
    },
  });
}
