import { prisma } from '../../prisma';
import {
  resolveDestinationAdapterForChannel,
  resolveDestinationKeyFromChannel,
  type BrowserDestinationContext,
  type DestinationKey,
} from './browser';

export type PublishWorkflowPayload = {
  publishJobId: string;
  draftId: string;
  destinationId: string;
  destinationKey: DestinationKey;
  body: string;
  linkUrl: string | null;
  media: Array<{ type: string; fileUrl: string; sortOrder: number }>;
  destinationConfig: Record<string, unknown>;
  dryRun: boolean;
};

export function buildPublishWorkflowPayloadFromRecords(job: {
  id: string;
  draftId: string;
  channelId: string;
  draft: {
    body: string;
    linkUrl: string | null;
    media?: Array<{ type: string; fileUrl: string; sortOrder: number }>;
  };
  channel: { type: string; executionMode: string; config: unknown };
}): PublishWorkflowPayload {
  const destinationKey = resolveDestinationKeyFromChannel(job.channel);
  if (!destinationKey) {
    throw new Error(
      `Channel not mapped to browser destination: type=${job.channel.type} mode=${job.channel.executionMode}`,
    );
  }

  const config =
    job.channel.config && typeof job.channel.config === 'object'
      ? (job.channel.config as Record<string, unknown>)
      : {};

  return {
    publishJobId: job.id,
    draftId: job.draftId,
    destinationId: job.channelId,
    destinationKey,
    body: job.draft.body,
    linkUrl: job.draft.linkUrl,
    media: (job.draft.media || []).map(m => ({
      type: m.type,
      fileUrl: m.fileUrl,
      sortOrder: m.sortOrder,
    })),
    destinationConfig: config,
    dryRun: process.env.BROWSER_PUBLISH_LIVE !== '1',
  };
}

export async function loadPublishWorkflowPayload(
  publishJobId: string,
): Promise<PublishWorkflowPayload> {
  const job = await prisma.socialPublishJob.findUnique({
    where: { id: publishJobId },
    include: {
      draft: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
      channel: true,
    },
  });
  if (!job?.draft || !job.channel) {
    throw new Error(`Publish job missing draft/channel: ${publishJobId}`);
  }

  return buildPublishWorkflowPayloadFromRecords(job);
}

export function toBrowserDestinationContext(
  payload: PublishWorkflowPayload,
  input: {
    missionRunId: string;
    workerId?: string | null;
    browserSessionId?: string | null;
  },
): BrowserDestinationContext {
  return {
    publishJobId: payload.publishJobId,
    draftId: payload.draftId,
    destinationId: payload.destinationId,
    missionRunId: input.missionRunId,
    workerId: input.workerId,
    browserSessionId: input.browserSessionId,
    body: payload.body,
    linkUrl: payload.linkUrl,
    media: payload.media,
    destinationConfig: payload.destinationConfig,
    dryRun: payload.dryRun,
  };
}

export function resolveAdapterForPayload(payload: PublishWorkflowPayload) {
  return resolveDestinationAdapterForChannel({
    type: payload.destinationKey === 'facebook_timeline'
      ? 'facebook_profile'
      : payload.destinationKey === 'facebook_group'
        ? 'facebook_group'
        : 'facebook_page',
    executionMode: 'browser',
    config: { destinationKey: payload.destinationKey, ...payload.destinationConfig },
  });
}
