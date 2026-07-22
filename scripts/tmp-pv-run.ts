/**
 * Publish Validation — schedule ONE text draft for near future; wait for Production Scheduler
 * (no manual enqueue). Observe ownership / agent / social job outcome.
 *
 * Tag artifacts with idempotencyKey prefix `pv-` for cleanup.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const MARKER = 'pv-validate';

function vn(d: Date) {
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

async function main() {
  const phase = process.argv[2] || 'schedule';
  const channelId = 'cmrsyjigv02d1md6bv0bbubvq'; // Facebook cá nhân Timeline

  if (phase === 'schedule') {
    // Prefer existing cancelled/approved draft body from prior H0, or create minimal draft
    let draft = await p.socialPostDraft.findFirst({
      where: {
        status: { in: ['approved', 'cancelled', 'draft'] },
        companyId: 'comp-da-nang',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!draft) {
      draft = await p.socialPostDraft.create({
        data: {
          companyId: 'comp-da-nang',
          status: 'draft',
          body:
            `[${MARKER}] Validation scheduler ${new Date().toISOString()} — bài test tự động, sẽ xóa sau. Không phải content marketing.`,
          createdBy: 'pv-validate',
        },
      });
    } else {
      await p.socialPostDraft.update({
        where: { id: draft.id },
        data: {
          status: 'approved',
          body:
            draft.body?.includes(MARKER)
              ? draft.body
              : `${draft.body}\n\n[${MARKER}] ${new Date().toISOString()}`,
        },
      });
      draft = await p.socialPostDraft.findUniqueOrThrow({ where: { id: draft.id } });
    }

    // Ensure approved
    if (draft.status !== 'approved' && draft.status !== 'scheduled') {
      await p.socialPostDraft.update({
        where: { id: draft.id },
        data: { status: 'approved' },
      });
    }

    const scheduledAt = new Date(Date.now() + 75_000); // ~75s — next scheduler tick after due
    const job = await p.socialPublishJob.create({
      data: {
        companyId: draft.companyId,
        draftId: draft.id,
        channelId,
        status: 'queued',
        scheduledAt,
        idempotencyKey: `${MARKER}-${draft.id}-${scheduledAt.getTime()}`,
      },
    });

    await p.socialPostDraft.update({
      where: { id: draft.id },
      data: { status: 'scheduled' },
    });

    console.log(
      JSON.stringify(
        {
          phase: 'scheduled',
          draftId: draft.id,
          jobId: job.id,
          scheduledAtUtc: scheduledAt.toISOString(),
          scheduledAtVn: vn(scheduledAt),
          note: 'Wait for Production Scheduler tick after due — do NOT manual enqueue',
        },
        null,
        2,
      ),
    );
    return;
  }

  if (phase === 'watch') {
    const jobId = process.argv[3];
    if (!jobId) throw new Error('watch requires jobId');
    const social = await p.socialPublishJob.findUnique({
      where: { id: jobId },
      include: { draft: { select: { id: true, status: true } }, channel: true },
    });
    const agents = await p.agentJob.findMany({
      where: {
        type: 'publish_social',
        payload: { path: ['publishJobId'], equals: jobId },
      },
      orderBy: { createdAt: 'asc' },
    });
    const latest = agents[agents.length - 1];
    const payload =
      latest?.payload && typeof latest.payload === 'object'
        ? (latest.payload as Record<string, unknown>)
        : {};

    const events = latest
      ? await p.agentRuntimeEvent.findMany({
          where: {
            OR: [{ entityId: latest.id }, { entityId: jobId }],
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { type: true, createdAt: true, payload: true, agentId: true },
        })
      : [];

    const notif = await p.agentNotification.findMany({
      where: {
        OR: [
          { eventKey: { contains: jobId } },
          { data: { path: ['publishJobId'], equals: jobId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log(
      JSON.stringify(
        {
          nowUtc: new Date().toISOString(),
          nowVn: vn(new Date()),
          social: social
            ? {
                id: social.id,
                status: social.status,
                scheduledAtUtc: social.scheduledAt.toISOString(),
                scheduledAtVn: vn(social.scheduledAt),
                due: social.scheduledAt.getTime() <= Date.now(),
                error: social.errorMessage,
                result: social.result,
                draftStatus: social.draft?.status,
                channel: `${social.channel.type}:${social.channel.name}`,
              }
            : null,
          agentJobs: agents.map(a => ({
            id: a.id,
            status: a.status,
            claimedBy: a.claimedBy,
            attempts: a.attempts,
            error: a.errorMessage,
            createdAt: a.createdAt,
            finishedAt: a.finishedAt,
            ownerMachine: payload.ownerMachine ?? (a.payload as any)?.ownerMachine,
            ownerAgent: (a.payload as any)?.ownerAgent,
            leaseUntil: (a.payload as any)?.leaseUntil,
            plannerDecision: (a.payload as any)?.plannerDecision,
            executionPool: (a.result as any)?.executionPool,
          })),
          agentCount: agents.length,
          latestPayloadOwnership: {
            ownerMachine: payload.ownerMachine ?? null,
            ownerAgent: payload.ownerAgent ?? null,
            leaseUntil: payload.leaseUntil ?? null,
            plannerDecision: payload.plannerDecision ?? null,
            targetAgentId: payload.targetAgentId ?? null,
          },
          runtimeEvents: events.map(e => ({
            type: e.type,
            at: e.createdAt,
            agentId: e.agentId,
            payload: e.payload,
          })),
          notifications: notif.map(n => ({
            type: n.type,
            title: n.title,
            message: n.message,
            createdAt: n.createdAt,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (phase === 'cleanup') {
    const jobs = await p.socialPublishJob.findMany({
      where: { idempotencyKey: { startsWith: MARKER } },
      select: { id: true, draftId: true },
    });
    const ids = jobs.map(j => j.id);
    for (const j of jobs) {
      const agents = await p.agentJob.findMany({
        where: {
          type: 'publish_social',
          payload: { path: ['publishJobId'], equals: j.id },
        },
      });
      for (const a of agents) {
        if (['queued', 'claimed', 'running'].includes(a.status)) {
          await p.agentJob.update({
            where: { id: a.id },
            data: { status: 'cancelled', errorMessage: 'pv_cleanup', finishedAt: new Date() },
          });
        }
      }
    }
    if (ids.length) {
      await p.socialPublishAttempt.deleteMany({ where: { jobId: { in: ids } } });
      await p.socialPublishJob.deleteMany({ where: { id: { in: ids } } });
    }
    const draftIds = [...new Set(jobs.map(j => j.draftId))];
    for (const id of draftIds) {
      await p.socialPostDraft
        .update({ where: { id }, data: { status: 'cancelled' } })
        .catch(() => undefined);
    }
    // Cancel leftover open pv agent jobs
    console.log(JSON.stringify({ cleanedJobs: ids.length, drafts: draftIds.length }, null, 2));
    return;
  }

  throw new Error(`unknown phase ${phase}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
