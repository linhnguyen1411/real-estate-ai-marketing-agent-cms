import { Prisma, type SocialChannel } from '@prisma/client';
import { encryptAccessToken } from '../../facebook/tokenCrypto';
import { prisma } from '../../prisma';
import { appendAuditLog } from './auditService';
import {
  exchangeForLongLivedToken,
  getFacebookAppCredentials,
} from './graph/facebookGraphClient';
import { notifyChannelNeedsLogin } from './notificationBridge';
import { resolvePublisher } from './publishers';
import type { GraphVerifyDetails } from './publishers/facebookPageGraphPublisher';
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  DEFAULT_SAFETY_SETTINGS,
  EXECUTION_MODES,
  type ChannelConnectionState,
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
  includeDeleted?: boolean;
}) {
  return prisma.socialChannel.findMany({
    where: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.includeInactive ? {} : { isActive: true }),
      ...(input.includeDeleted || input.status === 'deleted' ? {} : { NOT: { status: 'deleted' } }),
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

/** Soft-delete — keep jobs (FK Restrict); hide from default channel lists. */
export async function deleteChannel(id: string, actor?: string | null): Promise<SocialChannel> {
  const existing = await getChannelById(id);
  if (!existing) throw new Error('Channel not found');
  if (existing.status === 'deleted') return existing;

  const channel = await prisma.socialChannel.update({
    where: { id },
    data: {
      status: 'deleted',
      isActive: false,
    },
  });
  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'deleted',
    actor,
  });
  return channel;
}

export async function deleteChannels(
  ids: string[],
  actor?: string | null,
): Promise<{ deleted: SocialChannel[]; skipped: string[] }> {
  const unique = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];
  const deleted: SocialChannel[] = [];
  const skipped: string[] = [];
  for (const id of unique) {
    const existing = await getChannelById(id);
    if (!existing || existing.status === 'deleted') {
      skipped.push(id);
      continue;
    }
    deleted.push(await deleteChannel(id, actor));
  }
  return { deleted, skipped };
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

  const connectionState: ChannelConnectionState | undefined =
    errorCode === 'graph_token_expired' || errorCode === 'channel_disconnected'
      ? errorCode === 'channel_disconnected'
        ? 'disconnected'
        : 'expired'
      : errorCode === 'graph_permission_denied'
        ? 'permission_error'
        : undefined;

  const channel = await prisma.socialChannel.update({
    where: { id },
    data: {
      consecutiveFailures,
      status: nextStatus,
      ...(connectionState ? { connectionState } : {}),
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
      connectionState: 'connected',
    },
  });
}

export function mapHealthToConnectionState(
  health: GraphVerifyDetails | { ok: boolean; status: string; errorCode?: string },
): ChannelConnectionState {
  if ('connectionState' in health && health.connectionState) {
    return health.connectionState as ChannelConnectionState;
  }
  if (health.ok) return 'connected';
  if (health.errorCode === 'graph_token_expired' || health.errorCode === 'channel_disconnected') {
    return health.errorCode === 'channel_disconnected' ? 'disconnected' : 'expired';
  }
  if (health.errorCode === 'graph_permission_denied') return 'permission_error';
  if (health.status === 'needs_login') return 'expired';
  return 'disconnected';
}

export async function connectPageToken(
  channelId: string,
  input: {
    pageAccessToken: string;
    pageId?: string | null;
    pageName?: string | null;
    actor?: string | null;
  },
): Promise<SocialChannel> {
  const existing = await getChannelById(channelId);
  if (!existing) throw new Error('Channel not found');

  let token = String(input.pageAccessToken || '').trim();
  if (!token) throw new Error('pageAccessToken is required');

  let tokenExpiresAt: Date | null = null;
  const creds = getFacebookAppCredentials();
  if (creds) {
    const exchanged = await exchangeForLongLivedToken(token, creds.appId, creds.appSecret);
    if ('accessToken' in exchanged) {
      token = exchanged.accessToken;
      if (exchanged.expiresIn && exchanged.expiresIn > 0) {
        tokenExpiresAt = new Date(Date.now() + exchanged.expiresIn * 1000);
      }
    }
  }

  const encrypted = encryptAccessToken(token);
  const prevConfig =
    existing.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
      ? (existing.config as Record<string, unknown>)
      : {};
  const nextConfig: Record<string, unknown> = {
    ...prevConfig,
    pageAccessTokenEncrypted: encrypted,
  };
  delete nextConfig.pageAccessToken;
  if (input.pageId) nextConfig.pageId = String(input.pageId).trim();
  if (input.pageName) nextConfig.pageName = String(input.pageName).trim();

  const channel = await prisma.socialChannel.update({
    where: { id: channelId },
    data: {
      ...(input.pageId ? { externalId: String(input.pageId).trim() } : {}),
      ...(input.pageName ? { name: String(input.pageName).trim() || existing.name } : {}),
      config: nextConfig as Prisma.InputJsonValue,
      connectionState: 'connected',
      status: 'active',
      isActive: true,
      consecutiveFailures: 0,
      lastVerifyError: null,
      ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
    },
  });

  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: channelId,
    action: 'connected',
    actor: input.actor,
    metadata: {
      pageId: input.pageId || channel.externalId,
      exchanged: Boolean(creds),
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
    },
  });

  return channel;
}

export async function verifyChannel(id: string) {
  const channel = await getChannelById(id);
  if (!channel) throw new Error('Channel not found');
  const publisher = resolvePublisher(channel);
  const health = (await publisher.verifyChannel(channel)) as GraphVerifyDetails;
  const skippedCmsBrowserVerify = health.errorCode === 'browser_verify_skipped_cms';
  const connectionState = skippedCmsBrowserVerify
    ? ((channel.connectionState as ChannelConnectionState | null) ?? 'connected')
    : mapHealthToConnectionState(health);
  const statusUpdate = skippedCmsBrowserVerify
    ? {}
    : health.ok
      ? { status: 'active' as const }
      : (CHANNEL_STATUSES as readonly string[]).includes(String(health.status))
        ? { status: String(health.status) }
        : {};

  await prisma.socialChannel.update({
    where: { id },
    data: {
      ...statusUpdate,
      lastVerifiedAt: new Date(),
      lastVerifyError: health.ok || skippedCmsBrowserVerify
        ? null
        : health.details || health.errorCode || 'verify failed',
      connectionState,
      ...(health.tokenExpiresAt !== undefined
        ? { tokenExpiresAt: health.tokenExpiresAt }
        : {}),
    },
  });

  await appendAuditLog({
    companyId: channel.companyId,
    entityType: 'SocialChannel',
    entityId: id,
    action: 'verified',
    metadata: {
      ...(health as unknown as Record<string, unknown>),
      connectionState,
      skippedCmsBrowserVerify,
    },
  });
  return { ...health, connectionState };
}
