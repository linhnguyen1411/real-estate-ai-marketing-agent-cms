/**
 * Check latest publish_social / SocialPublishJob schedule vs Vietnam time.
 */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

function fmtVn(d: Date | null | undefined) {
  if (!d) return null;
  return {
    isoUtc: d.toISOString(),
    vn: d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
    epoch: d.getTime(),
  };
}

async function main() {
  const now = new Date();

  const agents = await p.agentJob.findMany({
    where: { type: 'publish_social' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      createdAt: true,
      availableAt: true,
      claimedBy: true,
      attempts: true,
      errorMessage: true,
      payload: true,
      updatedAt: true,
    },
  });

  const latestAgent = agents[0];
  const publishJobId =
    latestAgent?.payload && typeof latestAgent.payload === 'object'
      ? String((latestAgent.payload as Record<string, unknown>).publishJobId || '')
      : '';

  const social = publishJobId
    ? await p.socialPublishJob.findUnique({
        where: { id: publishJobId },
        include: {
          channel: { select: { id: true, name: true, type: true } },
          draft: { select: { id: true, status: true, body: true, updatedAt: true } },
        },
      })
    : await p.socialPublishJob.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          channel: { select: { id: true, name: true, type: true } },
          draft: { select: { id: true, status: true, body: true, updatedAt: true } },
        },
      });

  const queuedUpcoming = await p.socialPublishJob.findMany({
    where: { status: { in: ['queued', 'claimed', 'preparing', 'publishing'] } },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    include: {
      channel: { select: { name: true, type: true } },
      draft: { select: { id: true, status: true } },
    },
  });

  let deltaMs: number | null = null;
  let deltaHuman: string | null = null;
  if (social?.scheduledAt) {
    deltaMs = social.scheduledAt.getTime() - now.getTime();
    const abs = Math.abs(deltaMs);
    const mins = Math.round(abs / 60_000);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    deltaHuman =
      deltaMs >= 0
        ? hours > 0
          ? `còn ~${hours}h ${rem}m`
          : `còn ~${mins} phút`
        : hours > 0
          ? `quá hạn ~${hours}h ${rem}m`
          : `quá hạn ~${mins} phút`;
  }

  // Heuristic: if UI meant VN wall-clock but stored as UTC-naive, offset often ±7h
  let tzHint: string | null = null;
  if (social?.scheduledAt) {
    const vnHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        hour12: false,
      }).format(social.scheduledAt),
    );
    const utcHour = social.scheduledAt.getUTCHours();
    tzHint = `scheduledAt UTC hour=${utcHour}, VN hour=${vnHour} (UTC+7). If operator picked VN wall clock in UI, CMS should store Instant = that VN time.`;
  }

  console.log(
    JSON.stringify(
      {
        now: fmtVn(now),
        latestPublishSocialAgents: agents.map(a => ({
          id: a.id,
          status: a.status,
          publishJobId: (a.payload as Record<string, unknown>)?.publishJobId,
          createdAt: fmtVn(a.createdAt),
          availableAt: fmtVn(a.availableAt),
          claimedBy: a.claimedBy,
          attempts: a.attempts,
          error: a.errorMessage,
        })),
        socialPublishJob: social
          ? {
              id: social.id,
              status: social.status,
              scheduledAt: fmtVn(social.scheduledAt),
              vsNow: { deltaMs, deltaHuman },
              tzHint,
              channel: social.channel,
              draft: {
                id: social.draft?.id,
                status: social.draft?.status,
                preview: social.draft?.body?.slice(0, 100),
              },
              claimedBy: social.claimedBy,
              error: social.errorMessage,
              createdAt: fmtVn(social.createdAt),
              updatedAt: fmtVn(social.updatedAt),
            }
          : null,
        openJobs: queuedUpcoming.map(j => ({
          id: j.id,
          status: j.status,
          scheduledAt: fmtVn(j.scheduledAt),
          channel: j.channel ? `${j.channel.type}:${j.channel.name}` : null,
          draftStatus: j.draft?.status,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
