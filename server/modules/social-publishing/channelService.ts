import { Prisma, type SocialChannel } from '@prisma/client';
import { prisma } from '../../prisma';
import { appendAuditLog } from './auditService';
import { notifyChannelNeedsLogin } from './notificationBridge';
import { resolvePublisher } from './publishers';
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  DEFAULT_SAFETY_SETTINGS,
  EXECUTION_MODES,
  type ChannelStatus,
  type ChannelType,
  type ExecutionMode,
} from './types';

function isChannelType(v: string): v is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(v);
}

function isExecutionMode(v: string): v is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(v);
}

export async function listChannels(input: {
  companyId?: string | null;
  type?: string;
  status?: string;
  includeInactive?: boolean;
}) {
  return prisma.socialChannel.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getChannelById(id: string) {
  return prisma.socialChannel.findUnique({ where: { id } });
}

export async function createChannel(input: {
  companyId?: string | null;
  type: string;
  name: string;
  externalId?: string | null;
  profileUrl?: string | null;
  executionMode: string;
  browserSessionId?: string | null;
  config?: Record<string, unknown>;
  actor?: string | null;
}): Promise<SocialChannel> {
  if (!isChannelType(input.type)) {
    throw new Error(`Invalid channel type: ${input.type}`);
  }
  if (!isExecutionMode(input.executionMode)) {
    throw new Error(`Invalid executionMode: ${input.executionMode}`);
  }
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Channel name is required');

  const channel = await prisma.socialChannel.create({
    data: {
      companyId: input.companyId ?? null,
      type: input.type,
      name,
      externalId: input.externalId ?? null,
      profileUrl: input.profileUrl ?? null,
      status: 'active',
      executionMode: input.executionMode,
      browserSessionId: input.browserSessionId ?? null,
      config: (input.config || {}) as Prisma.InputJsonValue,
      isActive: true,
    },
  });

  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: channel.id,
    action: 'created',
    actor: input.actor,
    metadata: { type: channel.type, executionMode: channel.executionMode },
  });

  return channel;
}

export async function updateChannel(
  id: string,
  patch: {
    name?: string;
    externalId?: string | null;
    profileUrl?: string | null;
    browserSessionId?: string | null;
    config?: Record<string, unknown>;
    executionMode?: string;
    actor?: string | null;
  },
): Promise<SocialChannel> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

  if (patch.executionMode && !isExecutionMode(patch.executionMode)) {
    throw new Error(`Invalid executionMode: ${patch.executionMode}`);
  }

  const channel = await prisma.socialChannel.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: String(patch.name).trim() } : {}),
      ...(patch.externalId !== undefined ? { externalId: patch.externalId } : {}),
      ...(patch.profileUrl !== undefined ? { profileUrl: patch.profileUrl } : {}),
      ...(patch.browserSessionId !== undefined
        ? { browserSessionId: patch.browserSessionId }
        : {}),
      ...(patch.executionMode !== undefined ? { executionMode: patch.executionMode } : {}),
      ...(patch.config !== undefined
        ? { config: patch.config as Prisma.InputJsonValue }
        : {}),
    },
  });

  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: channel.id,
    action: 'updated',
    actor: patch.actor,
    metadata: patch as Record<string, unknown>,
  });

  return channel;
}

export async function pauseChannel(id: string, actor?: string | null): Promise<SocialChannel> {
  const channel = await prisma.socialChannel.update({
    where: { id },
    data: { status: 'paused' },
  });
  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'paused',
    actor,
  });
  return channel;
}

export async function activateChannel(id: string, actor?: string | null): Promise<SocialChannel> {
  const channel = await prisma.socialChannel.update({
    where: { id },
    data: {
      status: 'active',
      isActive: true,
      consecutiveFailures: 0,
    },
  });
  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'activated',
    actor,
  });
  return channel;
}

export async function markNeedsLogin(
  id: string,
  reason?: string,
  actor?: string | null,
): Promise<SocialChannel> {
  const channel = await prisma.socialChannel.update({
    where: { id },
    data: { status: 'needs_login' },
  });
  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'needs_login',
    actor,
    metadata: { reason },
  });
  await notifyChannelNeedsLogin({
    companyId: channel.companyId,
    channelId: id,
    reason,
  });
  return channel;
}

export async function recordFailure(
  id: string,
  errorCode?: string,
  errorMessage?: string,
): Promise<SocialChannel> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');

  const consecutiveFailures = existing.consecutiveFailures + 1;
  const shouldPause =
    consecutiveFailures >= DEFAULT_SAFETY_SETTINGS.pauseAfterConsecutiveFailures;

  const nextStatus: ChannelStatus =
    errorCode === 'channel_needs_login' || errorCode === 'browser_auth_blocked' || errorCode === 'graph_token_expired'
      ? 'needs_login'
      : shouldPause
        ? 'paused'
        : 'error';

  const channel = await prisma.socialChannel.update({
    where: { id },
    data: {
      consecutiveFailures,
      status: nextStatus,
    },
  });

  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'failure_recorded',
    metadata: { errorCode, errorMessage, consecutiveFailures, status: nextStatus },
  });

  if (nextStatus === 'needs_login') {
    await notifyChannelNeedsLogin({
      companyId: channel.companyId,
      channelId: id,
      reason: errorMessage || errorCode,
    });
  }

  return channel;
}

export async function recordSuccess(id: string): Promise<SocialChannel> {
  return prisma.socialChannel.update({
    where: { id },
    data: {
      consecutiveFailures: 0,
      status: 'active',
      isActive: true,
    },
  });
}

export async function verifyChannel(id: string) {
  const channel = await getChannelById(id);
  if (!channel) throw new Error('Channel not found');
  const publisher = resolvePublisher(channel);
  const health = await publisher.verifyChannel(channel);
  if (!health.ok && (CHANNEL_STATUSES as readonly string[]).includes(String(health.status))) {
    await prisma.socialChannel.update({
      where: { id },
      data: { status: String(health.status) },
    });
  }
  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'verified',
    metadata: health as unknown as Record<string, unknown>,
  });
  return health;
}
